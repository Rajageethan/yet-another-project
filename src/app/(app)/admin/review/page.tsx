import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/RichText";
import { formatArgs, formatValue, truncate } from "@/lib/format";
import { isAdmin, listImports, readOriginal, type ImportRecord } from "@/lib/imports/store";
import { requireUser } from "@/lib/session";
import { TOPICS, topicName } from "@/problems";
import { draftNext, draftOne, rejectImport, reopenImport, saveReview } from "./actions";

export const metadata: Metadata = { title: "Review imports" };

const FILTERS = [
  { id: "todo", label: "To review" },
  { id: "undrafted", label: "No draft" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
] as const;

function matches(r: ImportRecord, f: string) {
  if (f === "todo") return r.status === "pending" && !!r.draft;
  if (f === "undrafted") return r.status === "pending" && !r.draft;
  if (f === "approved" || f === "rejected") return r.status === f;
  return true;
}

const field = "w-full rounded-lg border border-field bg-surface px-3 py-2";

export default async function ReviewPage(props: PageProps<"/admin/review">) {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();

  const sp = (await props.searchParams) as { id?: string; filter?: string; msg?: string };
  const all = await listImports();
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, all.filter((r) => matches(r, f.id)).length]));
  const filter = FILTERS.some((f) => f.id === sp.filter)
    ? sp.filter!
    : counts.todo > 0
      ? "todo"
      : counts.undrafted > 0
        ? "undrafted"
        : "all";
  const shown = all.filter((r) => matches(r, filter));
  const rec = all.find((r) => r.id === sp.id) ?? shown[0] ?? null;
  const original = rec ? await readOriginal(rec.id) : null;
  const d = rec?.draft;

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 pb-14 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[24px] font-semibold tracking-[-0.015em]">Review imported problems</h1>
          <p className="m-0 mt-0.5 text-muted">
            From LeetCodeDataset (Apache-2.0). Tests are already verified; check the rewritten wording and mentor notes, then approve.
          </p>
        </div>
        <form action={draftNext} className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            Draft next
            <select name="count" defaultValue="3" className="min-h-9 rounded-md border border-field bg-surface px-2 text-ink">
              {[1, 3, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={counts.undrafted === 0} className="min-h-9 rounded-lg bg-ink px-3.5 font-medium text-white disabled:opacity-50">
            Draft with AI
          </button>
        </form>
      </div>

      {sp.msg && (
        <p role="status" className="m-0 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px]">
          {sp.msg}
        </p>
      )}

      {all.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-field px-5 py-8 text-center text-muted">
          No imports yet. Run <code className="font-mono">python -I scripts/import_leetcode.py --per-topic 6</code>.
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          {/* ---------------------------------------- list */}
          <nav aria-label="Imported problems" className="flex w-full flex-col gap-2 lg:sticky lg:top-4 lg:w-[300px] lg:flex-none">
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Link
                  key={f.id}
                  href={`/admin/review?filter=${f.id}`}
                  aria-current={filter === f.id ? "true" : undefined}
                  className={`inline-flex min-h-8 items-center rounded-full px-2.5 text-xs ${
                    filter === f.id ? "bg-ink text-white" : "border border-line bg-surface text-ink-2 hover:bg-ground"
                  }`}
                >
                  {f.label} · {counts[f.id]}
                </Link>
              ))}
            </div>
            <ul className="m-0 flex max-h-[70vh] list-none flex-col overflow-y-auto rounded-xl border border-line bg-surface p-1">
              {shown.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-muted">Nothing here.</li>}
              {shown.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/review?filter=${filter}&id=${r.id}`}
                    aria-current={rec?.id === r.id ? "true" : undefined}
                    className={`flex flex-col rounded-lg px-3 py-2 text-ink ${rec?.id === r.id ? "bg-accent-tint" : "hover:bg-ground"}`}
                  >
                    <span className="truncate font-medium">{r.draft?.title || r.source.taskId}</span>
                    <span className="text-xs text-muted">
                      {topicName(r.topic)} · {r.difficulty} · #{r.source.questionId}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ---------------------------------------- detail */}
          {rec && (
            <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={rec.status} />
                <span className="font-mono text-[13px] text-muted">
                  {rec.id} · {rec.source.taskId}
                  {rec.slug ? ` → ${rec.slug}` : ""}
                </span>
                <span className="text-[13px] text-muted">
                  · {rec.verification.agreedCases}/{rec.verification.parsedCases} dataset tests agreed
                  {rec.verification.secondSolution ? " (2 solutions)" : " (1 solution)"}
                </span>
                <form action={draftOne} className="ml-auto">
                  <input type="hidden" name="id" value={rec.id} />
                  <button type="submit" className="min-h-9 rounded-lg border border-field bg-surface px-3 hover:bg-ground">
                    {d ? "Redraft with AI" : "Draft with AI"}
                  </button>
                </form>
              </div>

              <div className="flex flex-wrap gap-4">
                {/* original */}
                <section aria-labelledby="orig-h" className="flex min-w-0 flex-[1_1_380px] flex-col gap-2 rounded-xl border border-line bg-surface px-5 py-4">
                  <h2 id="orig-h" className="m-0 text-[13px] font-medium text-muted">
                    Original (for checking meaning only, not published)
                  </h2>
                  {original ? (
                    <>
                      <span className="font-semibold">{original.title}</span>
                      <div className="max-h-[520px] overflow-y-auto whitespace-pre-wrap text-[13px] text-ink-2">
                        {original.description.replace(/ /g, " ")}
                      </div>
                    </>
                  ) : (
                    <p className="m-0 text-[13px] text-warn">Original not in .cache/. Re-run the importer to restore it.</p>
                  )}
                </section>

                {/* rendered preview */}
                <section aria-labelledby="prev-h" className="flex min-w-0 flex-[1_1_380px] flex-col gap-2.5 rounded-xl border border-line bg-surface px-5 py-4">
                  <h2 id="prev-h" className="m-0 text-[13px] font-medium text-muted">
                    How students will see it
                  </h2>
                  {d ? (
                    <>
                      <span className="text-[17px] font-semibold">{d.title}</span>
                      <RichText text={d.statement} className="text-ink-2" />
                      <div className="flex flex-col gap-0.5 rounded-lg bg-ground px-3 py-2.5 font-mono text-[12.5px]">
                        {rec.tests.slice(0, 2).map((t, i) => (
                          <span key={i} className="break-words">
                            {truncate(formatArgs(t.args, rec.params, "python"), 160)} → {truncate(formatValue(t.expected, "python"), 80)}
                          </span>
                        ))}
                        {d.constraints.map((c) => (
                          <span key={c} className="text-muted">
                            {c}
                          </span>
                        ))}
                      </div>
                      <span className="font-mono text-xs text-muted">
                        {rec.functionName.python}({rec.params.join(", ")}) · {rec.functionName.javascript}({rec.params.join(", ")})
                      </span>
                    </>
                  ) : (
                    <p className="m-0 text-muted">No draft yet. Use “Draft with AI”, or write it below.</p>
                  )}
                </section>
              </div>

              <form key={`${rec.id}-${d?.draftedAt ?? "none"}`} action={saveReview} className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-5 py-4">
                <input type="hidden" name="id" value={rec.id} />
                <div className="flex flex-wrap gap-3">
                  <label className="flex flex-[2_1_260px] flex-col gap-1">
                    <span className="font-medium">Title</span>
                    <input name="title" defaultValue={d?.title ?? ""} className={field} />
                  </label>
                  <label className="flex flex-[1_1_160px] flex-col gap-1">
                    <span className="font-medium">Topic</span>
                    <select name="topic" defaultValue={rec.topic} className={field}>
                      {TOPICS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-[1_1_120px] flex-col gap-1">
                    <span className="font-medium">Difficulty</span>
                    <select name="difficulty" defaultValue={rec.difficulty} className={field}>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </label>
                  <label className="flex flex-[1_1_180px] flex-col gap-1">
                    <span className="font-medium">Answer order</span>
                    <select name="compare" defaultValue={rec.compare} className={field}>
                      <option value="exact">Must match exactly</option>
                      <option value="unordered">Any order (top level)</option>
                      <option value="unordered_deep">Any order (all levels)</option>
                    </select>
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="font-medium">Statement (markdown, no examples)</span>
                  <textarea name="statement" rows={6} defaultValue={d?.statement ?? ""} className={field} />
                </label>
                <div className="flex flex-wrap gap-3">
                  <label className="flex flex-[1_1_300px] flex-col gap-1">
                    <span className="font-medium">Constraints (one per line)</span>
                    <textarea name="constraints" rows={4} defaultValue={d?.constraints.join("\n") ?? ""} className={field} />
                  </label>
                  <label className="flex flex-[1_1_200px] flex-col gap-1">
                    <span className="font-medium">Pattern</span>
                    <input name="pattern" defaultValue={d?.pattern ?? ""} className={field} />
                    <span className="text-xs text-muted">Hidden from students until they solve it.</span>
                  </label>
                </div>

                <fieldset className="m-0 flex flex-col gap-3 border-0 border-t border-line-soft p-0 pt-3">
                  <legend className="float-left mb-1 w-full p-0 pt-3 font-semibold">Mentor notes (secret, guide the mentor)</legend>
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">Key insight</span>
                    <textarea name="keyInsight" rows={2} defaultValue={d?.mentorNotes.keyInsight ?? ""} className={field} />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex flex-[1_1_300px] flex-col gap-1">
                      <span className="font-medium">Brute force</span>
                      <textarea name="bruteForce" rows={2} defaultValue={d?.mentorNotes.bruteForce ?? ""} className={field} />
                    </label>
                    <label className="flex flex-[1_1_300px] flex-col gap-1">
                      <span className="font-medium">Optimal</span>
                      <textarea name="optimal" rows={2} defaultValue={d?.mentorNotes.optimal ?? ""} className={field} />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex flex-[1_1_300px] flex-col gap-1">
                      <span className="font-medium">Common mistakes (one per line)</span>
                      <textarea name="commonMistakes" rows={3} defaultValue={d?.mentorNotes.commonMistakes.join("\n") ?? ""} className={field} />
                    </label>
                    <label className="flex flex-[1_1_300px] flex-col gap-1">
                      <span className="font-medium">Edge cases (one per line)</span>
                      <textarea name="edgeCases" rows={3} defaultValue={d?.mentorNotes.edgeCases.join("\n") ?? ""} className={field} />
                    </label>
                  </div>
                </fieldset>

                <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
                  <button type="submit" name="intent" value="approve" className="min-h-10 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-strong">
                    {rec.status === "approved" ? "Save & keep published" : "Approve & publish"}
                  </button>
                  <button type="submit" name="intent" value="save" className="min-h-10 rounded-lg border border-field bg-surface px-4">
                    Save draft
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap items-start gap-4">
                <section aria-labelledby="tests-h" className="flex min-w-0 flex-[1_1_440px] flex-col gap-2 rounded-xl border border-line bg-surface px-5 py-4">
                  <h2 id="tests-h" className="m-0 text-[13px] font-medium text-muted">
                    Tests · {rec.tests.length} visible, {rec.hiddenTests.length} hidden
                  </h2>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-[12.5px]">
                    {[...rec.tests, ...rec.hiddenTests.slice(0, 4)].map((t, i) => (
                      <li key={i} className="break-words">
                        <span className="text-muted">{i < rec.tests.length ? "visible" : "hidden"} · </span>
                        {truncate(formatArgs(t.args, rec.params, "python"), 140)} → {truncate(formatValue(t.expected, "python"), 60)}
                      </li>
                    ))}
                  </ul>
                </section>
                <details className="min-w-0 flex-[1_1_380px] rounded-xl border border-line bg-surface px-5 py-4">
                  <summary className="cursor-pointer text-[13px] font-medium text-muted">Reference solution</summary>
                  <pre className="m-0 mt-2 overflow-x-auto font-mono text-[12.5px]">{rec.referenceSolution}</pre>
                </details>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                {rec.status !== "rejected" ? (
                  <form action={rejectImport} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={rec.id} />
                    <label className="flex flex-col gap-1 text-[13px]">
                      Reject reason (optional)
                      <input name="note" defaultValue={rec.reviewNote ?? ""} className="min-h-9 w-72 rounded-lg border border-field bg-surface px-3" />
                    </label>
                    <button type="submit" className="min-h-9 rounded-lg border border-[#E8C4B0] bg-surface px-3.5 text-warn">
                      Reject
                    </button>
                  </form>
                ) : null}
                {rec.status !== "pending" && (
                  <form action={reopenImport}>
                    <input type="hidden" name="id" value={rec.id} />
                    <button type="submit" className="min-h-9 rounded-lg border border-field bg-surface px-3.5">
                      Move back to pending
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: ImportRecord["status"] }) {
  const s = {
    pending: "bg-bubble text-ink-2",
    approved: "bg-accent-soft text-accent-strong",
    rejected: "bg-warn-soft text-warn-strong",
  }[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${s}`}>{status}</span>;
}
