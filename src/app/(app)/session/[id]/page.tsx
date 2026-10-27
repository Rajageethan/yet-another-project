import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/RichText";
import { BulbIcon, CalendarIcon, CheckIcon } from "@/components/icons";
import { db } from "@/lib/db";
import { dayKey, formatDay } from "@/lib/dates";
import { RUBRIC } from "@/lib/mentor/assess";
import { HINT_LEVELS, hintPenalty } from "@/lib/mentor/prompt";
import { requireUser } from "@/lib/session";
import { getProblem } from "@/problems";
import { saveReflection } from "./actions";

export const metadata: Metadata = { title: "Session" };

function minutes(a: Date, b: Date | null) {
  if (!b) return null;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 60000));
}

export default async function SessionPage(props: PageProps<"/session/[id]">) {
  const { id } = await props.params;
  const { saved } = (await props.searchParams) as { saved?: string };
  const user = await requireUser();
  const session = await db.session.findFirst({
    where: { id, userId: user.id },
    include: { assessment: true, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) notFound();

  const problem = getProblem(session.problemSlug);
  const a = session.assessment;
  const review = await db.reviewSchedule.findUnique({
    where: { userId_problemSlug: { userId: user.id, problemSlug: problem.slug } },
  });
  const avg = await db.assessment.aggregate({
    where: { session: { userId: user.id }, NOT: { sessionId: session.id } },
    _avg: { thinkingScore: true },
  });
  const cards = await db.assessment.count({ where: { session: { userId: user.id }, keyInsight: { not: null } } });
  const solved = session.status === "solved";
  const mins = minutes(session.startedAt, session.solvedAt);
  const vsAvg = a && avg._avg.thinkingScore != null ? Math.round(a.thinkingScore - avg._avg.thinkingScore) : null;
  const isToday = session.date === dayKey(user.timezone);

  return (
    <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-6 pb-14 pt-10">
      <div className="flex flex-col gap-2">
        {solved ? (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-strong">
            <CheckIcon size={13} />
            Solved · all {problem.tests.length + problem.hiddenTests.length} tests passed
          </span>
        ) : (
          <span className="self-start rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn-strong">Not solved</span>
        )}
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.015em]">{problem.title}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-muted">
          <span>
            {formatDay(session.date, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
            <span className="capitalize">{problem.difficulty}</span>
          </span>
          {mins && <span>{mins} min</span>}
          <span>
            {session.hintsUsed} {session.hintsUsed === 1 ? "hint" : "hints"}
          </span>
          <span>
            {session.runs} test {session.runs === 1 ? "run" : "runs"}
          </span>
          {solved && (
            <span>
              Pattern unlocked: <span className="font-medium text-ink">{problem.pattern}</span>
            </span>
          )}
        </div>
      </div>

      {a && (
        <div className="flex flex-wrap gap-4">
          <section aria-labelledby="score-h" className="flex min-w-0 flex-[1_1_380px] flex-col gap-4 rounded-xl border border-line bg-surface px-6 py-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="score-h" className="m-0 text-[13px] font-medium text-muted">
                  Thinking score
                </h2>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em]">{a.thinkingScore}</span>
                  <span className="text-muted">/ 100</span>
                </div>
              </div>
              {vsAvg !== null && (
                <span className={`text-[13px] font-medium ${vsAvg >= 0 ? "text-accent-strong" : "text-warn-strong"}`}>
                  {vsAvg >= 0 ? "+" : ""}
                  {vsAvg} vs your average
                </span>
              )}
            </div>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {RUBRIC.map((r) => {
                const v = a[r.key];
                return (
                  <li key={r.key} className="flex items-center gap-3">
                    <span className="min-w-0 flex-auto">{r.label}</span>
                    <span aria-hidden="true" className="flex gap-[3px]">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <span key={i} className={`h-2 w-[22px] rounded-sm ${i <= v ? "bg-accent" : "bg-line"}`} />
                      ))}
                    </span>
                    <span className="w-7 text-right tabular-nums text-ink-2">{v}/5</span>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line pt-3 text-[13px] text-muted">
              Independence:{" "}
              {session.hintsUsed === 0
                ? "no hints · no penalty"
                : `${session.hintsUsed} ${session.hintsUsed === 1 ? "hint" : "hints"} (${HINT_LEVELS.slice(0, session.hintsUsed)
                    .map((h) => h.name.toLowerCase())
                    .join(", ")}) · −${hintPenalty(session.hintsUsed)} points`}
            </div>
          </section>

          <section aria-labelledby="fb-h" className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5 rounded-xl border border-line bg-surface px-6 py-5">
            <h2 id="fb-h" className="m-0 text-[13px] font-medium text-muted">
              Mentor feedback
            </h2>
            <div className="flex flex-col gap-1">
              <span className="font-semibold">What went well</span>
              <RichText text={a.wentWell} className="text-ink-2" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-semibold">Work on</span>
              <RichText text={a.workOn} className="text-ink-2" />
            </div>
            {review && (
              <div className="mt-auto flex items-center gap-2 rounded-lg bg-ground px-3 py-2.5 text-[13px]">
                <CalendarIcon size={15} />
                <span>
                  Quick re-solve scheduled for{" "}
                  <span className="font-semibold">{formatDay(review.dueDate, { weekday: "short", month: "short", day: "numeric" })}</span> (in{" "}
                  {review.intervalDays} days)
                </span>
              </div>
            )}
          </section>
        </div>
      )}

      {a && (
        <form
          action={saveReflection}
          id="reflect"
          aria-labelledby="ref-h"
          className="flex flex-wrap gap-6 rounded-xl border border-line bg-surface px-6 py-5"
        >
          <input type="hidden" name="sessionId" value={session.id} />
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-2">
            <h2 id="ref-h" className="m-0 text-[15px] font-semibold">
              Reflect
            </h2>
            <label htmlFor="insight" className="text-muted">
              What was the key insight, in one sentence?
            </label>
            <textarea
              id="insight"
              name="keyInsight"
              rows={3}
              required
              maxLength={300}
              defaultValue={a.keyInsight ?? ""}
              placeholder="In your own words…"
              className="w-full resize-y rounded-[10px] border border-field bg-surface px-3 py-2.5"
            />
          </div>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2">
            <span className="text-muted">Pattern card {a.keyInsight ? "" : "preview"}</span>
            <div className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-[#FCFCFB] px-4 py-3.5">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{a.patternName ?? problem.pattern}</span>
                <span className="text-xs text-muted">Card {a.keyInsight ? cards : cards + 1}</span>
              </div>
              <span className="text-ink-2">{a.keyInsight || a.patternCard}</span>
              {a.complexityStr && <span className="font-mono text-xs text-muted">{a.complexityStr}</span>}
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3">
            <button type="submit" className="min-h-11 rounded-lg bg-accent px-4.5 font-medium text-white hover:bg-accent-strong">
              {a.keyInsight ? "Update notebook" : "Save to notebook"}
            </button>
            {saved && a.keyInsight && (
              <span role="status" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-strong">
                <CheckIcon size={14} />
                Saved to your pattern notebook
              </span>
            )}
            <Link
              href="/progress"
              className="inline-flex min-h-11 items-center rounded-lg border border-field bg-surface px-4.5 font-medium text-ink"
            >
              View progress
            </Link>
            {isToday && solved && <span className="ml-auto text-muted">Your next problem unlocks tomorrow.</span>}
          </div>
        </form>
      )}

      {!solved && isToday && (
        <Link href="/today" className="inline-flex min-h-11 items-center self-start rounded-lg bg-ink px-4.5 font-medium text-white">
          Back to the problem
        </Link>
      )}

      <details className="rounded-xl border border-line bg-surface px-6 py-4" open={!a}>
        <summary className="cursor-pointer font-semibold">Session replay · {session.messages.length} messages</summary>
        <div className="mt-4 flex flex-col gap-3">
          {session.messages.map((m) =>
            m.role === "event" ? (
              <div key={m.id} className="self-center rounded-full bg-ground px-3 py-1 text-xs text-muted">
                {m.content}
              </div>
            ) : m.role === "user" ? (
              <div key={m.id} className="max-w-[80%] self-end rounded-[12px_12px_4px_12px] bg-bubble px-3.5 py-2.5">
                {m.meta && JSON.parse(m.meta).hint ? (
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <BulbIcon size={14} /> Asked for a hint (level {JSON.parse(m.meta).hint})
                  </span>
                ) : (
                  <p className="m-0 whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            ) : (
              <div key={m.id} className="flex max-w-[88%] flex-col gap-1">
                <span className="text-xs font-semibold text-accent">Mentor</span>
                <RichText text={m.content} />
              </div>
            ),
          )}
          <div className="mt-2 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted">Final code ({session.language})</span>
            <pre className="m-0 overflow-x-auto rounded-lg bg-ground px-4 py-3 font-mono text-[12.5px] leading-relaxed">{session.code}</pre>
          </div>
        </div>
      </details>
    </main>
  );
}
