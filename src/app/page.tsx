import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/AppHeader";
import { getUser } from "@/lib/session";

export default async function Home() {
  const user = await getUser();
  if (user) redirect(user.onboarded ? "/today" : "/onboarding");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex min-h-14 items-center justify-between px-6">
        <Logo href="/" />
        <Link href="/signin" className="inline-flex min-h-10 items-center rounded-lg px-3 font-medium text-ink hover:bg-bubble">
          Sign in
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-10 px-6 pb-20 pt-16">
        <div className="flex flex-col gap-4">
          <h1 className="m-0 text-[40px] font-semibold leading-[1.1] tracking-[-0.025em]">
            One problem a day.
            <br />
            Learn how to think, not what to type.
          </h1>
          <p className="m-0 max-w-[560px] text-[16px] text-ink-2">
            Explain your approach in plain words. The mentor finds the gap in your reasoning and asks the next right
            question, then watches your code as you write it. No answers handed out.
          </p>
          <Link href="/signin" className="inline-flex min-h-11 items-center self-start rounded-lg bg-accent px-5 font-medium text-white hover:bg-accent-strong">
            Start today&apos;s problem
          </Link>
        </div>
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 p-0">
          {[
            ["Understand → Optimize", "Every problem moves through the same stages a real problem solver uses."],
            ["A mentor that watches", "It sees your code live and points at the line, with a question."],
            ["Progress that means something", "Streaks, topic mastery, and a thinking score, not just a pass count."],
          ].map(([t, d]) => (
            <li key={t} className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3.5">
              <span className="font-semibold">{t}</span>
              <span className="text-muted">{d}</span>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
