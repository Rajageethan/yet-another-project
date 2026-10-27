export const STAGES = [
  {
    id: "understand",
    label: "Understand",
    guide:
      "Make sure the student can restate the problem in their own words: inputs, output, and constraints. Correct any misreading with a question, not an answer.",
  },
  {
    id: "examples",
    label: "Examples",
    guide:
      "Have the student work through a small example by hand and propose edge cases (empty input, duplicates, negatives, single element...). Ask which cases could break a naive idea.",
  },
  {
    id: "brute_force",
    label: "Brute force",
    guide:
      "Get the simplest correct approach stated in plain words, plus its time and space complexity. It's fine if it's slow. Don't let them skip this.",
  },
  {
    id: "optimize",
    label: "Optimize",
    guide:
      "Help them find the wasted work in the brute force and the observation that removes it. Ask what information they could remember or what property of the input they're not using.",
  },
  {
    id: "code",
    label: "Code",
    guide:
      "They are writing code. Stay quiet unless asked or you see a real problem. Point to specific lines by number ('line 4') and ask about them; never rewrite their code.",
  },
  {
    id: "test",
    label: "Test",
    guide:
      "Help them debug from evidence: ask them to trace a failing input by hand and say where their expectation and the code diverge.",
  },
  {
    id: "complexity",
    label: "Complexity",
    guide: "Ask them to state and justify the final time and space complexity of their code.",
  },
  {
    id: "reflect",
    label: "Reflect",
    guide:
      "Ask what the key insight was in one sentence and name the pattern. Tell them they can submit when their tests pass.",
  },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];

export function stageIndex(id: string) {
  return Math.max(0, STAGE_IDS.indexOf(id as StageId));
}

/**
 * The stage after a mentor turn. Unprompted turns (failed-run or paste follow-ups) never move it;
 * otherwise it may go back freely but forward only one stage, so the bar can't skip ahead.
 */
export function nextStage(current: string, proposed: StageId | null, unprompted: boolean): StageId {
  const from = stageIndex(current);
  if (!proposed || unprompted) return STAGE_IDS[from];
  return STAGE_IDS[Math.min(stageIndex(proposed), from + 1)];
}

export function getStage(id: string) {
  return STAGES[stageIndex(id)];
}
