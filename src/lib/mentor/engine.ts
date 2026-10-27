import "server-only";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { db } from "@/lib/db";
import { LlmError, completeText, countTurn, getLlm, streamMentor } from "@/lib/llm/groq";
import type { AppUser } from "@/lib/session";
import { getProblem } from "@/problems";
import type { Session } from "@/generated/prisma/client";
import { WINDOW, historyMessages, workspaceBlock } from "./context";
import { HINT_LEVELS, hintInstruction, systemPrompt } from "./prompt";
import { STAGE_IDS, nextStage, type StageId } from "./stages";

export type MentorInput =
  | { kind: "start" }
  | { kind: "message"; text: string }
  | { kind: "hint" }
  | { kind: "run_failed" }
  | { kind: "pasted" }
  | { kind: "retry" };

export type MentorEvent =
  | { type: "user"; id: string; content: string; meta?: unknown }
  | { type: "text"; delta: string }
  | { type: "stage"; stage: StageId }
  | { type: "highlight"; start: number; end: number; note: string }
  | { type: "hints"; used: number }
  | { type: "done"; id: string; content: string }
  | { type: "error"; message: string; code?: string };

export const fileName = (language: string) => (language === "javascript" ? "solution.js" : "solution.py");

const INTERRUPT_GAP_MS = 90_000;

export function canInterrupt(user: AppUser, session: Session) {
  if (!user.mentorInterrupt) return false;
  return !session.lastInterruptAt || Date.now() - session.lastInterruptAt.getTime() > INTERRUPT_GAP_MS;
}

export function mentorStream(user: AppUser, session: Session, input: MentorInput) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: MentorEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        await runTurn(user, session, input, send);
      } catch (err) {
        const e = err instanceof LlmError ? err : new LlmError(err instanceof Error ? err.message : "Something went wrong", "upstream");
        // The HTTP status is already 200 (streaming), so log every failure or it's invisible in the server log.
        if (err instanceof LlmError) console.warn(`[mentor] session ${session.id} ${input.kind}: ${e.code}: ${e.message}`);
        else console.error("[mentor]", err);
        send({ type: "error", message: e.message, code: e.code });
      } finally {
        controller.close();
      }
    },
  });
}

async function runTurn(user: AppUser, session: Session, input: MentorInput, send: (e: MentorEvent) => void) {
  const problem = getProblem(session.problemSlug);
  const llm = getLlm(user);

  let instruction = "";
  if (input.kind === "message") {
    const text = input.text.trim().slice(0, 4000);
    if (!text) return;
    const m = await db.message.create({ data: { sessionId: session.id, role: "user", content: text } });
    send({ type: "user", id: m.id, content: text });
  } else if (input.kind === "hint") {
    const level = Math.min(session.hintsUsed + 1, HINT_LEVELS.length);
    const content = `Can I get a hint? (level ${level} of ${HINT_LEVELS.length})`;
    const m = await db.message.create({
      data: { sessionId: session.id, role: "user", content, meta: JSON.stringify({ hint: level }) },
    });
    session = await db.session.update({ where: { id: session.id }, data: { hintsUsed: level } });
    send({ type: "user", id: m.id, content, meta: { hint: level } });
    send({ type: "hints", used: level });
    instruction = hintInstruction(level);
  } else if (input.kind === "start") {
    const count = await db.message.count({ where: { sessionId: session.id } });
    if (count > 0) return;
    instruction =
      "The student just opened today's problem. Greet them in one short sentence, then ask them to explain in their own words what the problem is asking. Don't summarise the problem for them.";
  } else if (input.kind === "run_failed") {
    session = await db.session.update({ where: { id: session.id }, data: { lastInterruptAt: new Date() } });
    instruction =
      "You are speaking up unprompted because the student's test run just failed (see the latest event). If the failure points to a specific mistake, ask one pointed question about it (name the line number if a line is clearly involved). Keep it to 1–3 sentences. Do not give the fix.";
  } else if (input.kind === "retry") {
    // The previous reply failed (rate limit, network). Answer the existing conversation again.
    const last = await db.message.findFirst({ where: { sessionId: session.id }, orderBy: { createdAt: "desc" } });
    if (!last || last.role === "assistant") return;
  }

  await countTurn(user, llm);

  const stored = await db.message.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true, meta: true },
  });

  const workspace = workspaceBlock({
    code: session.code,
    lastMentorCode: session.lastMentorCode,
    language: session.language,
    fileName: fileName(session.language),
  });

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: systemPrompt({
        problem,
        stage: session.stage,
        language: session.language,
        guidanceStyle: user.guidanceStyle,
        summary: session.summary,
      }),
    },
    // Older messages are folded into session.summary; keep the prompt small for the 8K tokens/min free tier.
    ...historyMessages(stored.slice(session.summarizedCount).slice(-(WINDOW + 2))),
  ];
  const last = messages[messages.length - 1];
  if (last && last.role === "user") last.content = `${last.content}\n\n${workspace}`;
  else messages.push({ role: "user", content: workspace });
  if (instruction) messages.push({ role: "system", content: instruction });

  // One plain streaming call. Tool calls proved unreliable on the free-tier models (often skipped, or a
  // turn spent on tools with no text), so the stage comes from a tag at the start of the reply and
  // highlights come from the line numbers the mentor mentions.
  let { text, stage } = await streamReply(llm, messages, send);
  if (!text) {
    messages.push({ role: "system", content: "You haven't replied to the student yet. Reply now (2–4 sentences, following the rules above)." });
    ({ text, stage } = await streamReply(llm, messages, send));
  }

  const moved = nextStage(session.stage, stage, input.kind === "run_failed" || input.kind === "pasted");
  if (moved !== session.stage) {
    session = await db.session.update({ where: { id: session.id }, data: { stage: moved } });
    send({ type: "stage", stage: moved });
  }

  const highlights = lineMentions(text, Math.max(1, session.code.replace(/\s+$/, "").split("\n").length));
  for (const h of highlights) send({ type: "highlight", ...h });
  const saved = await db.message.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: text || "Sorry, I lost my train of thought. Could you say that again?",
      meta: JSON.stringify({ stage: session.stage, ...(highlights.length ? { highlights } : {}) }),
    },
  });
  await db.session.update({ where: { id: session.id }, data: { lastMentorCode: session.code } });
  send({ type: "done", id: saved.id, content: saved.content });

  // Fire-and-forget: the stream is already answered; the Node server keeps running this.
  void maybeSummarize(user, session.id).catch((e) => console.error("[summarize]", e));
}

