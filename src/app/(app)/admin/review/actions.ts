"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { draftImport } from "@/lib/imports/draft";
import { isAdmin, kebab, listImports, publishApproved, readImport, writeImport, type ImportRecord } from "@/lib/imports/store";
import { getUser } from "@/lib/session";
import { TOPICS, problems, type Compare, type Difficulty } from "@/problems";

async function admin() {
  const user = await getUser();
  if (!user || !isAdmin(user)) redirect("/today");
  return user;
}

const back = (id: string, msg?: string, filter?: string) => {
  const p = new URLSearchParams({ id });
  if (msg) p.set("msg", msg);
  if (filter) p.set("filter", filter);
  return `/admin/review?${p}`;
};

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export async function draftOne(form: FormData) {
  const user = await admin();
  const id = String(form.get("id"));
  const rec = await readImport(id);
  if (!rec) redirect("/admin/review");
  let msg = "Draft written. Review it against the original below.";
  try {
    rec.draft = await draftImport(user, rec);
    await writeImport(rec);
  } catch (err) {
    msg = "Drafting failed: " + (err instanceof Error ? err.message : String(err));
  }
  redirect(back(id, msg));
}

/** Drafts the next few undrafted imports one after another (gentle on the free-tier rate limit). */
export async function draftNext(form: FormData) {
  const user = await admin();
  const count = Math.min(5, Math.max(1, Number(form.get("count")) || 3));
  const todo = (await listImports()).filter((r) => r.status === "pending" && !r.draft).slice(0, count);
  let done = 0;
  let error = "";
  for (const rec of todo) {
    try {
      rec.draft = await draftImport(user, rec);
      await writeImport(rec);
      done++;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      break;
    }
  }
  const first = todo[0]?.id ?? "";
  redirect(back(first, `Drafted ${done} of ${todo.length}.${error ? " Stopped: " + error : ""}`));
}

export async function saveReview(form: FormData) {
  await admin();
  const id = String(form.get("id"));
  const intent = String(form.get("intent") ?? "save");
  const rec = await readImport(id);
  if (!rec) redirect("/admin/review");

  const topic = String(form.get("topic"));
  const difficulty = String(form.get("difficulty"));
  const compare = String(form.get("compare"));
  if (TOPICS.some((t) => t.id === topic)) rec.topic = topic;
  if (["easy", "medium", "hard"].includes(difficulty)) rec.difficulty = difficulty as Difficulty;
  if (["exact", "unordered", "unordered_deep"].includes(compare)) rec.compare = compare as Compare;

  rec.draft = {
    ...(rec.draft ?? {}),
    title: String(form.get("title") ?? "").trim(),
    statement: String(form.get("statement") ?? "").trim(),
    constraints: lines(form.get("constraints")),
    pattern: String(form.get("pattern") ?? "").trim(),
    mentorNotes: {
      keyInsight: String(form.get("keyInsight") ?? "").trim(),
      bruteForce: String(form.get("bruteForce") ?? "").trim(),
      optimal: String(form.get("optimal") ?? "").trim(),
      commonMistakes: lines(form.get("commonMistakes")),
      edgeCases: lines(form.get("edgeCases")),
    },
    edited: true,
  };

  if (intent === "approve") {
    const d = rec.draft;
    const missing = [
      !d.title && "title",
      !d.statement && "statement",
      !d.pattern && "pattern",
      !d.mentorNotes.keyInsight && "key insight",
      !d.mentorNotes.optimal && "optimal approach",
    ].filter(Boolean);
    if (missing.length) {
      await writeImport(rec);
      redirect(back(id, `Saved, but can't approve yet. Missing: ${missing.join(", ")}.`));
    }
    if (!rec.slug) rec.slug = await uniqueSlug(kebab(d.title), rec);
    rec.status = "approved";
    await writeImport(rec);
    const n = await publishApproved();
    const next = (await listImports()).find((r) => r.status === "pending" && r.draft && r.id !== id);
    redirect(back(next?.id ?? id, `Approved "${d.title}" as ${rec.slug}. ${n} imported problems are now live.`));
  }

  await writeImport(rec);
  if (rec.status === "approved") await publishApproved();
  redirect(back(id, "Saved."));
}

async function uniqueSlug(base: string, rec: ImportRecord) {
  const others = (await listImports()).filter((r) => r.id !== rec.id && r.slug).map((r) => r.slug!);
  const taken = new Set([...problems.map((p) => p.slug), ...others]);
  let slug = base || rec.id;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

async function setStatus(id: string, status: ImportRecord["status"], note?: string) {
  const rec = await readImport(id);
  if (!rec) redirect("/admin/review");
  if (rec.status === "approved" && rec.slug) {
    const used = await db.session.count({ where: { problemSlug: rec.slug } });
    if (used > 0) redirect(back(id, `Can't unpublish: ${used} student sessions already use this problem. Edit it instead.`));
  }
  rec.status = status;
  if (note !== undefined) rec.reviewNote = note;
  await writeImport(rec);
  await publishApproved();
  return rec;
}

export async function rejectImport(form: FormData) {
  await admin();
  const id = String(form.get("id"));
  await setStatus(id, "rejected", String(form.get("note") ?? "").trim() || undefined);
  const next = (await listImports()).find((r) => r.status === "pending" && r.id !== id);
  redirect(back(next?.id ?? id, "Rejected."));
}

export async function reopenImport(form: FormData) {
  await admin();
  const id = String(form.get("id"));
  await setStatus(id, "pending");
  redirect(back(id, "Moved back to pending."));
}
