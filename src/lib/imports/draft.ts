import "server-only";
import { completeJson, getLlm } from "@/lib/llm/groq";
import type { AppUser } from "@/lib/session";
import { formatValue } from "@/lib/format";
import { topicName } from "@/problems";
import { readOriginal, type Draft, type ImportRecord } from "./store";

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const list = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, 200))
    .filter(Boolean)
    .slice(0, max);

/** Asks the mentor model for an original-wording statement and mentor notes. */
export async function draftImport(user: AppUser, rec: ImportRecord): Promise<Draft> {
  const original = await readOriginal(rec.id);
  if (!original) throw new Error(`No cached original for ${rec.id}. Re-run scripts/import_leetcode.py.`);

  const example = rec.tests[0];
  const raw = await completeJson<Record<string, unknown>>(getLlm(user), {
    messages: [
      {
        role: "system",
        content: `You write problems for a DSA practice app. Rewrite the given problem COMPLETELY IN YOUR OWN WORDS: a new title, a new statement and new constraint lines. Do not copy any sentence or distinctive phrase from the original, and never mention LeetCode. Keep the exact same task, inputs, output and edge-case rules so the existing tests stay correct.

Rules for "statement":
- 1–3 short paragraphs, plain markdown. Refer to inputs by their parameter names in backticks.
- It must be SELF-CONTAINED: include every definition, value table or mapping the student needs (e.g. the value of each Roman symbol, which letters each phone digit maps to, what counts as a valid move). A markdown list is fine for these.
- Do NOT include examples (the app shows them from the tests) or constraints.
- If the original says the answer can be in any order, say so. Don't add ordering rules the original doesn't have.

Rules for "constraints": keep every numeric bound EXACTLY as in the original (same numbers), only reword the text around them.

Then write mentor notes. The mentor uses them to guide a student by questions without giving the answer.
- "pattern": the real technique (e.g. "String parsing", "Monotonic stack", "Backtracking"), not a loosely related one.
- "bruteForce": a genuinely simpler CORRECT approach a student might try first, with its complexity. If the direct approach is already optimal, say so.
- "commonMistakes": real bugs students make on this problem, not generic advice.

Return JSON only:
{"title": string (2–5 words, original),
 "statement": string,
 "constraints": [string] (2–5 short lines, use ≤; write each number exactly as the original does, e.g. 500 stays 500 and 10^4 becomes 10⁴),
 "pattern": string (the technique, 2–5 words, e.g. "Monotonic stack"),
 "mentorNotes": {"keyInsight": string, "bruteForce": string (approach + complexity), "optimal": string (approach + time/space complexity), "commonMistakes": [string] (2–4), "edgeCases": [string] (2–4)}}`,
      },
      {
        role: "user",
        content: `Topic: ${topicName(rec.topic)} · Difficulty: ${rec.difficulty} · Tags: ${rec.source.tags.join(", ")}
Function: ${rec.functionName.python}(${rec.params.join(", ")})
Answer order: ${rec.compare === "exact" ? "must match exactly" : "any order is accepted"}
Example test: ${rec.params.map((p, i) => `${p} = ${formatValue(example.args[i], "python")}`).join(", ")} → ${formatValue(example.expected, "python")}

Original problem (for meaning only, do not copy wording):
"""
${original.description.replace(/ /g, " ").slice(0, 4000)}
"""

Reference solution:
\`\`\`python
${rec.referenceSolution.slice(0, 3000)}
\`\`\``,
      },
    ],
    temperature: 0.5,
    max_completion_tokens: 1800,
  });

  const notes = (raw.mentorNotes ?? {}) as Record<string, unknown>;
  const draft: Draft = {
    title: str(raw.title, 60) || original.title,
    statement: str(raw.statement, 2500),
    constraints: list(raw.constraints, 6),
    pattern: str(raw.pattern, 50),
    mentorNotes: {
      keyInsight: str(notes.keyInsight, 400),
      bruteForce: str(notes.bruteForce, 300),
      optimal: str(notes.optimal, 300),
      commonMistakes: list(notes.commonMistakes, 5),
      edgeCases: list(notes.edgeCases, 5),
    },
    draftedAt: new Date().toISOString(),
  };
  if (!draft.statement || !draft.mentorNotes.keyInsight) throw new Error("The model returned an incomplete draft. Try again.");
  return draft;
}
