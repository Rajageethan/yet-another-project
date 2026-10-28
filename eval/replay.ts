/**
 * Failure replays: model or harness?
 *
 * Takes the moments where the mentor went wrong in an evaluation run and asks again, with exactly the
 * context the app sent then (the app's own systemPrompt / historyMessages / workspaceBlock), changing ONE
 * factor per config. If a stronger reasoning setting or an extra self-check fixes a moment, the harness is
 * the limit; if nothing fixes it, the model is.
 *
 *   npx tsx --conditions=react-server eval/replay.ts [results dir] [samples]
 *
 * Calls Groq directly (no app server needed). Writes <results dir>/replay.{json,md}.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getProblem } from "@/problems";
import { historyMessages, workspaceBlock } from "@/lib/mentor/context";
import { pasteEventContent } from "@/lib/mentor/paste";
import { systemPrompt } from "@/lib/mentor/prompt";

const DIR = process.argv[2] || "eval/results/2026-10-28T02-21-54";
const SAMPLES = Number(process.argv[3] || 2);

type LogEntry = { who: "mentor" | "student" | "event"; kind?: string; text: string; stage?: string };
type Run = { scenario: { id: string; problem: string; language: string }; log: LogEntry[] };

/** A bad reply from the run (found by its first words) and what a good one does instead. */
type Moment = { id: string; scenario: string; reply: string; pass: string; bad?: RegExp };

