import "server-only";
import type OpenAI from "openai";
import { STAGES } from "@/lib/mentor/stages";

/**
 * A scripted stand-in for the Groq client, used only by the Playwright suite (E2E_FAKE_LLM=1, never in
 * production). It has the same shape as `client.chat.completions.create`, so everything above it (model
 * fallback, streaming, stage tags, line highlights, scoring) runs exactly as it does with Groq.
 *
 * Markers a test can put in a chat message:
 *   #advance   reply is tagged with the next stage
 *   #line      reply mentions "line 2" (an editor highlight)
 *   FAIL_ONCE  the first reply to this exact message fails, the retry succeeds
 *   #slow      the reply streams slowly (about 3 s), to test leaving mid-reply
 */
export const fakeLlmEnabled =
  process.env.E2E_FAKE_LLM === "1" && (process.env.NODE_ENV !== "production" || process.env.E2E_TEST_SERVER === "1");

const failedOnce = new Set<string>();

type Msg = { role: string; content?: unknown };

function text(m: Msg | undefined) {
  return typeof m?.content === "string" ? m.content : "";
}

function stageFromPrompt(system: string) {
  const label = system.match(/Stage so far: \*\*(.+?)\*\*/)?.[1];
  const i = Math.max(0, STAGES.findIndex((s) => s.label === label));
  return { current: STAGES[i].id, next: STAGES[Math.min(i + 1, STAGES.length - 1)].id };
}

function reply(messages: Msg[]): string {
  const system = text(messages[0]);
  const instructions = messages.slice(1).filter((m) => m.role === "system").map(text).join("\n");
  const lastUser = text([...messages].reverse().find((m) => m.role === "user"));
  // The engine appends the editor contents to the student's message; the script only reacts to their words.
  const said = lastUser.split("\n\n[Editor")[0].split("\n\n[No code")[0].trim();
  const { current, next } = stageFromPrompt(system);

  if (said.includes("FAIL_ONCE") && !failedOnce.has(said)) {
    failedOnce.add(said);
    throw new Error("Fake upstream failure (FAIL_ONCE)");
  }

  let body: string;
  if (instructions.includes("just opened today's problem")) body = "Hi! What is the problem asking, in your own words?";
  else if (instructions.includes("pressed the Hint button")) body = "Here is a nudge: what do you need to remember as you go?";
  else if (instructions.includes("test run just failed")) body = "Your run failed. Look at line 2. What does it return there?";
  else if (instructions.includes("just pasted")) body = "Walk me through line 2 of what you pasted. What does it do?";
  else {
    const quote = said.replace(/#advance|#line|#slow/g, "").trim().slice(0, 60);
    body = `You said: "${quote}". ${said.includes("#line") ? "Look at line 2. " : ""}What is your next step?`;
  }
  const stage = said.includes("#advance") ? next : current;
  return `[[stage:${stage}]] ${body}`;
}

function assessment() {
  return JSON.stringify({
    understanding: 4,
    edgeCases: 3,
    approach: 4,
    complexity: 5,
    correctness: 5,
    communication: 4,
    wentWell: "Fake assessment: you explained your idea before coding.",
    workOn: "Fake assessment: name edge cases earlier.",
    patternCard: "Fake pattern card: remember what you have already seen.",
    bigO: "O(n) time · O(n) space",
  });
}

async function* chunks(full: string, delayMs: number) {
  for (let i = 0; i < full.length; i += 12) {
    yield { choices: [{ index: 0, delta: { content: full.slice(i, i + 12) } }] };
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

export function fakeClient(): OpenAI {
  const create = async (params: { messages: Msg[]; stream?: boolean }) => {
    if (params.stream) {
      const lastUser = text([...params.messages].reverse().find((m) => m.role === "user"));
      return chunks(reply(params.messages), lastUser.includes("#slow") ? 300 : 5);
    }
    const system = text(params.messages[0]);
    const content = system.includes("assess how a student")
      ? assessment()
      : system.includes("running summary")
        ? "Fake summary of the session so far."
        : "{}";
    return { choices: [{ index: 0, message: { role: "assistant", content } }] };
  };
  return { chat: { completions: { create } } } as unknown as OpenAI;
}
