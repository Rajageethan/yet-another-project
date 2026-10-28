# Mentor quality evaluation

Simulated students talk to the **real** mentor (real Groq calls, real prompts and context) through the
app's HTTP API, then every conversation is scored two ways:

- **Automatic checks** (`autoChecks` in `mentor-eval.ts`): code in replies, techniques named before the
  student did, questions per reply, length, stage movement, highlights, errors, latency.
- **A judge model** (Qwen by default, a different family from the gpt-oss mentor) scoring a tutoring
  rubric: no leak, diagnosis, questioning, accuracy, adaptivity, student progress, tone, overall /10.

The judge is a second opinion, not ground truth. Read `transcripts.md` before trusting a score.

## Scenarios (`scenarios.ts`)

strong · misread · lost · answer_seeker · wrong_confident · buggy_code · paster · injection ·
complexity_confused. Each has a persona, a fixed opening message, scripted code/run events where needed,
and a note on what a good mentor does there (given to the judge).

## Running it

1. Start a production server with the dev login allowed and the **real** LLM (no `E2E_FAKE_LLM`):

   ```bash
   node scripts/e2e-db.mjs prisma/e2e-eval.db
   NEXT_DIST_DIR=.next-e2e-eval npx next build
   NEXT_DIST_DIR=.next-e2e-eval DATABASE_URL=file:./prisma/e2e-eval.db E2E_TEST_SERVER=1 AUTH_DEV_LOGIN=true npx next start -p 3102
   ```

2. Run all scenarios (about 30 min on the free tier) or a few by id:

   ```bash
   npx tsx eval/mentor-eval.ts
   npx tsx eval/mentor-eval.ts lost buggy_code
   ```

Results go to `eval/results/<timestamp>/results.json` and `transcripts.md`.

Mentor calls are spaced `EVAL_MENTOR_GAP_MS` (default 30 s) apart to stay under Groq's free-tier
8K tokens/min. Otherwise the app falls back to `gpt-oss-20b` and you'd be scoring a different model.
`EVAL_STUDENT_MODEL` and `EVAL_JUDGE_MODEL` override the simulator and judge models.
