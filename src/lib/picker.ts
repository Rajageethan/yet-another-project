import "server-only";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/dates";
import type { AppUser } from "@/lib/session";
import { DIFFICULTY_LEVEL, TOPICS, getProblem, problems, type Language } from "@/problems";

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * score = 3·weakness + 2·roadmapFit + 2·difficultyFit + 4·reviewDue (see PLAN.md §4.3)
 */
async function pickProblem(user: AppUser, date: string, exclude: string[] = []) {
  const [mastery, sessions, reviews] = await Promise.all([
    db.topicMastery.findMany({ where: { userId: user.id } }),
    db.session.findMany({ where: { userId: user.id }, select: { problemSlug: true, status: true, date: true } }),
    db.reviewSchedule.findMany({ where: { userId: user.id } }),
  ]);
  const masteryOf = new Map(mastery.map((m) => [m.topic, m.score]));
  const solved = new Set(sessions.filter((s) => s.status === "solved").map((s) => s.problemSlug));
  const attempted = new Set(sessions.map((s) => s.problemSlug));
  const due = new Set(reviews.filter((r) => r.dueDate <= date).map((r) => r.problemSlug));

  // The first roadmap topic (that has problems) the student hasn't got comfortable with yet.
  const available = TOPICS.filter((t) => problems.some((p) => p.topic === t.id));
  const focusIdx = Math.max(
    0,
    available.findIndex((t) => (masteryOf.get(t.id) ?? 0) < 70),
  );

  const rand = seeded(user.id + date + exclude.join());
  let best: { slug: string; score: number; kind: "new" | "review" } | null = null;

  for (const p of problems) {
    if (exclude.includes(p.slug)) continue;
    const isDue = due.has(p.slug);
    if (solved.has(p.slug) && !isDue) continue;

    const weakness = (100 - (masteryOf.get(p.topic) ?? 0)) / 100;
    const dist = Math.abs(available.findIndex((t) => t.id === p.topic) - focusIdx);
    const roadmapFit = Math.max(0, 1 - 0.35 * dist);
    const diff = DIFFICULTY_LEVEL[p.difficulty] - user.level;
    const difficultyFit = diff === 0 ? 1 : diff === 1 ? 0.55 : diff === -1 ? 0.35 : 0;

    let score = 3 * weakness + 2 * roadmapFit + 2 * difficultyFit + 4 * (isDue ? 1 : 0);
    if (attempted.has(p.slug) && !solved.has(p.slug)) score -= 0.5; // tried before, give it a rest
    score += rand() * 0.1;

    if (!best || score > best.score) best = { slug: p.slug, score, kind: isDue ? "review" : "new" };
  }

  if (!best) {
    // Everything solved and nothing due: revisit the problem solved longest ago.
    const oldest = sessions
      .filter((s) => s.status === "solved" && !exclude.includes(s.problemSlug))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return { slug: oldest?.problemSlug ?? problems[0].slug, kind: "review" as const };
  }
  return best;
}

export async function getToday(user: AppUser) {
  const date = dayKey(user.timezone);
  let assignment = await db.dailyAssignment.findUnique({ where: { userId_date: { userId: user.id, date } } });
  if (!assignment) {
    const pick = await pickProblem(user, date);
    assignment = await db.dailyAssignment.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: {},
      create: { userId: user.id, date, problemSlug: pick.slug, kind: pick.kind },
    });
  }
  return { date, assignment };
}

export async function getOrCreateSession(user: AppUser, date: string, slug: string) {
  const existing = await db.session.findFirst({
    where: { userId: user.id, date, problemSlug: slug },
    orderBy: { startedAt: "desc" },
  });
  if (existing) return existing;
  const language = (user.language === "javascript" ? "javascript" : "python") as Language;
  const code = getProblem(slug).starter[language];
  return db.session.create({
    data: { userId: user.id, date, problemSlug: slug, language, code, lastMentorCode: code },
  });
}