const MOMENTS: Moment[] = [
  { id: "misread-agrees", scenario: "misread", reply: "Right, we need the two numbers", pass: "Does not agree that it returns the values and does not state 'indices'; makes the student check the example output or the statement.", bad: /^\s*(right|yes|correct|exactly)|\bindices\b/i },
  { id: "lost-insight", scenario: "lost", reply: "For the strings", pass: "Reflects the student's 'the last one opened closes first' idea back to them and builds the next question on it." },
  { id: "lost-jargon", scenario: "lost", reply: "When you repeatedly scan the string", pass: "Drops the jargon ('examined', 'worst case'), gives one tiny concrete step, doesn't repeat the previous question." },
  { id: "buggy-fix-in-question", scenario: "buggy_code", reply: "How could you modify line 7", pass: "The question doesn't contain the fix (no 'only move forward', 'max', 'greater than the current left'); it asks what left should be or why.", bad: /\bmax\b|only (move|go)s? forward|greater than (the )?(current )?`?left/i },
  { id: "paster-explain", scenario: "paster", reply: "Before submitting, can you restate", pass: "Asks the student to explain the pasted code they claim is done (why a set, a specific line), instead of restating the problem." },
  { id: "seeker-method", scenario: "answer_seeker", reply: "If you keep a dictionary that maps", pass: "The question doesn't spell out the algorithm (dict of last index + left boundary + window length); it asks one small step about the problem.", bad: /most.recent index|left (boundary|edge)/i },
  { id: "complexity-pullback", scenario: "complexity_confused", reply: "If you were to implement the linear scan", pass: "Does not send the now-convinced student back to the linear scan; moves toward halving / binary search.", bad: /linear scan|loop condition/i },
  { id: "complexity-gives-number", scenario: "complexity_confused", reply: "Right, 1 000 000 vs about 20", pass: "Lets the student work out the number of halvings themselves instead of stating ~20.", bad: /\b20\b/ },
];

const CHECKLIST = `Before you write your reply, check silently (do not mention this check):
1. Is anything in the student's last message false? Then do NOT agree with it first ("Right", "Yes"); ask a question that makes them test it.
2. Did they voice part of the key insight, even clumsily? Then say so in their words and build your question on it.
3. Does your question contain the method or the fix (e.g. "so that X only moves forward when...")? Rewrite it to ask about the problem or a value instead.
4. Are you asking for something they already did, or for a weaker approach they've moved past? Don't.
5. If they said they don't understand, use simpler words and a smaller, concrete step.`;

type Config = { id: string; label: string; model: string; effort?: "low" | "medium" | "high"; checklist?: boolean; maxTokens: number };
const CONFIGS: Config[] = [
  { id: "A", label: "baseline: gpt-oss-120b, reasoning low (production)", model: "openai/gpt-oss-120b", effort: "low", maxTokens: 700 },
  { id: "B", label: "same model, reasoning high", model: "openai/gpt-oss-120b", effort: "high", maxTokens: 4000 },
  { id: "C", label: "different model: qwen3.8-27b", model: "qwen/qwen3.8-27b", maxTokens: 4000 },
  { id: "D", label: "same model, reasoning low + self-check before replying", model: "openai/gpt-oss-120b", effort: "low", checklist: true, maxTokens: 700 },
];

const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", maxRetries: 0 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rebuilds the messages the app sent for the mentor reply at log[index]. */
function contextFor(run: Run, index: number): ChatCompletionMessageParam[] {
  const problem = getProblem(run.scenario.problem);
  const language = run.scenario.language;
  const before = run.log.slice(0, index);
  const stage = [...before].reverse().find((e) => e.who === "mentor")?.stage ?? "understand";
  const lastMentor = before.map((e) => e.who).lastIndexOf("mentor");

  let code = problem.starter[language as "python"];
  let codeAt = -1;
  const stored: { role: string; content: string; meta?: string }[] = [];
  before.forEach((e, i) => {
    if (e.who === "mentor") stored.push({ role: "assistant", content: e.text, meta: JSON.stringify({ stage: e.stage }) });
    else if (e.who === "student") stored.push({ role: "user", content: e.text });
    else if (e.text.startsWith("[editor]\n") || e.text.startsWith("[pasted")) {
      const pasted = e.text.match(/^\[pasted (\d+) lines\]/);
      code = e.text.slice(e.text.indexOf("\n") + 1);
      codeAt = i;
      if (pasted) stored.push({ role: "event", content: pasteEventContent(Number(pasted[1])) });
    } else stored.push({ role: "event", content: e.text });
  });
  const workspace = workspaceBlock({
    code,
    // The app remembers the code at the mentor's last reply; a code event after it shows up as a diff.
    lastMentorCode: codeAt > lastMentor ? problem.starter[language as "python"] : code,
    language,
    fileName: language === "javascript" ? "solution.js" : "solution.py",
  });
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt({ problem, stage, language, guidanceStyle: "balanced", summary: "" }) },
    ...historyMessages(stored),
  ];
  const last = messages[messages.length - 1];
  if (last && last.role === "user") last.content = `${last.content}\n\n${workspace}`;
  else messages.push({ role: "user", content: workspace });
  return messages;
}

/** What the student would see: the app cuts the reply at its first question mark or ~110 words. */
function shown(full: string) {
  const text = full.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*\[\[\s*stage\s*:[^\]]*\]\]\s*/i, "");
  let inFence = false;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith("```", i)) inFence = !inFence;
    if (!inFence && text[i] === "?" && text.slice(0, i).trim().length > 20) return text.slice(0, i + 1).trim();
    if (!inFence && /[.!]/.test(text[i]) && text.slice(0, i).split(/\s+/).length > 110) return text.slice(0, i + 1).trim();
  }
  return text.trim();
}

async function ask(cfg: Config, messages: ChatCompletionMessageParam[]) {
  const body = {
    model: cfg.model,
    messages: cfg.checklist ? [...messages, { role: "system" as const, content: CHECKLIST }] : messages,
    temperature: 0.4,
    max_completion_tokens: cfg.maxTokens,
    ...(cfg.effort ? { reasoning_effort: cfg.effort } : {}),
  };
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await groq.chat.completions.create(body);
      return { full: res.choices[0]?.message?.content ?? "", tokens: res.usage?.total_tokens ?? 0 };
    } catch (e) {
      const err = e as { status?: number; message?: string; headers?: Headers };
      const daily = /per day|TPD|RPD/i.test(err.message ?? "");
      if (err.status !== 429 || daily || attempt >= 6) throw e;
      const wait = Number(err.headers?.get?.("retry-after") ?? 20);
      await sleep((wait + 1) * 1000);
    }
  }
}

