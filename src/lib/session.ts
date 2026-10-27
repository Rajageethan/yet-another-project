import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function getUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return db.user.findUnique({ where: { id: session.user.id } });
}

/** For pages: signed in and onboarded, or redirect. */
export async function requireUser({ onboarded = true } = {}) {
  const user = await getUser();
  if (!user) redirect("/signin");
  if (onboarded && !user.onboarded) redirect("/onboarding");
  return user;
}

export type AppUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

/** For route handlers: the user and their session row, or null. */
export async function getOwnedSession(sessionId: string) {
  const user = await getUser();
  if (!user) return null;
  const session = await db.session.findFirst({ where: { id: sessionId, userId: user.id } });
  if (!session) return null;
  return { user, session };
}
