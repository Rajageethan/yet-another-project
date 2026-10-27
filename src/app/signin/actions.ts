"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

/** signIn redirects on success by throwing; Auth.js errors (bad credentials, OAuth failures) are shown on the page instead of crashing it. */
async function attempt(provider: string, options: Record<string, string>) {
  try {
    await signIn(provider, { ...options, redirectTo: "/today" });
  } catch (err) {
    if (err instanceof AuthError) redirect(`/signin?error=${encodeURIComponent(err.type)}`);
    throw err;
  }
}

export async function signInWithGoogle() {
  await attempt("google", {});
}

export async function signInWithGitHub() {
  await attempt("github", {});
}

export async function signInDev(form: FormData) {
  await attempt("dev", { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") });
}
