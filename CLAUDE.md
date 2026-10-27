# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

DSA Mentor: one personalized DSA problem a day, with an LLM mentor (Groq, via the `openai` SDK) that guides the student through stages in a chat, watches their code live, and never gives the solution. The product plan is `../PLAN.md`; `README.md` covers setup and the problem-import workflow.

## Stack notes

- **Next.js 16.4 (App Router, Turbopack) + React 19.3.** Per `AGENTS.md`, APIs may differ from what you know; check `node_modules/next/dist/docs/` before using unfamiliar Next APIs. Route handlers use the generated `RouteContext<"/api/...">` type, and `params` is a Promise.
- **Prisma 7** with the `prisma-client` generator writing to `src/generated/prisma` (gitignored; regenerated on `npm install` via `postinstall`). Import the client from `@/generated/prisma/client`, never `@prisma/client`. SQLite is accessed through the `better-sqlite3` driver adapter (`src/lib/db.ts`); the datasource URL comes from `prisma.config.ts` / `DATABASE_URL`.
- **Auth.js v5** (`src/auth.ts`): JWT sessions; the `jwt` callback upserts the `User` row by email and stores its id. With `AUTH_DEV_LOGIN=true` (dev only) you can sign in with any name and email.
- Tailwind v4 through the `@tailwindcss/turbopack` loader (`next.config.ts`).
- Path alias `@/*` → `src/*`. Server-only modules start with `import "server-only"`.

## Commands

Run from `dsa-mentor/`:

```bash
npm install                 # also runs prisma generate
npx prisma migrate dev      # apply migrations / create a new one after editing prisma/schema.prisma
npm run dev                 # http://localhost:3000
npm run build
npm run lint                # eslint (next core-web-vitals + typescript)
npm run typecheck           # next typegen && tsc --noEmit (typegen is needed for RouteContext types)
npm run problems            # python scripts/problems.py: verifies + regenerates src/problems/bank.json
python -I scripts/import_leetcode.py --per-topic 6   # see README "Importing more problems"
```

There is no test suite. Verify changes with `typecheck`, `lint`, and by running the app.

## Architecture

### Request flow for a day's work
1. `src/lib/picker.ts` `getToday()` picks today's problem once per user per local day (`dayKey(user.timezone)`) and stores it in `DailyAssignment`. The score is weakness + roadmap fit + difficulty fit + review due, with a seeded RNG for tie-breaks. `getOrCreateSession()` creates the `Session` row with the starter code.
2. `src/app/(app)/today/Workspace.tsx` (a large client component) holds the chat, Monaco editor, stage bar and test panel. It talks to `src/app/api/session/[id]/*`:
   - `snapshot`: saves code about 2.5 s after typing stops. Pasting 8 or more lines increments `pasteFlags` and adds an `event` message.
   - `chat`: an SSE stream from `mentorStream()` (`src/lib/mentor/engine.ts`). The input `kind` is one of `start | message | hint | run_failed | retry`.
   - `run`: records client-side test results as an `event` message and returns `interrupt: true` when the mentor may speak up (failed run, `mentorInterrupt` on, at most once every 90 s).
   - `hidden`: hands out hidden tests only at submit time.
   - `submit`: checks that the client-reported pass count covers every test, then `completeSession()` in `src/lib/progress.ts` runs the LLM assessment and updates streak/freezes, topic mastery, user level and the spaced-repetition `ReviewSchedule` in one transaction.
3. Every route handler authorizes with `getOwnedSession(id)` from `src/lib/session.ts`; pages use `requireUser()`.

### Mentor engine (`src/lib/mentor/`)
- **No function/tool calling.** `PLAN.md` describes tools such as `advance_stage` and `highlight_lines`, but they proved unreliable on the free-tier models. Instead:
  - The model begins each reply with a `[[stage:<id>]]` tag. `streamReply()` holds the tag back, parses it and strips it. Past assistant messages are replayed with their tag (from `Message.meta.stage`) so the model keeps using the format.
  - Editor highlights come from parsing "line N" / "lines N-M" mentions in the reply text (`lineMentions`).
  - The streamed reply is cut off at its first `?` outside code fences, or after about 110 words.
- Context is kept small for Groq's free-tier token budgets: the system prompt (`prompt.ts`, built from the problem's `mentorNotes`, the current stage's guide in `stages.ts`, guidance style and running summary), plus the last `WINDOW` (10) messages after `session.summarizedCount`, plus a workspace block (line-numbered code and a diff against `session.lastMentorCode`). After each turn, older messages are folded into `session.summary` by the fast model (`maybeSummarize`, fire-and-forget).
- `Message.role` is `user | assistant | event`. Events (test runs, pastes, submits) reach the model as `[Event] ...` user notes; consecutive user messages are merged.
- Hint ladder (`HINT_LEVELS` in `prompt.ts`): each Hint press raises `hintsUsed` by one level. `hintPenalty` lowers the thinking score in `assess.ts`.

### LLM client (`src/lib/llm/groq.ts`)
- `getLlm(user)` uses the user's own key (`groqKeyEnc`, AES-GCM with a key derived from `AUTH_SECRET` in `src/lib/crypto.ts`) or falls back to the shared `GROQ_API_KEY`. Only shared-key turns count toward `DAILY_TURN_CAP` (`UsageDay` table).
- `withFallback` retries 429/5xx once, then moves to the next model, since each Groq model has its own rate budget. Model IDs come from env vars (`MODELS`). `gpt-oss` models get `reasoning_effort: "low"`.
- Errors surface as `LlmError` with code `no_key | cap | rate_limit | upstream`. Inside the SSE stream they are sent as `{type:"error"}` events, because the HTTP status is already 200.

### Problems (`src/problems/`)
- `bank.json` is **generated**; edit `scripts/problems.py` instead (one `@problem(...)` block per problem, each with a reference solution and a random-input generator) and run `npm run problems`.
- `imported.json` is written by the `/admin/review` page (`src/lib/imports/store.ts`) from `scripts/imports/lc-*.json`, which `scripts/import_leetcode.py` produces. That importer executes dataset solutions in `scripts/sandbox_runner.py` (import allowlist, timeout); run it with `python -I`. Original LeetCode text in `.cache/` must never be published, only the reworded drafts.
- `index.ts` merges both into `problems` and defines `Problem`, `TOPICS` (roadmap order) and `toPublic()`. **`hiddenTests`, `mentorNotes`, `pattern` and `source` must never reach the browser**; pass `toPublic(problem)` to client components.
- `compare` (`exact | unordered | unordered_deep`) controls how the runner compares outputs; float values match within 1e-5 relative tolerance.

### Code execution (browser only)
`src/lib/runner/client.ts` runs code in Web Workers from `public/workers/` (`python-runner.js` loads Pyodide; `js-runner.js` runs plain JS). The workers are static files, not bundled, so they cannot use imports from `src/`. Time limits are 6 s for Python and 3 s for JS; the worker is killed when the limit is hit. Grading is client-side in v1, so the submit route trusts the reported counts (a known limitation).

### Dates
All day-based logic (assignments, streaks, reviews, usage caps) uses `YYYY-MM-DD` strings in the user's timezone via `src/lib/dates.ts`, not `Date` objects.
