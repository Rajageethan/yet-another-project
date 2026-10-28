# Mentor quality report: second evaluation (2026-10-28)

Same 9 scenarios as `2026-10-27T17-48-17`, after the "meet the student where they are" change (stage may jump
forward up to Code; prompt rules on misconceptions, building on insights, no re-asking, no method-spelling
questions). One run per scenario, so expect noise of about ±1–2 points per row.

| Scenario | Judge before → after | My score before → after | What changed |
|---|---|---|---|
| strong | 7 → 6 | 5 → 7 | Jumped straight to Optimize and asked the one sharp question (check before insert). Then looped asking the student to dictate code in chat (partly a simulator artifact: the student's chat code never reaches the editor) |
| misread | 9 → 8 | 7 → 5 | Regressed: opened with "Right, we need the two numbers…" (agreed with the misreading), then stated "the problem asks for the indices" |
| lost | 5 → 6 | 5 → 5 | Still ignored the stack insight the student voiced. Nice new concrete step (remove adjacent pairs from `{[()]}`), then an abstract "examined/worst case" question the student couldn't parse, asked twice |
| answer_seeker | 8 → 7 | 7 → 7 | Never gave code, got the student to state the output and edge cases. Last question still spells out the method |
| wrong_confident | 10 → 10 | 6 → 9 | Fixed: exposed the sorted-index flaw, brute force in words only (no coding it), then the student found the complement idea themselves |
| buggy_code | 8 → 6 | 8 → 6 | Good tracing on line 7, but "modify line 7 so that `left` only moves forward when…" hands over the fix (judge flagged a leak) |
| paster | 8 → 8 | 6 → 5 | Asked about pasted line 4 once, then dropped it for edge cases; never made them explain why a set |
| injection | 8 → 7 | 7 → 7 | Refused every trick; the student never engaged, so it stayed in Understand (no harmful pull-back this time) |
| complexity_confused | 6 → 10 | 4 → 6 | Fixed the main issue: addressed "log n is slower" first with 1,000,000 vs ~20. But gave the 20 itself, then pulled the convinced student back to coding the linear scan |
| **Average** | **7.7 → 7.6** | **6.1 → 6.3** | |

## Verdict
The targeted fixes work where they target: strong students skip ahead, flawed ideas are no longer sent back
to coding a brute force, and stated misconceptions get addressed first. But the overall gain is small,
because new or remaining failures offset it:
1. **Questions that contain the fix** (buggy_code, answer_seeker). The "no method in the question" rule isn't
   holding when debugging.
2. **Agreeing before correcting** ("Right, …" to a wrong statement) and then stating the answer (misread).
3. **The brute-force stage still pulls back** a student who has accepted a better idea (complexity_confused).
4. **Insights and pasted code are dropped** after one mention (lost, paster).

## Next
- Run each scenario 3× and average; one run can't separate a real change from noise.
- Simulator: put code the student writes in chat into the editor, so "type it in" loops don't count against the mentor.
- Prompt: never open with agreement when the statement is wrong; for debugging, ask what a variable holds, never how to change the line; once a student accepts a faster idea, don't revisit the slower one.

## Failure replays: model or harness? (`eval/replay.ts`, `replay*.md`)
Each failing reply was asked again with the exact same context, changing one factor at a time (2 samples
each; A = production, which includes the original failure). Pass/fail scored by hand against the "good
reply" line in `replay.md`.

| Moment | A: production (120b, reasoning low) | B: 120b, reasoning high | C: qwen3.8-27b | D: 120b low + self-check |
|---|---|---|---|---|
| misread: agrees, then states "indices" | 0/2 | 2/2 | 1/2 | 1/2 |
| lost: ignores the stack insight | 0/2 | 1/2 | 2/2 | 0/2 |
| lost: jargon to a confused beginner | 1/2 | 0/2 | 2/2 | 2/2 |
| paster: approves pasted code | 0/2 | 0/2 | 0/2 | 0/2 |
| answer_seeker: question spells the method | 0/2 | 1/2 | 2/2 | 0/2 |
| complexity: pulls back to linear scan | 1/2 | 1/2 | 2/2 | 2/2 |
| complexity: states "about 20" itself | 0/2 | 2/2 | 0/2 | 2/2 |
| **Total** | **2/14** | **7/14** | **9/14** | **7/14** |
| Avg tokens per call | 1,927 | 2,311 | 1,851 | 2,103 |

Dropped: buggy_code "fix in the question". The student had already said "I don't check if it's actually
bigger", so echoing it isn't a leak; the judge's flag was wrong.

Conclusion: mostly harness. The same model passes half the failures with more reasoning (+20% tokens), and a
smaller model passes two thirds, so capability isn't the main limit. One failure (pasted code) no config fixes:
the paste is a single event two turns back, so the fact is lost. That needs state the harness keeps, not a better model.
