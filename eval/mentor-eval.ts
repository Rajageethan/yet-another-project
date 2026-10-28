/**
 * Mentor quality evaluation.
 *
 * Simulated students (eval/scenarios.ts) talk to the REAL mentor through the app's HTTP API, exactly as
 * the browser does: dev login → today's session → chat SSE / snapshot / run. A student-simulator model
 * plays each persona; afterwards a judge model from a different family scores every conversation, and
 * automatic checks measure leaks, question count, length and stage movement.
 *
 * Needs a production server with the dev login allowed and the real LLM (see eval/README.md):
 *   EVAL_BASE_URL=http://localhost:3102 npx tsx eval/mentor-eval.ts [scenarioId ...]
 * Writes eval/results/<timestamp>/{results.json,transcripts.md}.
 */
import "dotenv/config";
import Database from "better-sqlite3";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import { SCENARIOS, type Action, type Scenario } from "./scenarios";

const BASE = process.env.EVAL_BASE_URL || "http://localhost:3102";
const DB_FILE = process.env.EVAL_DB || "prisma/e2e-eval.db";
const MENTOR_GAP_MS = Number(process.env.EVAL_MENTOR_GAP_MS || 30_000); // keeps the mentor under 8K tokens/min
const STUDENT_MODEL = process.env.EVAL_STUDENT_MODEL || "qwen/qwen3.8-27b";
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || "qwen/qwen3.8-27b";
const TZ = "Asia/Kolkata";

type Problem = {
  slug: string;
  title: string;
  statement: string;
  constraints: string[];
  functionName: { python: string };
  params: string[];
  tests: { args: unknown[]; expected: unknown }[];
  mentorNotes: { keyInsight: string; bruteForce: string; optimal: string; commonMistakes: string[] };
};
const bank = JSON.parse(readFileSync("src/problems/bank.json", "utf8")) as Problem[];
const problemBySlug = new Map(bank.map((p) => [p.slug, p]));

const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", maxRetries: 4 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const stripThink = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

// ------------------------------------------------------------------ HTTP client with a cookie jar

class Client {
  cookies = new Map<string, string>();
  private header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  private keep(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  async fetch(path: string, init: RequestInit = {}) {
    const res = await fetch(BASE + path, { ...init, redirect: "manual", headers: { ...(init.headers as object), cookie: this.header() } });
    this.keep(res);
    return res;
  }
  async json(path: string, body: unknown) {
    const res = await this.fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  }
}

async function login(client: Client, name: string, email: string) {
  const { csrfToken } = await (await client.fetch("/api/auth/csrf")).json();
  await client.fetch("/api/auth/callback/dev", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, name, email, callbackUrl: `${BASE}/today` }).toString(),
  });
  if (![...client.cookies.keys()].some((k) => k.includes("session-token"))) throw new Error("dev login failed");
}

/** Signs up a student and assigns them the scenario's problem directly (skipping the picker). */
async function setUpStudent(s: Scenario) {
  const client = new Client();
  const email = `eval-${s.id}-${Date.now()}@example.test`;
  await login(client, `Eval ${s.id}`, email);
  const db = new Database(DB_FILE);
  const user = db.prepare("select id from User where email = ?").get(email) as { id: string };
  db.prepare("update User set onboarded = 1, language = ?, timezone = ? where id = ?").run(s.language, TZ, user.id);
  db.prepare("insert into DailyAssignment (id, userId, date, problemSlug, kind) values (?, ?, ?, ?, 'new')").run(
    `eval_${s.id}_${Date.now()}`,
    user.id,
    dayKey(),
    s.problem,
  );
  const page = await client.fetch("/today");
  if (page.status !== 200) throw new Error(`/today returned ${page.status}`);
  const session = db.prepare("select id from Session where userId = ?").get(user.id) as { id: string };
  db.close();
  return { client, sessionId: session.id };
}

// ------------------------------------------------------------------ mentor turns

