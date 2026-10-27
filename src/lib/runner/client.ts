"use client";

import type { Compare, Language, TestCase } from "@/problems";
import type { CaseResult, RunResult } from "./types";

const TIME_LIMIT_MS: Record<Language, number> = { python: 6000, javascript: 3000 };
const LOAD_TIMEOUT_MS = 90_000;

type RawCase = { args: unknown[]; expected: unknown; got?: unknown; error?: string };
type RawResult = { cases: RawCase[]; error?: string; stdout?: string; ms?: number };

function deepSort(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  return v
    .map(deepSort)
    .map((x) => [JSON.stringify(x), x] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, x]) => x);
}

function canon(v: unknown, compare: Compare) {
  if (compare === "unordered" && Array.isArray(v)) return v.map((x) => JSON.stringify(x)).sort();
  if (compare === "unordered_deep") return deepSort(v);
  return v;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Same tolerance LeetCode uses for float answers.
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return deepEqual(ka, kb) && ka.every((k) => deepEqual((a as never)[k], (b as never)[k]));
  }
  return false;
}

class WorkerHandle {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private seq = 0;

  constructor(private url: string) {}

  /** Starts the worker (and, for Python, downloads Pyodide) ahead of the first run. */
  warm() {
    if (!this.ready) {
      const worker = new Worker(this.url);
      this.worker = worker;
      this.ready = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("The code runner took too long to load. Check your connection.")), LOAD_TIMEOUT_MS);
        worker.addEventListener("message", function onMsg(e: MessageEvent) {
          if (e.data?.type === "ready") {
            clearTimeout(timer);
            worker.removeEventListener("message", onMsg);
            resolve();
          } else if (e.data?.type === "load_error") {
            clearTimeout(timer);
            reject(new Error("Couldn't load the Python runtime: " + e.data.error));
          }
        });
        worker.addEventListener("error", (e) => {
          clearTimeout(timer);
          reject(new Error(e.message || "Runner crashed while loading"));
        });
      });
      this.ready.catch(() => this.reset());
    }
    return this.ready;
  }

  reset() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }

  async run(payload: object, timeLimit: number): Promise<RawResult> {
    await this.warm();
    const worker = this.worker!;
    const id = ++this.seq;
    return new Promise<RawResult>((resolve) => {
      const timer = setTimeout(() => {
        worker.removeEventListener("message", onMsg);
        this.reset();
        resolve({
          cases: [],
          error: `Time limit exceeded (${timeLimit / 1000}s). Look for an infinite loop or a very slow approach.`,
        });
      }, timeLimit);
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type === "result" && e.data.id === id) {
          clearTimeout(timer);
          worker.removeEventListener("message", onMsg);
          resolve(e.data.result as RawResult);
        }
      };
      worker.addEventListener("message", onMsg);
      worker.postMessage({ id, ...payload });
    });
  }
}

const handles: Partial<Record<Language, WorkerHandle>> = {};

function handle(language: Language) {
  return (handles[language] ??= new WorkerHandle(
    language === "python" ? "/workers/python-runner.js" : "/workers/js-runner.js",
  ));
}

export function warmRunner(language: Language) {
  return handle(language).warm().catch(() => undefined);
}

export async function runTests(opts: {
  language: Language;
  code: string;
  fnName: string;
  tests: TestCase[];
  compare: Compare;
}): Promise<RunResult> {
  const { language, code, fnName, tests, compare } = opts;
  let raw: RawResult;
  try {
    raw = await handle(language).run({ code, fnName, tests }, TIME_LIMIT_MS[language]);
  } catch (err) {
    return { cases: [], error: err instanceof Error ? err.message : String(err) };
  }
  const cases: CaseResult[] = raw.cases.map((c) => ({
    ...c,
    passed: !c.error && deepEqual(canon(c.got, compare), canon(c.expected, compare)),
  }));
  return { cases, error: raw.error, stdout: raw.stdout, ms: raw.ms };
}
