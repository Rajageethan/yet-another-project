import "server-only";
import { db } from "@/lib/db";
import { addDays, dayKey, daysBetween } from "@/lib/dates";
import { assessSession } from "@/lib/mentor/assess";
import type { AppUser } from "@/lib/session";
import type { Session } from "@/generated/prisma/client";
import { DIFFICULTY_LEVEL, getProblem } from "@/problems";

const REVIEW_STEPS = [3, 7, 21, 60];

export function nextStreak(user: Pick<AppUser, "currentStreak" | "longestStreak" | "freezes" | "lastSolvedDate">, today: string) {
  let { currentStreak, freezes } = user;
  if (user.lastSolvedDate === today) return { currentStreak, longestStreak: user.longestStreak, freezes, lastSolvedDate: today };

  const gap = user.lastSolvedDate ? daysBetween(user.lastSolvedDate, today) : Infinity;
  if (gap === 1) currentStreak += 1;
  else if (gap === 2 && freezes > 0) {
    currentStreak += 1;
    freezes -= 1;
  } else currentStreak = 1;

  if (currentStreak % 7 === 0) freezes = Math.min(2, freezes + 1);
  return { currentStreak, longestStreak: Math.max(user.longestStreak, currentStreak), freezes, lastSolvedDate: today };
}

/** The streak as it should be displayed today (it breaks visibly once a day is missed). */
export function liveStreak(user: AppUser) {
  if (!user.lastSolvedDate) return 0;
  const gap = daysBetween(user.lastSolvedDate, dayKey(user.timezone));
  if (gap <= 1) return user.currentStreak;
  if (gap === 2 && user.freezes > 0) return user.currentStreak;
  return 0;
}

export async function completeSession(user: AppUser, session: Session) {
  const problem = getProblem(session.problemSlug);
  const today = dayKey(user.timezone);
  const assessment = await assessSession(user, session);

  const assignment = await db.dailyAssignment.findUnique({ where: { userId_date: { userId: user.id, date: session.date } } });
  const isReview = assignment?.problemSlug === session.problemSlug && assignment.kind === "review";
  const review = await db.reviewSchedule.findUnique({
    where: { userId_problemSlug: { userId: user.id, problemSlug: problem.slug } },
  });
  const wentWell = assessment.thinkingScore >= 65 && session.hintsUsed <= 1;
  let interval = REVIEW_STEPS[0];
  if (isReview && review && wentWell) {
    interval = REVIEW_STEPS[Math.min(REVIEW_STEPS.indexOf(review.intervalDays) + 1, REVIEW_STEPS.length - 1)] ?? 60;
  }

  const mastery = await db.topicMastery.findUnique({ where: { userId_topic: { userId: user.id, topic: problem.topic } } });
  const oldScore = mastery?.score ?? 0;
  // A correct solve is evidence of skill even with hints, so it counts for at least 40 (score 0 → 40, 100 → 100).
  const evidence = 40 + 0.6 * assessment.thinkingScore;
  const blended = mastery && mastery.attempts > 0 ? oldScore * 0.6 + evidence * 0.4 : (oldScore + evidence) / 2;
  // Solving never lowers mastery; a weak solve just raises it less.
  const newScore = Math.max(oldScore, blended);

  // Difficulty adapts: solved a problem at your level well → step up; struggled → stay at this level (PLAN.md §4.3).
  let level = user.level;
  const pLevel = DIFFICULTY_LEVEL[problem.difficulty];
  if (pLevel >= level && assessment.thinkingScore >= 75 && session.hintsUsed <= 1) level = Math.min(3, level + 1);

  const streak = nextStreak(user, today);

  await db.$transaction([
    db.session.update({ where: { id: session.id }, data: { status: "solved", solvedAt: new Date(), stage: "reflect" } }),
    db.assessment.upsert({
      where: { sessionId: session.id },
      update: assessment,
      create: { sessionId: session.id, ...assessment },
    }),
    db.topicMastery.upsert({
      where: { userId_topic: { userId: user.id, topic: problem.topic } },
      update: { score: newScore, attempts: { increment: 1 } },
      create: { userId: user.id, topic: problem.topic, score: newScore, attempts: 1 },
    }),
    db.reviewSchedule.upsert({
      where: { userId_problemSlug: { userId: user.id, problemSlug: problem.slug } },
      update: { dueDate: addDays(today, interval), intervalDays: interval },
      create: { userId: user.id, problemSlug: problem.slug, dueDate: addDays(today, interval), intervalDays: interval },
    }),
    db.user.update({ where: { id: user.id }, data: { ...streak, level } }),
  ]);

  return { reviewDate: addDays(today, interval), interval };
}