type Result = { moment: string; config: string; sample: number; full?: string; shown?: string; tokens?: number; flagged?: boolean; error?: string };

async function main() {
  const runs = JSON.parse(readFileSync(`${DIR}/results.json`, "utf8")) as Run[];
  const jobs: { m: Moment; index: number; run: Run; original: string }[] = [];
  // The models write non-breaking and narrow spaces ("line 7", "1 000 000"), so compare with spaces folded.
  const fold = (s: string) => s.replace(/\s+/g, " ");
  const only = process.env.REPLAY_ONLY?.split(",");
  for (const m of MOMENTS) {
    if (only && !only.includes(m.id)) continue;
    const run = runs.find((r) => r.scenario.id === m.scenario);
    const index = run?.log.findIndex((e) => e.who === "mentor" && fold(e.text).startsWith(m.reply)) ?? -1;
    if (!run || index < 0) {
      console.warn(`skip ${m.id}: reply not found`);
      continue;
    }
    jobs.push({ m, index, run, original: run.log[index].text });
  }

  const results: Result[] = [];
  // One worker per model, since each model has its own tokens-per-minute budget.
  const byModel = new Map<string, Config[]>();
  for (const c of CONFIGS) byModel.set(c.model, [...(byModel.get(c.model) ?? []), c]);
  await Promise.all(
    [...byModel.values()].map(async (configs) => {
      for (const cfg of configs) {
        const samples = cfg.id === "A" ? Math.max(1, SAMPLES - 1) : SAMPLES; // the run itself is one baseline sample
        let dead = "";
        for (const job of jobs) {
          for (let s = 0; s < samples; s++) {
            if (dead) {
              results.push({ moment: job.m.id, config: cfg.id, sample: s, error: dead });
              continue;
            }
            try {
              const { full, tokens } = await ask(cfg, contextFor(job.run, job.index));
              const text = shown(full);
              const flagged = job.m.bad ? job.m.bad.test(text) : undefined;
              results.push({ moment: job.m.id, config: cfg.id, sample: s, full, shown: text, tokens, flagged });
              console.log(`${cfg.id} ${job.m.id} #${s} (${tokens} tok)${flagged ? " FLAG" : ""}: ${text.slice(0, 140)}`);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              console.warn(`${cfg.id} ${job.m.id} #${s}: ${msg.slice(0, 200)}`);
              results.push({ moment: job.m.id, config: cfg.id, sample: s, error: msg.slice(0, 300) });
              if (/per day|TPD|RPD/i.test(msg)) dead = "daily limit reached";
            }
          }
        }
      }
    }),
  );

  const out = only ? `${DIR}/replay-${only.join("+")}` : `${DIR}/replay`;
  writeFileSync(`${out}.json`, JSON.stringify({ configs: CONFIGS, moments: MOMENTS.map((m) => ({ ...m, bad: m.bad?.source })), results }, null, 1));
  const md: string[] = [`# Failure replays (${DIR})`, "", ...CONFIGS.map((c) => `- **${c.id}**: ${c.label}`), ""];
  for (const job of jobs) {
    md.push(`## ${job.m.id}`, `Good reply: ${job.m.pass}`, "", `- original (A, from the run): ${job.original}`);
    for (const r of results.filter((x) => x.moment === job.m.id)) {
      md.push(`- ${r.config}#${r.sample}${r.flagged ? " ⚑" : ""}: ${r.error ? `(error: ${r.error})` : r.shown}`);
    }
    md.push("");
  }
  writeFileSync(`${out}.md`, md.join("\n"));
  console.log(`\nwrote ${out}.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
