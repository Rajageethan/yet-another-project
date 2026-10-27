import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/dates";
import { isAdmin } from "@/lib/imports/store";
import { requireUser } from "@/lib/session";
import { deleteAccount, removeGroqKey, saveGroqKey, savePreferences, signOutAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

const STYLES = [
  { id: "gentle", title: "Gentle", sub: "More nudges, earlier hints" },
  { id: "balanced", title: "Balanced", sub: "Default" },
  { id: "interviewer", title: "Interviewer", sub: "Fewer hints, tougher questions" },
];

const TIMEZONES = [
  ["Asia/Kolkata", "India (IST, UTC+5:30)"],
  ["Asia/Dhaka", "Bangladesh (UTC+6)"],
  ["Asia/Karachi", "Pakistan (UTC+5)"],
  ["Asia/Kathmandu", "Nepal (UTC+5:45)"],
  ["Asia/Singapore", "Singapore (UTC+8)"],
  ["Asia/Dubai", "Gulf (UTC+4)"],
  ["Europe/London", "UK"],
  ["America/New_York", "US Eastern"],
  ["America/Los_Angeles", "US Pacific"],
  ["UTC", "UTC"],
];

const radioCard =
  "flex cursor-pointer gap-2.5 rounded-[10px] border border-field px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent-tint has-[:checked]:outline has-[:checked]:outline-1 has-[:checked]:outline-accent";

export default async function SettingsPage(props: PageProps<"/settings">) {
  const user = await requireUser();
  const { saved, keyError } = (await props.searchParams) as { saved?: string; keyError?: string };
  const cap = Number(process.env.DAILY_TURN_CAP || 60);
  const usage = await db.usageDay.findUnique({
    where: { userId_date: { userId: user.id, date: dayKey(user.timezone) } },
  });
  const used = usage?.turns ?? 0;
  const hasShared = !!process.env.GROQ_API_KEY;

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-6 pb-14 pt-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.015em]">Settings</h1>
        {saved && (
          <span role="status" className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-medium text-accent-strong">
            Saved
          </span>
        )}
      </div>

      <section aria-labelledby="key-h" className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-6 py-5">
        <h2 id="key-h" className="m-0 text-[15px] font-semibold">
          Mentor key
        </h2>
        <form action={saveGroqKey} className="flex flex-col gap-1.5">
          <label htmlFor="key" className="font-medium">
            Your Groq API key <span className="font-normal text-muted">({hasShared ? "optional" : "required"})</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="key"
              name="key"
              type="password"
              required
              autoComplete="off"
              placeholder={user.groqKeyEnc ? "•••••••• saved — paste a new key to replace" : "gsk_…"}
              className="min-h-11 flex-[1_1_260px] rounded-lg border border-field bg-surface px-3 font-mono text-[13px]"
            />
            <button type="submit" className="min-h-11 rounded-lg bg-ink px-4 font-medium text-white">
              Save key
            </button>
          </div>
          {keyError && (
            <p role="alert" className="m-0 text-[13px] text-warn">
              {keyError}
            </p>
          )}
          <p className="m-0 text-[13px] text-muted">
            A free key gives you your own rate limits. It&apos;s checked with Groq, stored encrypted, and used only for your
            sessions.{" "}
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
              Get a free key
            </a>
          </p>
        </form>
        {user.groqKeyEnc ? (
          <form action={removeGroqKey} className="flex items-center justify-between gap-3 rounded-lg bg-ground px-3.5 py-3 text-[13px]">
            <span>Using your own key · no daily limit</span>
            <button type="submit" className="min-h-9 rounded-lg border border-field bg-surface px-3">
              Remove key
            </button>
          </form>
        ) : hasShared ? (
          <div className="flex flex-col gap-1.5 rounded-lg bg-ground px-3.5 py-3">
            <div className="flex justify-between gap-2 text-[13px]">
              <span>Shared key · mentor replies today</span>
              <span className="font-medium tabular-nums">
                {Math.min(used, cap)} / {cap}
              </span>
            </div>
            <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} />
            </span>
          </div>
        ) : (
          <p className="m-0 rounded-lg border border-warn-line bg-warn-soft px-3.5 py-3 text-[13px] text-warn-strong">
            No shared key is configured on this server, so the mentor needs your own key to reply.
          </p>
        )}
      </section>

      <form action={savePreferences} className="flex flex-col gap-5">
        <section aria-labelledby="ai-h" className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-6 py-5">
          <h2 id="ai-h" className="m-0 text-[15px] font-semibold">
            Mentor
          </h2>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="interrupt" defaultChecked={user.mentorInterrupt} className="mt-0.5 size-[18px] accent-accent" />
            <span className="flex flex-col">
              <span className="font-medium">Mentor can interrupt</span>
              <span className="text-[13px] text-muted">
                Speaks up without being asked when your test run fails. At most once every 90 seconds.
              </span>
            </span>
          </label>
          <fieldset className="m-0 flex flex-col gap-2 border-0 border-t border-line-soft p-0 pt-3">
            <legend className="float-left mb-2 w-full p-0 pt-3 font-medium">Guidance style</legend>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
              {STYLES.map((s) => (
                <label key={s.id} className={radioCard}>
                  <input type="radio" name="style" value={s.id} defaultChecked={user.guidanceStyle === s.id} className="mt-[3px] accent-accent" />
                  <span className="flex flex-col">
                    <span className="font-medium">{s.title}</span>
                    <span className="text-[13px] text-muted">{s.sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section aria-labelledby="dp-h" className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-6 py-5">
          <h2 id="dp-h" className="m-0 text-[15px] font-semibold">
            Daily problem
          </h2>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-[1_1_200px] flex-col gap-1.5">
              <span className="font-medium">Default language</span>
              <select name="language" defaultValue={user.language} className="min-h-11 rounded-lg border border-field bg-surface px-2.5">
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
              </select>
            </label>
            <label className="flex flex-[1_1_200px] flex-col gap-1.5">
              <span className="font-medium">Time zone</span>
              <select name="timezone" defaultValue={user.timezone} className="min-h-11 rounded-lg border border-field bg-surface px-2.5">
                {TIMEZONES.some(([z]) => z === user.timezone) ? null : <option value={user.timezone}>{user.timezone}</option>}
                {TIMEZONES.map(([z, l]) => (
                  <option key={z} value={z}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
            <span className="flex flex-col">
              <span className="font-medium">Retake topic ratings</span>
              <span className="text-[13px] text-muted">Changes how your daily problems are picked.</span>
            </span>
            <Link href="/onboarding" className="inline-flex min-h-10 items-center rounded-lg border border-field px-3.5 text-ink">
              Retake
            </Link>
          </div>
        </section>

        <button type="submit" className="min-h-11 self-start rounded-lg bg-accent px-5 font-medium text-white hover:bg-accent-strong">
          Save settings
        </button>
      </form>

      {isAdmin(user) && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-6 py-4">
          <span className="flex flex-col">
            <span className="font-medium">Problem bank</span>
            <span className="text-[13px] text-muted">Review and approve problems imported from LeetCodeDataset (dev only).</span>
          </span>
          <Link href="/admin/review" className="inline-flex min-h-10 items-center rounded-lg border border-field px-3.5 text-ink">
            Review imports
          </Link>
        </section>
      )}

      <section aria-labelledby="ac-h" className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-6 py-5">
        <h2 id="ac-h" className="m-0 text-[15px] font-semibold">
          Account
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="font-medium">{user.name ?? user.email}</span>
            <span className="text-[13px] text-muted">{user.email}</span>
          </span>
          <form action={signOutAction}>
            <button type="submit" className="min-h-10 rounded-lg border border-field bg-surface px-3.5">
              Sign out
            </button>
          </form>
        </div>
        <details className="border-t border-line-soft pt-3">
          <summary className="cursor-pointer text-[13px] text-warn">Delete account</summary>
          <form action={deleteAccount} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-[1_1_240px] flex-col gap-1.5 text-[13px]">
              Type DELETE to permanently remove your account and all sessions.
              <input name="confirm" required pattern="DELETE" autoComplete="off" className="min-h-10 rounded-lg border border-field bg-surface px-3" />
            </label>
            <button type="submit" className="min-h-10 rounded-lg border border-[#E8C4B0] bg-surface px-3.5 text-warn">
              Delete forever
            </button>
          </form>
        </details>
      </section>
    </main>
  );
}
