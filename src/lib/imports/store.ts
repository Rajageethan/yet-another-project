import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppUser } from "@/lib/session";
import type { Compare, Difficulty, Problem, TestCase } from "@/problems";

/**
 * Imported problems live as one JSON file each in scripts/imports/ (written by
 * scripts/import_leetcode.py). This module edits them from the review page and
 * publishes the approved ones to src/problems/imported.json. Dev only: it writes source files.
 */
const IMPORTS_DIR = path.join(process.cwd(), "scripts", "imports");
const ORIGINALS_DIR = path.join(process.cwd(), ".cache", "leetcodedataset", "originals");
const PUBLISHED_FILE = path.join(process.cwd(), "src", "problems", "imported.json");

export type Draft = {
  title: string;
  statement: string;
  constraints: string[];
  pattern: string;
  mentorNotes: Problem["mentorNotes"];
  draftedAt?: string;
  edited?: boolean;
};

export type ImportRecord = {
  id: string;
  status: "pending" | "approved" | "rejected";
  slug?: string;
  source: { dataset: string; license: string; questionId: number; taskId: string; tags: string[] };
  difficulty: Difficulty;
  topic: string;
  functionName: { python: string; javascript: string };
  params: string[];
  compare: Compare;
  tests: TestCase[];
  hiddenTests: TestCase[];
  verification: { datasetCases: number; parsedCases: number; agreedCases: number; secondSolution: boolean };
  referenceSolution: string;
  draft: Draft | null;
  reviewNote?: string;
};

export function isAdmin(user: AppUser) {
  if (process.env.NODE_ENV === "production") return false;
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(user.email.toLowerCase());
}

const safeId = (id: string) => /^lc-\d+$/.test(id);

export async function listImports(): Promise<ImportRecord[]> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(IMPORTS_DIR)).filter((n) => /^lc-\d+\.json$/.test(n));
  } catch {
    return [];
  }
  const recs = await Promise.all(names.map((n) => fs.readFile(path.join(IMPORTS_DIR, n), "utf8").then((t) => JSON.parse(t))));
  return (recs as ImportRecord[]).sort((a, b) => a.source.questionId - b.source.questionId);
}

export async function readImport(id: string): Promise<ImportRecord | null> {
  if (!safeId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(IMPORTS_DIR, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

export async function writeImport(rec: ImportRecord) {
  if (!safeId(rec.id)) throw new Error("bad id");
  await fs.writeFile(path.join(IMPORTS_DIR, `${rec.id}.json`), JSON.stringify(rec, null, 1) + "\n", "utf8");
}

/** The original LeetCode wording, kept only in the local cache for side-by-side review. */
export async function readOriginal(id: string): Promise<{ title: string; description: string } | null> {
  if (!safeId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(ORIGINALS_DIR, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

function starter(fn: ImportRecord["functionName"], params: string[]) {
  return {
    python: `def ${fn.python}(${params.join(", ")}):\n    pass\n`,
    javascript: `function ${fn.javascript}(${params.join(", ")}) {\n  \n}\n`,
  };
}

export function kebab(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function toProblem(rec: ImportRecord): Problem {
  const d = rec.draft!;
  return {
    slug: rec.slug!,
    title: d.title,
    difficulty: rec.difficulty,
    topic: rec.topic,
    pattern: d.pattern,
    statement: d.statement,
    constraints: d.constraints,
    functionName: rec.functionName,
    params: rec.params,
    starter: starter(rec.functionName, rec.params),
    compare: rec.compare,
    tests: rec.tests,
    hiddenTests: rec.hiddenTests,
    mentorNotes: d.mentorNotes,
    source: { dataset: rec.source.dataset, license: rec.source.license, questionId: rec.source.questionId },
  };
}

/** Rewrites src/problems/imported.json from every approved import. */
export async function publishApproved() {
  const approved = (await listImports()).filter((r) => r.status === "approved" && r.draft && r.slug);
  await fs.writeFile(PUBLISHED_FILE, JSON.stringify(approved.map(toProblem), null, 1) + "\n", "utf8");
  return approved.length;
}
