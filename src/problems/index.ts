import bank from "./bank.json";
import imported from "./imported.json";

export type Language = "python" | "javascript";
export type Difficulty = "easy" | "medium" | "hard";
/** unordered: top-level list order doesn't matter; unordered_deep: no list order matters at any depth. */
export type Compare = "exact" | "unordered" | "unordered_deep";

export type TestCase = { args: unknown[]; expected: unknown };

export type Problem = {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topic: string;
  pattern: string;
  statement: string;
  constraints: string[];
  functionName: Record<Language, string>;
  params: string[];
  starter: Record<Language, string>;
  compare: Compare;
  tests: TestCase[];
  hiddenTests: TestCase[];
  mentorNotes: {
    keyInsight: string;
    bruteForce: string;
    optimal: string;
    commonMistakes: string[];
    edgeCases: string[];
  };
  /** Set for problems imported from a dataset */
  source?: { dataset: string; license: string; questionId: number };
};

/** What the browser is allowed to see before submitting. */
export type PublicProblem = Omit<Problem, "hiddenTests" | "mentorNotes" | "pattern"> & {
  hiddenCount: number;
};

/** Roadmap order. Later topics land in later phases. */
export const TOPICS = [
  { id: "arrays-hashing", name: "Arrays & Hashing" },
  { id: "two-pointers", name: "Two Pointers" },
  { id: "sliding-window", name: "Sliding Window" },
  { id: "stack", name: "Stack" },
  { id: "binary-search", name: "Binary Search" },
  { id: "linked-list", name: "Linked List" },
  { id: "trees", name: "Trees" },
  { id: "heaps", name: "Heaps" },
  { id: "graphs", name: "Graphs" },
  { id: "dp", name: "Dynamic Programming" },
] as const;

export const DIFFICULTY_LEVEL: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

/** Hand-written bank (scripts/problems.py) plus imports approved on /admin/review. */
export const problems = [...(bank as Problem[]), ...(imported as unknown as Problem[])];

/** Roadmap topics that have at least one problem, in roadmap order. */
export const ACTIVE_TOPICS = TOPICS.filter((t) => problems.some((p) => p.topic === t.id));

const bySlug = new Map(problems.map((p) => [p.slug, p]));

export function getProblem(slug: string): Problem {
  const p = bySlug.get(slug);
  if (!p) throw new Error(`Unknown problem: ${slug}`);
  return p;
}

export function topicName(id: string) {
  return TOPICS.find((t) => t.id === id)?.name ?? id;
}

export function toPublic(p: Problem): PublicProblem {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hiddenTests, mentorNotes, pattern, source, ...rest } = p;
  return { ...rest, hiddenCount: hiddenTests.length };
}
