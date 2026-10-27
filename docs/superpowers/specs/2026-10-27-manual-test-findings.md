# Manual test findings (2026-10-27) and fix decisions

Source: Playwright walk-through of the full daily loop (sign-in → onboarding → chat → run → hint → paste → submit → progress/history/settings), two users, Python and JavaScript.

## Findings and the behavior we want instead

1. **Pasted code earns full credit.** A 10-line paste was flagged but the mentor never asked about it, the assessment gave 75/100 (complexity 3/5, edge cases 4/5 with neither discussed), and the user stepped up from Easy to Medium.
   - Right after a flagged paste (≥ 8 lines), the mentor speaks up unprompted and asks the student to explain the pasted code. This follow-up ignores the "Mentor can interrupt" toggle (that toggle is about failed runs) but respects the same 90 s gap as other unprompted turns.
   - A paste is **explained** when the non-hint student messages sent after the *latest* paste event total at least 15 words.
   - With an unexplained paste at submit: thinking score is capped at 60, the user's level does not step up, and the re-solve interval does not grow. The assessor prompt is told about it so the written feedback mentions it.
2. **Stage bar jumps.** After failed runs the mentor moved the stage to Brute force, once skipping Examples.
   - Unprompted turns (failed-run and paste follow-ups) never change the stage.
   - Other turns may move back freely but forward by at most one stage.
3. **Paste event missing from the live chat.** It shows only in replay. It must appear in the chat as soon as the snapshot is saved, like run events do.
4. **Streak header stale after a solve.** It shows "0 days" until a full reload. It must show the new streak right after the redirect to the session page.
5. **Chat squeezed on short desktop screens.** At 1035×580 the chat showed one line. At that size the chat must be at least 160 px tall, with the problem panel scrolling instead; on a 1440×900 screen a typical problem statement must still show without scrolling.
6. **Small mismatches.**
   - Onboarding asks for ratings on topics that have no problems (Linked List, Trees, Heaps). Only topics with at least one problem should be rated.
   - Progress says re-solves come back after "3, 7 and 21 days"; the code's steps are 3, 7, 21, 60. The copy must come from the same constant.

## Out of scope
Server-side grading, tool calling, new problems.