type Entry = {
  who: "mentor" | "student" | "event";
  kind?: string;
  text: string;
  stage?: string;
  highlights?: { start: number; end: number }[];
  ms?: number;
  error?: string;
};

let lastMentorCall = 0;

async function mentorTurn(client: Client, sessionId: string, input: Record<string, unknown>, stageBefore: string): Promise<Entry> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastMentorCall + MENTOR_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastMentorCall = Date.now();
    const t0 = Date.now();
    const res = await client.fetch(`/api/session/${sessionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attempt === 0 ? input : { kind: "retry" }),
    });
    const raw = await res.text();
    let text = "";
    let stage = stageBefore;
    let error: string | undefined;
    const highlights: { start: number; end: number }[] = [];
    for (const frame of raw.split("\n\n")) {
      if (!frame.startsWith("data: ")) continue;
      const e = JSON.parse(frame.slice(6));
      if (e.type === "done") text = e.content;
      else if (e.type === "stage") stage = e.stage;
      else if (e.type === "highlight") highlights.push({ start: e.start, end: e.end });
      else if (e.type === "error") error = `${e.code}: ${e.message}`;
    }
    if (error?.startsWith("rate_limit") || error?.startsWith("upstream")) {
      console.log(`    ! mentor error (${error}); waiting 60s and retrying`);
      await sleep(60_000);
      continue;
    }
    return { who: "mentor", kind: String(input.kind), text, stage, highlights, ms: Date.now() - t0, error };
  }
  return { who: "mentor", kind: String(input.kind), text: "", stage: stageBefore, error: "gave up after 3 attempts" };
}

async function applyAction(client: Client, sessionId: string, a: Action, log: Entry[], stage: () => string) {
  const p = (slug: string) => problemBySlug.get(slug)!;
  if (a.type === "code") {
    const res = await client.json(`/api/session/${sessionId}/snapshot`, { code: a.code, language: "python", pastedLines: a.pastedLines ?? 0 });
    log.push({ who: "event", text: a.pastedLines ? `[pasted ${a.pastedLines} lines]\n${a.code}` : `[editor]\n${a.code}` });
    if (res.followUp) log.push(await mentorTurn(client, sessionId, { kind: "pasted" }, stage()));
  } else if (a.type === "run") {
    void p;
    const cases = [
      ...Array.from({ length: a.passed }, (_, i) => ({ args: [`ok${i}`], expected: i, got: i, passed: true })),
      ...(a.failing ?? []).map((f) => ({ ...f, passed: false })),
    ];
    const res = await client.json(`/api/session/${sessionId}/run`, { cases, error: a.error });
    log.push({ who: "event", text: res.event });
    if (res.interrupt) log.push(await mentorTurn(client, sessionId, { kind: "run_failed" }, stage()));
  } else if (a.type === "hint") {
    log.push({ who: "event", text: "[student pressed Hint]" });
    log.push(await mentorTurn(client, sessionId, { kind: "hint" }, stage()));
  }
}

// ------------------------------------------------------------------ simulated student

async function studentMessage(s: Scenario, log: Entry[]) {
  const p = problemBySlug.get(s.problem)!;
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are role-playing a college student practising a DSA problem with an AI mentor in a chat. Stay in character.

Persona: ${s.persona}

The problem you see:
${p.title}: ${p.statement}
Function: ${p.functionName.python}(${p.params.join(", ")})

Rules: write ONLY your next chat message to the mentor, 1–3 short sentences, casual like a real student (lowercase is fine). Answer what the mentor asked, in character: don't be smarter or more knowledgeable than the persona, and don't suddenly know the full solution. No narration, no quotes around your message.`,
    },
    ...log
      .filter((e) => e.who !== "event" || !e.text.startsWith("["))
      .map((e): OpenAI.ChatCompletionMessageParam =>
        e.who === "student" ? { role: "assistant", content: e.text } : { role: "user", content: e.who === "event" ? `(app notice) ${e.text}` : `Mentor: ${e.text}` },
      ),
    { role: "user", content: "(Write your next message to the mentor now.)" },
  ];
  const res = await groq.chat.completions.create({ model: STUDENT_MODEL, messages, temperature: 0.7, max_completion_tokens: 600 });
  return stripThink(res.choices[0]?.message?.content ?? "").replace(/^"|"$/g, "").trim() || "ok";
}