const STAGE_TAG = /^\s*\[\[\s*stage\s*:\s*([a-z _-]+?)\s*\]\]\s*/i;

/**
 * Streams one reply. The model starts it with [[stage:<id>]]; that tag is held back until it is
 * complete, parsed, and never shown to the student.
 */
async function streamReply(llm: ReturnType<typeof getLlm>, messages: ChatCompletionMessageParam[], send: (e: MentorEvent) => void) {
  const stream = await streamMentor(llm, { messages, temperature: 0.4, max_completion_tokens: 700 });
  let head = "";
  let decided = false;
  let stage: StageId | null = null;
  let text = "";
  let done = false;
  let inFence = false;
  // The prompt asks for one question per reply, but the models often ramble on into several questions
  // and then the answer. So the reply ends at its first question mark (outside code blocks), or after
  // about 110 words.
  const emit = (s: string) => {
    if (!s || done) return;
    let out = "";
    for (let i = 0; i < s.length; i++) {
      if (s.startsWith("```", i)) inFence = !inFence;
      out += s[i];
      const sofar = text + out;
      if (!inFence && s[i] === "?" && sofar.trim().length > 20) {
        done = true;
        break;
      }
      if (!inFence && /[.!]/.test(s[i]) && sofar.split(/\s+/).length > 110) {
        done = true;
        break;
      }
    }
    text += out;
    send({ type: "text", delta: out });
  };
  for await (const chunk of stream) {
    if (done) break; // leaving the loop aborts the request
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;
    if (decided) {
      emit(delta);
      continue;
    }
    head += delta;
    const m = head.match(STAGE_TAG);
    if (m) {
      const id = m[1].trim().toLowerCase().replace(/[\s-]+/g, "_") as StageId;
      if (STAGE_IDS.includes(id)) stage = id;
      decided = true;
      emit(head.slice(m[0].length));
    } else if ((head.trimStart() && !head.trimStart().startsWith("[")) || head.includes("]]") || head.length > 48) {
      // Not a tag (or a malformed one): show it as-is.
      decided = true;
      emit(head);
    }
  }
  if (!decided) emit(head.replace(STAGE_TAG, ""));
  return { text: text.replace(/\[\[\s*stage\s*:[^\]]*\]\]/gi, "").trim(), stage };
}

/** "line 4", "lines 3-5", "lines 3 and 7" → editor highlights, each noted with its sentence. */
function lineMentions(text: string, lineCount: number) {
  const out: { start: number; end: number; note: string }[] = [];
  const sentences = text.split(/(?<=[.?!])\s+/);
  for (const sentence of sentences) {
    const re = /\blines?\s+(\d+)(?:\s*(?:-|–|to|and|&)\s*(\d+))?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sentence)) && out.length < 3) {
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      if (a < 1 || a > lineCount) continue;
      const start = Math.min(a, b);
      const end = Math.min(Math.max(a, b), lineCount);
      if (out.some((h) => h.start === start && h.end === end)) continue;
      out.push({ start, end, note: sentence.replace(/`/g, "").slice(0, 120) });
    }
  }
  return out;
}

/** Folds messages that are about to leave the context window into a running summary. */
async function maybeSummarize(user: AppUser, sessionId: string) {
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session) return;
  const msgs = await db.message.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
  const upTo = msgs.length - WINDOW;
  if (upTo - session.summarizedCount < 6) return;

  const chunk = msgs
    .slice(session.summarizedCount, upTo)
    .map((m) => `${m.role === "assistant" ? "Mentor" : m.role === "event" ? "Event" : "Student"}: ${m.content}`)
    .join("\n");

  const summary = await completeText(getLlm(user), {
    messages: [
      {
        role: "system",
        content:
          "You maintain a running summary of a tutoring session for the tutor. Merge the new transcript into the existing summary. Keep it under 120 words. Record what the student has understood, their current approach, misconceptions, edge cases discussed, and hints given. No preamble.",
      },
      { role: "user", content: `Existing summary:\n${session.summary || "(none)"}\n\nNew transcript:\n${chunk}` },
    ],
    max_completion_tokens: 300,
    temperature: 0.2,
  });
  if (summary) {
    await db.session.update({ where: { id: sessionId }, data: { summary, summarizedCount: upTo } });
  }
}
