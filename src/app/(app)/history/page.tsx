import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDay } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { TOPICS, getProblem } from "@/problems";

export const metadata: Metadata = { title: "History" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "solved", label: "Solved" },
  { id: "help", label: "Needed help" },
  { id: "review", label: "Re-solves" },
] as const;

export default async function HistoryPage(props: PageProps<"/history">) {
  const user = await requireUser();
  const sp = (await props.searchParams) as { q?: string; topic?: string; result?: string; limit?: string };
  const q = (sp.q ?? "").trim().toLowerCase();
  const topic = sp.topic ?? "";
  const result = FILTERS.some((f) => f.id === sp.result) ? sp.result! : "all";
  const limit = Math.min(500, Math.max(20, Number(sp.limit) || 20));

  const [sessions, assignments] = await Promise.all([
    db.session.findMany({
      where: { userId: user.id, messages: { some: {} } },
      include: { assessment: true },
      orderBy: [{ date: "desc" }, { startedAt: "desc" }],
    }),
    db.dailyAssignment.findMany({ where: { userId: user.id }, select: { date: true, problemSlug: true, kind: true } }),
  ]);
  const reviewKeys = new Set(assignments.filter((a) => a.kind === "review").map((a) => a.date + a.problemSlug));

  const rows = sessions
    .map((s) => {
      const p = getProblem(s.problemSlug);
      const review = reviewKeys.has(s.date + s.problemSlug);
      const solved = s.status === "solved";
      const help = !solved || s.hintsUsed >= 3;
      const mins = s.solvedAt ? Math.max(1, Math.round((s.solvedAt.getTime() - s.startedAt.getTime()) / 60000)) : null;
      return { s, p, review, solved, help, mins };
    })
    .filter((r) => !q || r.p.title.toLowerCase().includes(q) || r.p.pattern.toLowerCase().includes(q))
    .filter((r) => !topic || r.p.topic === topic)
    .filter((r) => result === "all" || (result === "review" ? r.review : result === "solved" ? r.solved : r.help));

  const shown = rows.slice(0, limit);
  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ ...(q && { q }), ...(topic && { topic }), ...(result !== "all" && { result }), ...patch });
    for (const [k, v] of [...params]) if (!v || (k === "result" && v === "all")) params.delete(k);
    return `/history${params.size ? `?${params}` : ""}`;
  };

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4.5 px-6 pb-14 pt-8">
      <div>
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.015em]">History</h1>
        <p className="m-0 mt-0.5 text-muted">Every session, with the full chat and final code.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <form role="search" action="/history" className="flex flex-[1_1_420px] flex-wrap items-center gap-2.5">
          {result !== "all" && <input type="hidden" name="result" value={result} />}
          <label htmlFor="q" className="sr-only">
            Search problems
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={sp.q ?? ""}
            placeholder="Search problems or patterns"
            className="min-h-10 flex-[1_1_220px] rounded-lg border border-field bg-surface px-3"
          />
          <label className="inline-flex items-center gap-1.5 text-muted">
            Topic
            <select name="topic" defaultValue={topic} className="min-h-10 rounded-lg border border-field bg-surface px-2.5 text-ink">
              <option value="">All topics</option>
              {TOPICS.slice(0, 5).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="min-h-10 rounded-lg border border-field bg-surface px-3.5 hover:bg-ground">
            Apply
          </button>
        </form>
        <div role="group" aria-label="Result" className="inline-flex overflow-hidden rounded-lg border border-field bg-surface">
          {FILTERS.map((f, i) => (
            <Link
              key={f.id}
              href={href({ result: f.id })}
              aria-current={result === f.id ? "true" : undefined}
              className={`inline-flex min-h-[38px] items-center px-3 ${i ? "border-l border-field" : ""} ${
                result === f.id ? "bg-ink text-white" : "text-ink hover:bg-ground"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {/* relative: keeps the absolutely positioned sr-only label inside the scroll box (else the page scrolls sideways on phones) */}
      <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="text-left text-xs text-muted">
              {["Date", "Problem", "Pattern", "Level", "Score", "Hints", "Time", "Result"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className={`border-b border-line px-4 py-3 font-medium ${["Score", "Hints", "Time"].includes(h) ? "text-right" : ""}`}
                >
                  {h}
                </th>
              ))}
              <th scope="col" className="border-b border-line px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">
                  {sessions.length ? "No sessions match these filters." : "Your sessions will show up here after your first problem."}
                </td>
              </tr>
            )}
            {shown.map(({ s, p, review, solved, help, mins }) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap border-b border-line-soft px-4 py-3 text-muted">{formatDay(s.date)}</td>
                <td className="border-b border-line-soft px-4 py-3 font-medium">{p.title}</td>
                <td className="border-b border-line-soft px-4 py-3 text-ink-2">{s.status === "solved" ? p.pattern : "—"}</td>
                <td className="border-b border-line-soft px-4 py-3 capitalize text-ink-2">{p.difficulty}</td>
                <td className="border-b border-line-soft px-4 py-3 text-right font-medium tabular-nums">{s.assessment?.thinkingScore ?? "—"}</td>
                <td className="border-b border-line-soft px-4 py-3 text-right tabular-nums">{s.hintsUsed}</td>
                <td className="border-b border-line-soft px-4 py-3 text-right tabular-nums text-muted">{mins ? `${mins}m` : "—"}</td>
                <td className="border-b border-line-soft px-4 py-3">
                  <span className="flex flex-wrap gap-1">
                    {solved ? (
                      <span className="whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">Solved</span>
                    ) : (
                      <span className="whitespace-nowrap rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn-strong">Unsolved</span>
                    )}
                    {solved && help && (
                      <span className="whitespace-nowrap rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn-strong">Needed help</span>
                    )}
                    {review && (
                      <span className="whitespace-nowrap rounded-full border border-field px-2 py-px text-xs font-medium text-ink-2">Re-solve</span>
                    )}
                  </span>
                </td>
                <td className="border-b border-line-soft px-4 py-1.5 text-right">
                  <Link href={`/session/${s.id}`} className="inline-flex min-h-9 items-center font-medium">
                    Replay
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-muted">
          <span>
            Showing {shown.length} of {rows.length} sessions
          </span>
          {rows.length > shown.length && (
            <Link href={href({ limit: String(limit + 20) })} className="inline-flex min-h-10 items-center rounded-lg border border-field bg-surface px-4 text-ink">
              Load more
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
