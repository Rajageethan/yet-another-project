"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";

async function me() {
  const user = await getUser();
  if (!user) redirect("/signin");
  return user;
}

export async function saveGroqKey(form: FormData) {
  const user = await me();
  const key = String(form.get("key") ?? "").trim();
  if (!/^gsk_[A-Za-z0-9]{20,}$/.test(key)) {
    redirect("/settings?keyError=" + encodeURIComponent("That doesn't look like a Groq key (they start with gsk_)."));
  }
  // Verify the key before storing it.
  const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } }).catch(
    () => null,
  );
  if (!res || res.status === 401 || res.status === 403) {
    redirect("/settings?keyError=" + encodeURIComponent("Groq rejected that key. Copy it again from console.groq.com/keys."));
  }
  await db.user.update({ where: { id: user.id }, data: { groqKeyEnc: encrypt(key) } });
  redirect("/settings?saved=1");
}

export async function removeGroqKey() {
  const user = await me();
  await db.user.update({ where: { id: user.id }, data: { groqKeyEnc: null } });
  redirect("/settings?saved=1");
}

export async function savePreferences(form: FormData) {
  const user = await me();
  const style = String(form.get("style") ?? "balanced");
  const timezone = String(form.get("timezone") ?? user.timezone);
  let validTz = true;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    validTz = false;
  }
  await db.user.update({
    where: { id: user.id },
    data: {
      mentorInterrupt: form.get("interrupt") === "on",
      guidanceStyle: ["gentle", "balanced", "interviewer"].includes(style) ? style : "balanced",
      language: form.get("language") === "javascript" ? "javascript" : "python",
      ...(validTz ? { timezone } : {}),
    },
  });
  redirect("/settings?saved=1");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function deleteAccount(form: FormData) {
  const user = await me();
  if (form.get("confirm") !== "DELETE") redirect("/settings");
  await db.user.delete({ where: { id: user.id } });
  await signOut({ redirectTo: "/" });
}