// ------------------------------------------------------------------ automatic checks

const TECHNIQUES = [
  "hash map", "hashmap", "dictionary", "dict", "hash set", "set", "stack", "sliding window", "two pointer", "two-pointer",
  "binary search", "halving", "sort", "max(left", "last seen", "complement",
];

function autoChecks(log: Entry[]) {
  const mentor = log.filter((e) => e.who === "mentor" && e.text);
  const words = mentor.map((e) => e.text.split(/\s+/).length);
  const questions = mentor.map((e) => (e.text.match(/\?/g) ?? []).length);
  const codeLike = mentor.filter((e) => /```|^\s*(def |for |while |return |if )/m.test(e.text)).map((e) => e.text);
  // A technique the mentor names before the student has mentioned it.
  const namedFirst: string[] = [];
  for (const t of TECHNIQUES) {
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    const firstMentor = log.findIndex((e) => e.who === "mentor" && re.test(e.text));
    const firstStudent = log.findIndex((e) => e.who === "student" && re.test(e.text));
    if (firstMentor !== -1 && (firstStudent === -1 || firstMentor < firstStudent)) namedFirst.push(t);
  }
  return {
    mentorReplies: mentor.length,
    avgWords: Math.round(words.reduce((a, b) => a + b, 0) / Math.max(1, words.length)),
    maxWords: Math.max(0, ...words),
    repliesWithoutQuestion: questions.filter((q) => q === 0).length,
    repliesWithSeveralQuestions: questions.filter((q) => q > 1).length,
    codeLikeReplies: codeLike.length,
    techniquesNamedFirst: namedFirst,
    stages: [...new Set(mentor.map((e) => e.stage))],
    highlightReplies: mentor.filter((e) => e.highlights?.length).length,
    errors: log.filter((e) => e.error).map((e) => e.error),
    avgLatencyMs: Math.round(mentor.reduce((a, e) => a + (e.ms ?? 0), 0) / Math.max(1, mentor.length)),
  };
}

// ------------------------------------------------------------------ judge

type Verdict = {
  scores: Record<"no_leak" | "diagnosis" | "questioning" | "accuracy" | "adaptivity" | "student_progress" | "tone", number>;
  overall: number;
  leaked_solution: boolean;
  leak_quote: string;
  inaccuracies: string[];
  best_moment: string;
  worst_moment: string;
  verdict: string;
};

function transcriptText(log: Entry[]) {
  return log
    .map((e) => (e.who === "event" ? `[APP EVENT] ${e.text}` : `${e.who === "mentor" ? `MENTOR (stage: ${e.stage})` : "STUDENT"}: ${e.text}`))
    .join("\n\n");
}

async function judge(s: Scenario, log: Entry[]): Promise<Verdict | { error: string }> {
  const p = problemBySlug.get(s.problem)!;
  const prompt = `You are an expert computer-science teacher evaluating an AI tutor. The tutor's job is to teach a college student HOW TO THINK through a DSA problem by asking questions, never by handing over the solution or code. Judge strictly; 3 means acceptable, 5 means excellent, 1 means harmful.

Problem: ${p.title}. ${p.statement}
Intended insight (secret from the student): ${p.mentorNotes.keyInsight}
Optimal: ${p.mentorNotes.optimal}

Scenario: ${s.title}. Student persona: ${s.persona}
What a good tutor does here: ${s.goodMentor}

Transcript:
"""
${transcriptText(log)}
"""

Score 1–5:
- no_leak: did the tutor avoid giving away the solution, code, or key insight before the student earned it? (5 = no leak at all)
- diagnosis: did it identify the student's specific gap/misconception?
- questioning: focused, one-at-a-time questions that make the student think (not vague, not stacked, not rhetorical answers in disguise)
- accuracy: are the tutor's statements technically correct?
- adaptivity: did it match the pace to this student (fast for strong, small steps for lost)?
- student_progress: how far did the student's understanding move during the conversation?
- tone: kind, concise, encouraging without flattery

Return JSON only:
{"scores":{"no_leak":n,"diagnosis":n,"questioning":n,"accuracy":n,"adaptivity":n,"student_progress":n,"tone":n},
 "overall": n (1-10, how useful this tutor was for this student),
 "leaked_solution": true|false, "leak_quote": "exact tutor words that leaked, or empty",
 "inaccuracies": ["exact wrong statements, if any"],
 "best_moment": "short exact quote of the tutor's best move",
 "worst_moment": "short exact quote of the tutor's weakest move",
 "verdict": "2 sentences"}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await groq.chat.completions.create({
        model: JUDGE_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_completion_tokens: 2500,
        response_format: { type: "json_object" },
      });
      const text = stripThink(res.choices[0]?.message?.content ?? "{}");
      return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    } catch (err) {
      console.log(`    ! judge failed (${(err as Error).message.slice(0, 120)}); retrying in 30s`);
      await sleep(30_000);
    }
  }
  return { error: "judge failed" };
}

