import "server-only";
import { db } from "@/lib/db";
import { completeJson, getLlm } from "@/lib/llm/groq";
import type { AppUser } from "@/lib/session";
import type { Session } from "@/generated/prisma/client";
import { getProblem } from "@/problems";
import { numbered } from "./context";
import { hintPenalty } from "./prompt";

export const RUBRIC = [
  { key: "understanding", label: "Problem understanding" },
  { key: "edgeCases", label: "Edge-case thinking" },
  { key: "approach", label: "Approach (brute → optimal)" },
  { key: "complexity", label: "Complexity analysis" },
  { key: "correctness", label: "Code & debugging" },
  { key: "communication", label: "Explaining your reasoning" },
] as const;

type RubricKey = (typeof RUBRIC)[number]["key"];

type Raw = Partial<Record<RubricKey, number>> & {
  wentWell?: string;
  workOn?: string;
  patternCard?: string;
  complexity?: string;
};

const clamp5 = (n: unknown) => Math.min(5, Math.max(1, Math.round(Number(n) || 3)));

export function thinkingScore(scores: Record<RubricKey, number>, hintsUsed: number) {
  const avg = RUBRIC.reduce((s, r) => s + scores[r.key], 0) / RUBRIC.length;
  return Math.max(0, Math.min(100, Math.round((avg / 5) * 100) - hintPenalty(hintsUsed)));
}

export async function assessSession(user: AppUser, session: Session) {
  const problem = getProblem(session.problemSlug);
  const messages = await db.message.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } });
  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "Mentor" : m.role === "event" ? "Event" : "Student"}: ${m.content}`)
    .join("\n")
    .slice(-9000);

  let raw: Raw = {};
  try {
    raw = await completeJson<Raw>(getLlm(user), {
      messages: [
        {
          role: "system",
          content: `You assess how a student THOUGHT while solving a DSA problem with a mentor, not just whether the code works. Score each dimension 1–5 using the transcript as evidence (5 = did it clearly on their own, 3 = got there with prompting, 1 = mentor had to carry it).
Return JSON only:
{"understanding":n,"edgeCases":n,"approach":n,"complexity":n,"correctness":n,"communication":n,
"wentWell":"one or two sentences, second person, specific to this session",
"workOn":"one or two sentences, second person, the single most useful habit to build next",
"patternCard":"one sentence capturing the reusable technique (no code)",
"complexity":"final time · space, e.g. O(n) time · O(k) space"}`,
        },
        {
          role: "user",
          content: `Problem: ${problem.title}. Intended pattern: ${problem.pattern}. Optimal: ${problem.mentorNotes.optimal}
Hints used: ${session.hintsUsed}. Test runs: ${session.runs}. Paste events: ${session.pasteFlags}.

Transcript:
${transcript || "(no conversation)"}

Final code:
${numbered(session.code)}`,
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 900,
    });
  } catch (err) {
    console.error("[assess]", err);
  }

  const scores = Object.fromEntries(RUBRIC.map((r) => [r.key, clamp5(raw[r.key])])) as Record<RubricKey, number>;
  // No conversation means we have no evidence of reasoning.
  if (!messages.some((m) => m.role === "user")) {
    scores.understanding = scores.communication = scores.edgeCases = 1;
  }
  return {
    ...scores,
    thinkingScore: thinkingScore(scores, session.hintsUsed),
    wentWell: String(raw.wentWell ?? "You got all the tests passing.").slice(0, 400),
    workOn: String(raw.workOn ?? "Talk through your approach with the mentor before coding next time.").slice(0, 400),
    patternName: problem.pattern,
    patternCard: String(raw.patternCard ?? problem.mentorNotes.keyInsight).slice(0, 300),
    complexityStr: String(raw.complexity ?? "").slice(0, 80) || null,
  };
}
