"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/dates";
import { getUser } from "@/lib/session";
import { ACTIVE_TOPICS } from "@/problems";

export async function saveOnboarding(form: FormData) {
  const user = await getUser();
  if (!user) redirect("/signin");

  const ratings = ACTIVE_TOPICS.map((t) => ({
    topic: t.id,
    rating: Math.min(5, Math.max(1, Number(form.get(`rate-${t.id}`)) || 1)),
  }));
  const core = ratings.slice(0, 4);
  const avg = core.reduce((s, r) => s + r.rating, 0) / core.length;
  const goal = String(form.get("goal") ?? "placements");
  const level = avg >= 3.5 || (goal === "competitive" && avg >= 2.5) ? 2 : 1;
  const language = form.get("language") === "javascript" ? "javascript" : "python";

  const existing = new Map((await db.topicMastery.findMany({ where: { userId: user.id } })).map((m) => [m.topic, m]));

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        year: String(form.get("year") ?? ""),
        goal,
        language,
        // Only reset the level on first onboarding; afterwards it's earned.
        ...(user.onboarded ? {} : { level }),
        onboarded: true,
      },
    }),
    ...ratings.map((r) => {
      const prior = existing.get(r.topic);
      // A self-rating seeds mastery (1 → 0, 5 → 60) until real sessions take over.
      const seeded = (r.rating - 1) * 15;
      return db.topicMastery.upsert({
        where: { userId_topic: { userId: user.id, topic: r.topic } },
        update: { selfRating: r.rating, ...(prior && prior.attempts > 0 ? {} : { score: seeded }) },
        create: { userId: user.id, topic: r.topic, selfRating: r.rating, score: seeded },
      });
    }),
  ]);

  // A retake should re-pick today's problem if it hasn't been started.
  if (user.onboarded) {
    const date = dayKey(user.timezone);
    const started = await db.session.findFirst({
      where: { userId: user.id, date, messages: { some: { role: "user" } } },
    });
    if (!started) {
      await db.session.deleteMany({ where: { userId: user.id, date } });
      await db.dailyAssignment.deleteMany({ where: { userId: user.id, date } });
    }
  }
  redirect("/today");
}