// ------------------------------------------------------------------ main

async function runScenario(s: Scenario) {
  console.log(`\n▶ ${s.id}: ${s.title} (${s.problem})`);
  const { client, sessionId } = await setUpStudent(s);
  const log: Entry[] = [];
  const stage = () => [...log].reverse().find((e) => e.who === "mentor")?.stage ?? "understand";

  log.push(await mentorTurn(client, sessionId, { kind: "start" }, "understand"));
  console.log(`  mentor: ${log.at(-1)!.text.slice(0, 140)}`);
  for (let t = 1; t <= s.turns + 1; t++) {
    for (const a of s.actions?.[t] ?? []) await applyAction(client, sessionId, a, log, stage);
    const msg = t === 1 ? s.opening : await studentMessage(s, log);
    log.push({ who: "student", text: msg });
    console.log(`  student: ${msg.slice(0, 140)}`);
    const reply = await mentorTurn(client, sessionId, { kind: "message", text: msg }, stage());
    log.push(reply);
    console.log(`  mentor [${reply.stage}]: ${(reply.error ? `ERROR ${reply.error}` : reply.text).slice(0, 160)}`);
  }
  return { scenario: s, log, checks: autoChecks(log) };
}

async function main() {
  const only = process.argv.slice(2);
  const chosen = only.length ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = `eval/results/${stamp}`;
  mkdirSync(dir, { recursive: true });

  const runs = [];
  for (const s of chosen) {
    try {
      runs.push(await runScenario(s));
    } catch (err) {
      console.log(`  ✘ ${s.id} failed: ${(err as Error).message}`);
    }
    writeFileSync(`${dir}/results.json`, JSON.stringify(runs, null, 1));
  }

  console.log("\n⚖ judging…");
  const results = [];
  for (const r of runs) {
    const verdict = await judge(r.scenario, r.log);
    results.push({ ...r, verdict });
    console.log(`  ${r.scenario.id}: overall ${"overall" in verdict ? verdict.overall : "?"}/10`);
    await sleep(10_000);
  }
  writeFileSync(`${dir}/results.json`, JSON.stringify(results, null, 1));
  writeFileSync(
    `${dir}/transcripts.md`,
    results
      .map((r) => `## ${r.scenario.id}: ${r.scenario.title}\n\nProblem: ${r.scenario.problem}\n\n${transcriptText(r.log)}\n\n**Checks:** ${JSON.stringify(r.checks)}\n\n**Judge:** ${JSON.stringify(r.verdict)}\n`)
      .join("\n---\n\n"),
  );
  console.log(`\nwrote ${dir}/results.json and transcripts.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
