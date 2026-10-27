import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/AppHeader";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ACTIVE_TOPICS } from "@/problems";
import { saveOnboarding } from "./actions";

export const metadata: Metadata = { title: "Get started" };

const GOALS = [
  { id: "placements", title: "Placements", sub: "Interview-style problems" },
  { id: "competitive", title: "Competitive coding", sub: "Harder, math-heavy" },
  { id: "basics", title: "Learn the basics", sub: "Start from arrays" },
];

const radioCard =
  "flex cursor-pointer gap-2.5 rounded-[10px] border border-field px-3.5 py-3 has-[:checked]:border-accent has-[:checked]:bg-accent-tint has-[:checked]:outline has-[:checked]:outline-1 has-[:checked]:outline-accent";

export default async function OnboardingPage() {
  const user = await requireUser({ onboarded: false });
  const ratings = new Map(
    (await db.topicMastery.findMany({ where: { userId: user.id } })).map((m) => [m.topic, m.selfRating ?? 1]),
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex min-h-14 items-center justify-between px-6">
        <Logo />
        {user.onboarded ? (
          <Link href="/settings" className="inline-flex min-h-10 items-center rounded-lg px-3 text-ink hover:bg-bubble">
            Cancel
          </Link>
        ) : (
          <span className="text-muted">Step 1 of 1</span>
        )}
      </header>
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-7 px-6 pb-16 pt-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.015em]">
            {user.onboarded ? "Update your profile" : "Let’s set up your daily problem"}
          </h1>
          <p className="m-0 text-muted">
            {user.onboarded
              ? "New ratings change how upcoming problems are picked. Your progress and history stay as they are."
              : "Your answers decide the first few problems. After that, the mentor adjusts to how you actually solve."}
          </p>
        </div>

        <form action={saveOnboarding} className="flex flex-col gap-7">
          <section aria-labelledby="about-h" className="flex flex-col gap-4.5 rounded-xl border border-line bg-surface px-6 py-5">
            <h2 id="about-h" className="m-0 text-[15px] font-semibold">
              About you
            </h2>
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-[1_1_200px] flex-col gap-1.5">
                <span className="font-medium">Year of study</span>
                <select name="year" defaultValue={user.year ?? "2"} className="min-h-11 rounded-lg border border-field bg-surface px-2.5">
                  <option value="1">1st year</option>
                  <option value="2">2nd year</option>
                  <option value="3">3rd year</option>
                  <option value="4">4th year</option>
                  <option value="grad">Graduated</option>
                </select>
              </label>
              <fieldset className="m-0 flex flex-[1_1_200px] flex-col gap-1.5 border-0 p-0">
                <legend className="mb-1.5 p-0 font-medium">Language</legend>
                <div className="flex gap-2">
                  {[
                    ["python", "Python"],
                    ["javascript", "JavaScript"],
                  ].map(([v, l]) => (
                    <label key={v} className={`${radioCard} flex-1 items-center py-0 min-h-11`}>
                      <input type="radio" name="language" value={v} defaultChecked={user.language === v} className="accent-accent" />
                      {l}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1.5 p-0 font-medium">What are you preparing for?</legend>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
                {GOALS.map((g) => (
                  <label key={g.id} className={radioCard}>
                    <input
                      type="radio"
                      name="goal"
                      value={g.id}
                      defaultChecked={(user.goal ?? "placements") === g.id}
                      className="mt-[3px] accent-accent"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium">{g.title}</span>
                      <span className="text-[13px] text-muted">{g.sub}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section aria-labelledby="rate-h" className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-6 py-5">
            <h2 id="rate-h" className="m-0 text-[15px] font-semibold">
              How comfortable are you with each topic?
            </h2>
            <p className="m-0 mb-2 text-muted">1 = never seen it · 5 = can solve mediums on my own</p>
            {ACTIVE_TOPICS.map((t) => (
              <fieldset key={t.id} className="m-0 flex flex-wrap items-center gap-x-4 gap-y-2 border-0 border-t border-line-soft px-0 py-2">
                <legend className="sr-only">{t.name}</legend>
                <span aria-hidden="true" className="flex-[1_1_160px]">
                  {t.name}
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`rate-${t.id}`}
                        value={n}
                        defaultChecked={(ratings.get(t.id) ?? 1) === n}
                        className="peer sr-only"
                      />
                      <span className="inline-flex h-9 w-11 items-center justify-center rounded-md border border-field bg-surface peer-checked:border-accent peer-checked:bg-accent peer-checked:font-medium peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                        {n}
                        <span className="sr-only"> out of 5 for {t.name}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </section>

          <section className="flex flex-wrap items-center gap-4 rounded-xl bg-ink px-6 py-4.5 text-white">
            <div className="flex flex-[1_1_300px] flex-col gap-0.5">
              <span className="font-semibold">{user.onboarded ? "Save your changes" : "Your first problem is a warm-up"}</span>
              <span className="text-[#CFCFC9]">
                {user.onboarded
                  ? "If you haven’t started today’s problem yet, it will be re-picked with your new ratings."
                  : "It sets your level from how you think, not just your ratings. The mentor will ask you to explain before you code."}
              </span>
            </div>
            <button type="submit" className="min-h-11 rounded-lg bg-white px-4.5 font-medium text-ink">
              {user.onboarded ? "Save" : "Start my first problem"}
            </button>
          </section>
        </form>
      </main>
    </div>
  );
}
