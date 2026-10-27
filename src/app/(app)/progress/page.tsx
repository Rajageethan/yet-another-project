import type { Metadata } from "next";
import Link from "next/link";
import { FlameIcon } from "@/components/icons";
import { db } from "@/lib/db";
import { addDays, dayKey, formatDay } from "@/lib/dates";
import { liveStreak } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { TOPICS, getProblem, problems, topicName } from "@/problems";

export const metadata: Metadata = { title: "Progress" };

const HEAT = ["bg-line-soft", "bg-accent-light", "bg-accent-mid", "bg-accent"];
const GOAL_LABEL: Record<string, string> = {
  placements: "Placements track",
  competitive: "Competitive coding track",
  basics: "Basics track",
};
const LEVEL_LABEL = ["", "Easy", "Medium", "Hard"];

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export default async function ProgressPage() {
  const user = await requireUser();
  const today = dayKey(user.timezone);
  const [solved, mastery, reviews] = await Promise.all([
    db.session.findMany({
      where: { userId: user.id, status: "solved" },
      include: { assessment: true },
      orderBy: { solvedAt: "asc" },
    }),
    db.topicMastery.findMany({ where: { userId: user.id } }),
    db.reviewSchedule.findMany({
      where: { userId: user.id, dueDate: { lte: addDays(today, 1) } },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
  ]);

  const byDiff = { easy: 0, medium: 0, hard: 0 };
  for (const s of solved) byDiff[getProblem(s.problemSlug).difficulty]++;

  const month = today.slice(0, 7);
  const prevMonth = addDays(month + "-01", -1).slice(0, 7);
  const scored = solved.filter((s) => s.assessment);
  const scoreAll = avg(scored.map((s) => s.assessment!.thinkingScore));
  const scoreThis = avg(scored.filter((s) => s.date.startsWith(month)).map((s) => s.assessment!.thinkingScore));
  const scorePrev = avg(scored.filter((s) => s.date.startsWith(prevMonth)).map((s) => s.assessment!.thinkingScore));
  const hintsAll = avg(solved.map((s) => s.hintsUsed));
  const hintsPrev = avg(solved.filter((s) => s.date.startsWith(prevMonth)).map((s) => s.hintsUsed));

  // Heatmap: 26 weeks ending this week, columns are weeks starting Sunday.
  const weekday = new Date(today + "T00:00:00Z").getUTCDay();
  const start = addDays(today, -(25 * 7 + weekday));
  const levelByDay = new Map<string, number>();
  for (const s of solved) {
    const score = s.assessment?.thinkingScore ?? 0;
    const lvl = s.hintsUsed === 0 && score >= 75 ? 3 : s.hintsUsed <= 1 && score >= 55 ? 2 : 1;
    levelByDay.set(s.date, Math.max(levelByDay.get(s.date) ?? 0, lvl));
  }
  const cells: { day: string; level: number }[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) cells.push({ day: d, level: levelByDay.get(d) ?? 0 });
  const activeDays = cells.filter((c) => c.level > 0).length;

  const masteryOf = new Map(mastery.map((m) => [m.topic, m]));
  const available = TOPICS.filter((t) => problems.some((p) => p.topic === t.id));
  const focus = available.find((t) => (masteryOf.get(t.id)?.score ?? 0) < 70)?.id;

  const trend = scored.slice(-14).map((s) => s.assessment!.thinkingScore);
  const lo = Math.min(40, ...trend);
  const y = (v: number) => 110 - ((v - lo) / (100 - lo)) * 95;
  const points = trend.map((v, i) => `${trend.length === 1 ? 200 : 8 + i * (384 / (trend.length - 1))},${y(v).toFixed(1)}`).join(" ");

  const cards = solved
    .filter((s) => s.assessment)
    .reverse()
    .map((s) => ({ id: s.id, problem: getProblem(s.problemSlug), a: s.assessment! }));

  const streak = liveStreak(user);

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-6 pb-14 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.015em]">Progress</h1>
          <p className="m-0 mt-0.5 text-muted">
            {user.year && /^\d$/.test(user.year) ? `${["", "1st", "2nd", "3rd", "4th"][Number(user.year)]} year · ` : ""}
            {GOAL_LABEL[user.goal ?? "placements"]} · Current level: {LEVEL_LABEL[user.level]}
          </p>
        </div>
        <Link href="/today" className="inline-flex min-h-10 items-center rounded-lg bg-ink px-4 font-medium text-white">
          Go to today&apos;s problem
        </Link>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <Stat label="Current streak" sub={`Longest ${user.longestStreak} · ${user.freezes} ${user.freezes === 1 ? "freeze" : "freezes"} available`}>
          <FlameIcon size={22} className="text-flame" />
          {streak} {streak === 1 ? "day" : "days"}
        </Stat>
        <Stat label="Problems solved" sub={`${byDiff.easy} easy · ${byDiff.medium} medium · ${byDiff.hard} hard`}>
          {solved.length}
        </Stat>
        <Stat
          label="Avg thinking score"
          sub={
            scoreThis != null && scorePrev != null
              ? `${scoreThis >= scorePrev ? "Up" : "Down"} ${Math.abs(Math.round(scoreThis - scorePrev))} this month`
              : scoreAll == null
                ? "Solve a problem to get scored"
                : "From your last sessions"
          }
          good={scoreThis != null && scorePrev != null && scoreThis >= scorePrev}
        >
          {scoreAll == null ? "—" : Math.round(scoreAll)}
        </Stat>
        <Stat
          label="Hints per problem"
          sub={hintsPrev != null && hintsAll != null ? `${hintsAll <= hintsPrev ? "Down" : "Up"} from ${hintsPrev.toFixed(1)} last month` : "Fewer hints = more independent"}
          good={hintsPrev != null && hintsAll != null && hintsAll <= hintsPrev}
        >
          {hintsAll == null ? "—" : hintsAll.toFixed(1)}
        </Stat>
      </div>

      <section aria-labelledby="hm-h" className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-5 py-4.5">
        <div className="flex flex-wrap justify-between gap-2">
          <h2 id="hm-h" className="m-0 text-[15px] font-semibold">
            Daily activity · last 26 weeks
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            {["Missed", "Solved with help", "Solved", "Solved on my own"].map((l, i) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className={`size-[11px] rounded-[2px] ${HEAT[i]}`} />
                {l}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div
            role="img"
            aria-label={`Activity heatmap: ${activeDays} active days in the last 26 weeks`}
            className="grid w-max grid-flow-col grid-rows-[repeat(7,13px)] auto-cols-[13px] gap-1"
          >
            {cells.map((c) => (
              <span key={c.day} title={`${formatDay(c.day)}`} className={`size-[13px] rounded-[3px] ${HEAT[c.level]}`} />
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-4">
        <section aria-labelledby="tm-h" className="flex min-w-0 flex-[1_1_440px] flex-col gap-3.5 rounded-xl border border-line bg-surface px-5 py-4.5">
          <div className="flex justify-between gap-2">
            <h2 id="tm-h" className="m-0 text-[15px] font-semibold">
              Topic mastery
            </h2>
            <span className="text-xs text-muted">0–100, from your thinking scores</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {TOPICS.map((t) => {
              const m = masteryOf.get(t.id);
              const pct = Math.round(m?.score ?? 0);
              const soon = !available.some((a) => a.id === t.id);
              return (
                <li key={t.id} className="grid grid-cols-[150px_minmax(0,1fr)_40px] items-center gap-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{t.name}</span>
                    {t.id === focus && <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn-strong">Focus</span>}
                  </span>
                  <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-line-soft">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-ink-2">{soon ? <span className="text-xs text-muted">soon</span> : pct || "—"}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-4">
          <section aria-labelledby="tr-h" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-5 py-4.5">
            <div className="flex justify-between gap-2">
              <h2 id="tr-h" className="m-0 text-[15px] font-semibold">
                Thinking score · last {Math.max(trend.length, 1)} {trend.length === 1 ? "problem" : "problems"}
              </h2>
              {trend.length > 0 && <span className="text-[13px] text-muted">Latest {trend[trend.length - 1]}</span>}
            </div>
            {trend.length === 0 ? (
              <p className="m-0 py-8 text-center text-muted">Your scores will show here after your first solve.</p>
            ) : (
              <svg
                viewBox="0 0 400 130"
                width="100%"
                height="130"
                role="img"
                aria-label={`Thinking score went from ${trend[0]} to ${trend[trend.length - 1]}`}
              >
                {[20, 65, 110].map((ly) => (
                  <line key={ly} x1="0" y1={ly} x2="400" y2={ly} stroke="var(--color-line-soft)" strokeWidth="1" />
                ))}
                {trend.length > 1 && (
                  <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
                )}
                <circle
                  cx={trend.length === 1 ? 200 : 392}
                  cy={y(trend[trend.length - 1]).toFixed(1)}
                  r="4"
                  fill="var(--color-accent)"
                />
              </svg>
            )}
          </section>

          <section aria-labelledby="rv-h" className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-5 py-4.5">
            <h2 id="rv-h" className="m-0 mb-1 text-[15px] font-semibold">
              Re-solves due
            </h2>
            {reviews.length === 0 && <p className="m-0 text-muted">Nothing due. Solved problems come back after 3, 7 and 21 days.</p>}
            {reviews.map((r) => {
              const p = getProblem(r.problemSlug);
              return (
                <div key={r.problemSlug} className="flex min-h-11 items-center gap-3 border-t border-line-soft">
                  <span className="flex-auto">
                    {p.title} <span className="text-muted">· {topicName(p.topic)}</span>
                  </span>
                  <span className={`text-[13px] ${r.dueDate <= today ? "text-warn-strong" : "text-muted"}`}>
                    {r.dueDate <= today ? "Due" : "Tomorrow"}
                  </span>
                </div>
              );
            })}
            {reviews.length > 0 && <p className="m-0 mt-1 text-xs text-muted">Re-solves are picked as your daily problem when they&apos;re due.</p>}
          </section>
        </div>
      </div>

      <section aria-labelledby="nb-h" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="nb-h" className="m-0 text-[15px] font-semibold">
            Pattern notebook
          </h2>
          <span className="text-[13px] text-muted">
            {cards.length} {cards.length === 1 ? "card" : "cards"}
          </span>
        </div>
        {cards.length === 0 ? (
          <p className="m-0 rounded-xl border border-dashed border-field px-5 py-6 text-center text-muted">
            Every problem you solve adds a card with the key insight in your own words.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            {cards.map(({ id, problem, a }) => (
              <Link key={id} href={`/session/${id}`} className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-4 py-3.5 text-ink hover:border-field">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{a.patternName ?? problem.pattern}</span>
                  <span className="truncate text-xs text-muted">{problem.title}</span>
                </div>
                <p className="m-0 text-ink-2">{a.keyInsight || a.patternCard}</p>
                {a.complexityStr && <span className="font-mono text-xs text-muted">{a.complexityStr}</span>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, sub, good, children }: { label: string; sub: string; good?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface px-4.5 py-4">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="flex items-center gap-2 text-[30px] font-semibold tracking-[-0.02em]">{children}</span>
      <span className={`text-[13px] ${good ? "text-accent-strong" : "text-muted"}`}>{sub}</span>
    </div>
  );
}
