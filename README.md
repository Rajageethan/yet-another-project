# DSA Mentor

One DSA problem a day. The student explains their thinking in a chat; an LLM mentor (Groq) guides them through
*Understand → Examples → Brute force → Optimize → Code → Test → Complexity → Reflect*, watches the code editor live,
and never hands out the solution. See [`../PLAN.md`](../PLAN.md) for the full product plan.

## Run it locally

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open http://localhost:3000 and use **Local dev login** (any name + email).

Then add a Groq key, either:

- **Shared:** put `GROQ_API_KEY=gsk_…` in `.env` (every user shares it, capped at `DAILY_TURN_CAP` replies/day each), or
- **Per student:** each student pastes their own free key in **Settings** (stored AES-encrypted, no cap).

Copy `.env.example` to `.env` on a fresh checkout and set `AUTH_SECRET` (`npx auth secret`).

## How it fits together

| Piece | Where |
| --- | --- |
| Workspace (chat, Monaco editor, tests) | `src/app/(app)/today/Workspace.tsx` |
| Mentor turn: prompt, tools, streaming, summaries | `src/lib/mentor/` |
| Groq client: retries, model fallback, daily cap | `src/lib/llm/groq.ts` |
| In-browser runners (Pyodide / JS worker) | `public/workers/`, `src/lib/runner/client.ts` |
| Daily pick (weakness, roadmap, difficulty, reviews) | `src/lib/picker.ts` |
| Streak, mastery, spaced repetition on solve | `src/lib/progress.ts` |
| Problem bank (generated) | `scripts/problems.py` → `src/problems/bank.json` |

### Live code watching

The editor sends a snapshot 2.5 s after typing stops. Each mentor turn gets the current code with line
numbers plus a diff since the mentor's last reply. The mentor can call `highlight_lines` (shown in the editor) and
`set_stage` (moves the stage bar). With **Mentor can interrupt** on, a failed test run makes the mentor speak up (at most
once per 90 s). Pasting 8+ lines is flagged to the mentor.

### Problems

Problems live in `scripts/problems.py` with a reference solution and random-input generator each. Running
`npm run problems` checks the hand-written examples against the reference solution and regenerates hidden tests
into `src/problems/bank.json`. To add a problem, add a `@problem(...)` block and rerun.

### Importing more problems (LeetCodeDataset)

[LeetCodeDataset](https://huggingface.co/datasets/newfacade/LeetCodeDataset) (Apache-2.0) supplies inputs and
reference solutions; we never publish LeetCode's wording.

1. Download `LeetCodeDataset-train.jsonl` and `LeetCodeDataset-test.jsonl` into `.cache/leetcodedataset/`.
2. `python -I scripts/import_leetcode.py --per-topic 6` picks problems per roadmap topic and runs the dataset's
   reference solution **and** its second, independent solution in a sandboxed subprocess
   (`scripts/sandbox_runner.py`: import allowlist, no file/exec builtins, timeout). A test is kept only when the
   dataset's output and both solutions agree. Problems that accept multiple valid answers, modify input in place,
   or need linked lists/trees are skipped. Results go to `scripts/imports/lc-<id>.json` as `pending`.
3. Open **/admin/review** (dev only; `ADMIN_EMAILS` limits who can open it). "Draft with AI" asks the mentor model
   for a reworded title, statement, constraints and mentor notes. Compare it against the original (shown from
   `.cache/`, never published), edit, and **Approve & publish**. Approved problems are written to
   `src/problems/imported.json` and join the daily pick right away.

Rerunning the importer only adds new problems; reviewed files in `scripts/imports/` are left alone.

## Known limits (Phase 1)

- Tests run in the browser, so a determined student could fake a submit. Moving grading to a server-side Judge0 is planned.
- Python and JavaScript only.
- SQLite. Switch the Prisma datasource to Postgres for a hosted deployment.
