# Manual Test Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every problem found in the 2026-10-27 manual Playwright test of DSA Mentor.

**Architecture:** Rule logic (stage moves, paste detection, scoring caps, level step-up, review steps) moves into small pure modules with no `server-only`/db imports, so Vitest can test it; the existing server modules call those rules. UI fixes (live paste event, streak refresh, chat layout) are verified in the running app with Playwright.

**Tech Stack:** Next.js 16.4 (App Router), React 19, Prisma 7 + SQLite, Groq via `openai` SDK, Vitest (new, dev only), Playwright MCP for manual checks.

**Spec:** `docs/superpowers/specs/2026-10-27-manual-test-findings.md`

## Global Constraints

- All commands run from `dsa-mentor/`. Read `CLAUDE.md` and `AGENTS.md` first; check `node_modules/next/dist/docs/` before using a Next API you haven't used in this repo.
- Pure rule modules must not import `server-only`, `@/lib/db` or anything that does (Vitest would fail to import them).
- Paste flag threshold stays 8 lines (`PASTE_FLAG_LINES` in the snapshot route).
- Unprompted-turn gap stays 90 s (`INTERRUPT_GAP_MS` in `src/lib/mentor/engine.ts`).
- Explained paste = ≥ 15 words across non-hint student messages after the latest paste event.
- Unexplained paste → thinking score cap 60, no level step-up, no review-interval growth.
- Review steps stay `[3, 7, 21, 60]` days.
- Every task ends with `npm run typecheck`, `npm run lint` and `npm test` passing.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Explanation split over several short messages** ("ok so", "line 6 checks the complement first", …): this must count as explained once the total reaches 15 words. Pinned in Task 4.
2. **A second paste after the first was explained**: only the latest paste counts, so this must be unexplained again. Pinned in Task 4.
3. **Paste while a mentor reply is streaming**: the follow-up is skipped (the busy guard), but the paste event still appears in chat and the in-flight turn sees it. Checked in Task 3, Step 7.
4. **"Mentor can interrupt" switched off**: failed runs stay silent but a paste still gets the follow-up. Checked in Task 3, Step 7.
5. **Phone layout (390×844)**: the Problem/Chat/Code tabs must look and scroll the same after the desktop flex change. Checked in Task 6, Step 3.

---

### Task 1: Test harness, git, and onboarding rates only active topics

**Files:**
- Create: `vitest.config.ts`, `src/problems/index.test.ts`
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`)
- Modify: `src/problems/index.ts` (add `ACTIVE_TOPICS`)
- Modify: `src/app/onboarding/page.tsx:108`, `src/app/onboarding/actions.ts:13`, `src/app/(app)/progress/page.tsx:67`, `src/lib/picker.ts:31`

**Interfaces:**
- Produces: `ACTIVE_TOPICS: readonly { id: string; name: string }[]`, i.e. the `TOPICS` entries (in roadmap order) that have at least one problem in `problems`.
- Produces: `npm test` runs `src/**/*.test.ts` in a Node environment, with the `@` alias pointing at `src`.

- [ ] **Step 1: Initialise git and commit the current tree as a baseline**

```bash
git init
git add -A
git status --short | grep -E "\.env$|dev\.db|node_modules|\.next/" && echo "STOP: ignored file staged"
git commit -m "chore: baseline before manual-test fixes"
```
Expected: no "STOP" line. `.env`, `prisma/dev.db`, `.cache/` and `src/generated/` are ignored by the existing `.gitignore`.

- [ ] **Step 2: Add Vitest**

Run `npm install -D vitest`, add `"test": "vitest run"` to `scripts`, and create `vitest.config.ts` (`defineConfig` from `vitest/config`, `resolve.alias` `@` → `path.resolve(__dirname, "src")`, `test.environment: "node"`, `test.include: ["src/**/*.test.ts"]`).

- [ ] **Step 3: Write the failing test** in `src/problems/index.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { ACTIVE_TOPICS, TOPICS, problems } from "@/problems";

