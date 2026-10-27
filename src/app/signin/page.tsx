import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { devLoginEnabled } from "@/auth";
import { Logo } from "@/components/AppHeader";
import { getUser } from "@/lib/session";
import { signInDev, signInWithGitHub, signInWithGoogle } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage(props: PageProps<"/signin">) {
  if (await getUser()) redirect("/today");
  const { error } = (await props.searchParams) as { error?: string };
  const google = !!process.env.AUTH_GOOGLE_ID;
  const github = !!process.env.AUTH_GITHUB_ID;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex min-h-14 items-center px-6">
        <Logo href="/" />
      </header>
      <main className="mx-auto flex w-full max-w-[400px] flex-col gap-6 px-6 pb-16 pt-12">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.015em]">Sign in</h1>
          <p className="m-0 text-muted">One problem a day, with a mentor who asks how you&apos;re thinking.</p>
        </div>

        {error && (
          <p role="alert" className="m-0 rounded-lg border border-warn-line bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn-strong">
            {error === "CredentialsSignin"
              ? "Sign-in failed. Enter a name and a valid email address."
              : "Sign-in failed. Please try again."}
          </p>
        )}

        {(google || github) && (
          <div className="flex flex-col gap-2">
            {google && (
              <form action={signInWithGoogle}>
                <button type="submit" className="min-h-11 w-full rounded-lg border border-field bg-surface font-medium hover:bg-ground">
                  Continue with Google
                </button>
              </form>
            )}
            {github && (
              <form action={signInWithGitHub}>
                <button type="submit" className="min-h-11 w-full rounded-lg border border-field bg-surface font-medium hover:bg-ground">
                  Continue with GitHub
                </button>
              </form>
            )}
          </div>
        )}

        {devLoginEnabled && (
          <form
            className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-5 py-4"
            action={signInDev}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">Local dev login</span>
              <span className="text-xs text-muted">no password · dev only</span>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Name</span>
              <input name="name" required autoComplete="name" className="min-h-11 rounded-lg border border-field bg-surface px-3" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Email</span>
              <input name="email" type="email" required autoComplete="email" className="min-h-11 rounded-lg border border-field bg-surface px-3" />
            </label>
            <button type="submit" className="min-h-11 rounded-lg bg-ink font-medium text-white">
              Continue
            </button>
          </form>
        )}

        {!google && !github && !devLoginEnabled && (
          <p className="m-0 text-[13px] text-muted">
            No sign-in method is configured. Set <code className="font-mono">AUTH_GOOGLE_ID</code> /{" "}
            <code className="font-mono">AUTH_GITHUB_ID</code> or <code className="font-mono">AUTH_DEV_LOGIN=true</code> in{" "}
            <code className="font-mono">.env</code>.
          </p>
        )}
      </main>
    </div>
  );
}