describe("ACTIVE_TOPICS", () => {
  it("lists only topics that have problems, in roadmap order", () => {
    for (const t of ACTIVE_TOPICS) expect(problems.some((p) => p.topic === t.id)).toBe(true);
    const order = ACTIVE_TOPICS.map((t) => TOPICS.findIndex((x) => x.id === t.id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it("includes every roadmap topic that has a problem", () => {
    const withProblems = TOPICS.filter((t) => problems.some((p) => p.topic === t.id)).map((t) => t.id);
    expect(ACTIVE_TOPICS.map((t) => t.id)).toEqual(withProblems);
  });
});
```

- [ ] **Step 4: Run `npx vitest run src/problems/index.test.ts`.** Expected: FAIL, `ACTIVE_TOPICS` is undefined.

- [ ] **Step 5: Implement `ACTIVE_TOPICS`** in `src/problems/index.ts` (below `problems`), then use it:
  - Onboarding page and action: replace `TOPICS.slice(0, 8)` with `ACTIVE_TOPICS`. Keep `core = ratings.slice(0, 4)` as it is.
  - Progress page: replace the local `available` with `ACTIVE_TOPICS`.
  - `picker.ts`: replace its local `available` the same way.

- [ ] **Step 6: Verify.** Run `npm test && npm run typecheck && npm run lint`. Expected: all pass.

- [ ] **Step 7: Commit:** `git commit -am "fix: onboarding only rates topics that have problems"` (stage the new files first).

---

### Task 2: Clamp stage moves

**Files:**
- Modify: `src/lib/mentor/stages.ts`, `src/lib/mentor/engine.ts:135-138`
- Test: `src/lib/mentor/stages.test.ts`

**Interfaces:**
- Produces: `nextStage(current: string, proposed: StageId | null, unprompted: boolean): StageId`.
- Consumes: `MentorInput["kind"]` from engine.ts. A turn is unprompted when its kind is `"run_failed"` or `"pasted"` (`"pasted"` is added in Task 3; include it in the check now).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { nextStage } from "./stages";

describe("nextStage", () => {
  it("keeps the stage when no tag was given", () => expect(nextStage("examples", null, false)).toBe("examples"));
  it("never moves on unprompted turns", () => {
    expect(nextStage("examples", "brute_force", true)).toBe("examples");
    expect(nextStage("code", "understand", true)).toBe("code");
  });
  it("moves forward at most one stage", () => {
    expect(nextStage("understand", "brute_force", false)).toBe("examples");
    expect(nextStage("understand", "examples", false)).toBe("examples");
  });
  it("allows moving back any distance", () => expect(nextStage("test", "understand", false)).toBe("understand"));
  it("treats an unknown current stage as understand", () => expect(nextStage("bogus", "code", false)).toBe("examples"));
});
```

- [ ] **Step 2: Run `npx vitest run src/lib/mentor/stages.test.ts`.** Expected: FAIL, `nextStage` is not exported.

- [ ] **Step 3: Implement `nextStage`** in `stages.ts` using `stageIndex`. In `runTurn`, replace `if (stage && stage !== session.stage)` with a comparison against `nextStage(session.stage, stage, input.kind === "run_failed" || input.kind === "pasted")`. Write the result to the DB and send it only when it differs from `session.stage`.

- [ ] **Step 4: Verify.** Run `npm test && npm run typecheck && npm run lint`. Expected: pass. (The `"pasted"` comparison type-checks only after Task 3 widens `MentorInput`. If you run Task 2 alone, add `| { kind: "pasted" }` to `MentorInput` here instead.)

- [ ] **Step 5: Commit:** `git commit -am "fix: stage moves forward one step at a time and never on unprompted turns"`

---

### Task 3: Paste shows in chat and the mentor asks about it

**Files:**
- Create: `src/lib/mentor/paste.ts` (only the constants and `pasteEventContent` in this task; Task 4 adds detection)
- Modify: `src/app/api/session/[id]/snapshot/route.ts`, `src/app/api/session/[id]/chat/route.ts:11`, `src/lib/mentor/engine.ts`, `src/app/(app)/today/Workspace.tsx` (`MentorInput` at :26, `sendSnapshot` at :107-123, `askMentor`)

**Interfaces:**
- Produces in `paste.ts`: `PASTE_EVENT_PREFIX = "The student pasted"`, and `pasteEventContent(lines: number): string`, which returns `` `${PASTE_EVENT_PREFIX} ${lines} lines of code into the editor at once.` ``.
- Produces in `engine.ts`: `interruptGapElapsed(session: Pick<Session, "lastInterruptAt">): boolean`. `canInterrupt` becomes `user.mentorInterrupt && interruptGapElapsed(session)`.
- Produces: `MentorInput` gains `{ kind: "pasted" }`, both in engine.ts and in the copy in Workspace.tsx.
- Produces: the snapshot route responds `{ ok: true, changed: boolean, event?: string, followUp?: boolean }`. `event` is set when the snapshot was flagged as a paste. `followUp` is `pasted && interruptGapElapsed(session)`.
- Produces: the paste event message is stored with `meta: JSON.stringify({ paste: pastedLines })`. Task 4 reads it.

- [ ] **Step 1: Snapshot route.** Store the event using `pasteEventContent(pastedLines)` and the `meta` above, and return `event` and `followUp`.

- [ ] **Step 2: Chat route.** Add `"pasted"` to `kinds`.

- [ ] **Step 3: Engine.**
  - Add `interruptGapElapsed`.
  - Add a `"pasted"` branch in `runTurn` next to `run_failed`. It sets `lastInterruptAt: new Date()` and uses this instruction text exactly: `"You are speaking up unprompted because the student just pasted a block of code (see the latest event). Ask them to explain the pasted code in their own words, starting with the line that does the key work (name its line number). Keep it to 1–2 sentences. Don't say whether it is correct and don't give the fix."`

- [ ] **Step 4: Workspace.**
  - In `sendSnapshot`, parse the JSON response.
  - If `event` is present, append `{ id: \`ev-${Date.now()}\`, role: "event", content: event }`, the same way the run handler does at :376.
  - If `followUp` is true, call `askMentorRef.current?.({ kind: "pasted" })`.
  - `askMentorRef` is a `useRef` assigned from `askMentor` in an effect. Calling `askMentor` directly would create a dependency cycle, because `askMentor` already depends on `flushSnapshot`.

- [ ] **Step 5: Static checks.** Run `npm run typecheck && npm run lint && npm test`. Expected: pass.

- [ ] **Step 6: Manual check, happy path.**
  - Start `npm run dev` and sign in with Playwright as a new dev user.
  - On `/today`, paste 10 lines through Monaco: `editor.trigger("keyboard", "paste", { text })`, with `editor = window.monaco.editor.getEditors()[0]`.
  - Expected within about 15 s:
    - The chat shows "The student pasted 10 lines of code into the editor at once."
    - A "Mentor · looking at your code" reply follows, asking for an explanation and naming a line.
    - The stage bar does not move.

- [ ] **Step 7: Manual check, edge cases (Review Focus 3 and 4).**
  - Untick "Mentor can interrupt", wait 90 s, and paste again. Expected: the event and a follow-up still appear.
  - Then click Run with failing code. Expected: no unprompted reply.
  - Send a chat message, and paste while that reply is still streaming. Expected: the paste event appears and there is no second unprompted reply.

- [ ] **Step 8: Commit:** `git commit -am "feat: show paste events live and have the mentor ask about pasted code"` (stage `paste.ts`).

---

### Task 4: Unexplained paste limits score, level and review interval

**Files:**
- Modify: `src/lib/mentor/paste.ts` (add detection)
- Create: `src/lib/mentor/score.ts`, `src/lib/progress-rules.ts`
- Modify: `src/lib/mentor/assess.ts`, `src/lib/progress.ts`, `src/app/(app)/progress/page.tsx:221`
- Test: `src/lib/mentor/paste.test.ts`, `src/lib/mentor/score.test.ts`, `src/lib/progress-rules.test.ts`

**Interfaces:**
- Consumes: `PASTE_EVENT_PREFIX` and the `{ paste: n }` event meta from Task 3.
- Produces in `paste.ts`:
  - `PASTE_EXPLAIN_MIN_WORDS = 15`
  - `type TimelineMsg = { role: string; content: string; meta?: string | null }`
  - `hasUnexplainedPaste(messages: TimelineMsg[]): boolean`. A paste event is a `role: "event"` message whose meta has `paste`, or whose content starts with `PASTE_EVENT_PREFIX`; the prefix check covers old rows. A hint request is a `role: "user"` message whose meta has `hint`. Count the words (split on whitespace) of the non-hint `user` messages after the latest paste event.
- Produces in `score.ts`: `RUBRIC` and `RubricKey`, moved from assess.ts (re-export them from assess.ts so existing imports keep working), `PASTE_SCORE_CAP = 60`, and `thinkingScore(scores: Record<RubricKey, number>, hintsUsed: number, unexplainedPaste: boolean): number`.
- Produces in `progress-rules.ts`:
  - `REVIEW_STEPS = [3, 7, 21, 60] as const`
  - `solvedWell(o: { thinkingScore: number; hintsUsed: number; unexplainedPaste: boolean }): boolean`, which is true when the score is ≥ 65, hints ≤ 1 and there is no paste.
  - `nextLevel(o: { level: number; problemLevel: number; thinkingScore: number; hintsUsed: number; unexplainedPaste: boolean }): number`. This is the current rule from `progress.ts:58-60` with `&& !unexplainedPaste` added.
  - `reviewStepsText(): string`, built with `Intl.ListFormat("en", { type: "conjunction" })`.
- Produces: `assessSession(user, session)` now returns `{ assessment, unexplainedPaste }`. `assessment` has exactly the old return shape, because it is spread into a Prisma upsert.

- [ ] **Step 1: Write the failing tests.**

`paste.test.ts`, built with a helper `ev = (n) => ({ role: "event", content: pasteEventContent(n), meta: JSON.stringify({ paste: n }) })`:
- no paste event → `false`
- paste with nothing after it → `true`
- paste, then one 15-word user message → `false`
- paste, then one 14-word message → `true`
- paste, then "ok so" plus a 13-word message (15 words in total) → `false` (Review Focus 1)
- paste, a 15-word message, then a second paste → `true` (Review Focus 2)
- paste, then a user message with `meta: JSON.stringify({ hint: 1 })` of 20 words → `true`
- an old event with no meta whose content starts with `PASTE_EVENT_PREFIX` → `true`

`score.test.ts`:
- `thinkingScore(all 4s, 0, false) === 80`
- `thinkingScore(all 4s, 0, true) === 60`
- `thinkingScore(all 2s, 0, true) === 40` (the cap never raises a score)
- `thinkingScore(all 4s, 1, false) === 75`

`progress-rules.test.ts`:
- `nextLevel({ level: 1, problemLevel: 1, thinkingScore: 75, hintsUsed: 1, unexplainedPaste: false }) === 2`
- the same with `unexplainedPaste: true` → `1`
- `thinkingScore: 74` → `1`
- `level: 3` → `3`
- `problemLevel: 1, level: 2` → `2`
- `solvedWell({ thinkingScore: 65, hintsUsed: 1, unexplainedPaste: false }) === true`, and `false` with a paste
- `reviewStepsText() === "3, 7, 21, and 60"`

- [ ] **Step 2: Run `npm test`.** Expected: these three files FAIL on missing exports.

- [ ] **Step 3: Implement the pure modules.** Move `RUBRIC`, `RubricKey` and `thinkingScore` out of assess.ts, and `REVIEW_STEPS` out of progress.ts.

- [ ] **Step 4: Wire them in.**
  - **assess.ts:**
    - Compute `unexplainedPaste = hasUnexplainedPaste(messages)` and pass it to `thinkingScore`.
    - Add this line after the `Paste events:` line in the user prompt: `` `Unexplained paste: ${unexplainedPaste ? "yes — the student pasted code and never explained it; mention this in workOn" : "no"}.` ``
    - Return `{ assessment, unexplainedPaste }`.
  - **progress.ts:**
    - Destructure the new return value.
    - Replace the `wentWell` expression with `solvedWell(...)` and the level block with `nextLevel(...)`.
  - **progress page:** change the copy to `` `Nothing due. Solved problems come back after ${reviewStepsText()} days.` ``.

- [ ] **Step 5: Verify.** Run `npm test && npm run typecheck && npm run lint`. Expected: all pass.

- [ ] **Step 6: Commit:** `git commit -am "fix: unexplained pastes cap the thinking score and block level step-up"` (stage the new files).

---

### Task 5: Streak header updates right after a solve

**Files:**
- Modify: `src/app/(app)/today/Workspace.tsx:399-401`

- [ ] **Step 1: Refresh after the redirect.** In the `res.solved` branch, call `router.refresh()` right after `router.push(\`/session/${sessionId}\`)`. The `(app)` layout that renders `AppHeader` is kept across client navigation. `router.refresh()` re-renders server components; the `refresh()` in `next/cache` works only in Server Actions, so it can't be used here.

- [ ] **Step 2: Static checks.** Run `npm run typecheck && npm run lint`. Expected: pass.

- [ ] **Step 3: Manual check.**
  - With Playwright, sign in as a new dev user and solve today's problem.
  - Get a correct solution by typing it, or with `model.setValue` from the 2026-10-27 test.
  - Click Submit.
  - Expected, with no reload: on `/session/<id>`, `a[aria-label^="Current streak"]` reads "Current streak: 1 day".
  - If it still reads 0 days, replace both calls with `window.location.assign(\`/session/${sessionId}\`)` and check again.

- [ ] **Step 4: Commit:** `git commit -am "fix: refresh header streak after solving"`

---

### Task 6: Chat keeps its height on short desktop screens

**Files:**
- Modify: `src/app/(app)/today/Workspace.tsx:455` (problem panel), `:529` (chat log)

- [ ] **Step 1: Change the flex classes.**
  - On the problem panel, replace `lg:flex-none lg:overflow-visible` with `lg:flex-[0_1_auto] lg:min-h-24 lg:overflow-y-auto`.
  - On the chat log, add `lg:flex-[1_1_0%] lg:min-h-40`.
  - The problem panel keeps its content height until space runs out, then scrolls; the chat never goes below 160 px.

- [ ] **Step 2: Measure on desktop with Playwright on `/today`.** Use `document.querySelector('[aria-label="Conversation with mentor"]').clientHeight` and the problem panel's `scrollHeight`/`clientHeight`.
  - At 1035×580: chat height ≥ 160, and the problem panel's `scrollHeight > clientHeight`.
  - At 1440×900: the problem panel's `scrollHeight === clientHeight`.

- [ ] **Step 3: Check the phone layout (Review Focus 5).**
  - At 390×844, switch through the Problem, Chat and Code tabs.
  - Expected: each fills the screen and scrolls on its own, and `document.documentElement.scrollWidth <= innerWidth`.

- [ ] **Step 4: Commit:** `git commit -am "fix: keep the mentor chat usable on short screens"`

---

### Task 7: Full regression pass

- [ ] **Step 1: Static checks.** Run `npm test && npm run typecheck && npm run lint && npm run build`. Expected: all pass.

- [ ] **Step 2: Repeat the 2026-10-27 walk-through in Playwright with a new user.**
  - Sign in, onboard, explain the problem, run buggy code, take a hint, paste the fix, then submit without explaining it.
  - Expected:
    - Onboarding lists only the active topics.
    - The paste event and the mentor's follow-up appear live.
    - The stage never moves on unprompted turns.
    - The session page shows a thinking score ≤ 60 and mentions the paste in "Work on".
    - Progress shows the level still **Easy**.
    - The header shows "1 day" without a reload.
    - The Progress copy reads "3, 7, 21, and 60 days".

- [ ] **Step 3: Check that explaining the paste restores normal scoring.**
  - With a second new user, paste a solution, then send a message of 15 or more words explaining it, then submit.
  - Expected: the score is not capped at 60 (rubric average × 20 minus the hint penalty).

- [ ] **Step 4: Clean up test data.** Delete the test users from `prisma/dev.db`, through Settings → Delete account for each one.
