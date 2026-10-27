"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";

export async function saveReflection(form: FormData) {
  const user = await getUser();
  if (!user) return;
  const sessionId = String(form.get("sessionId") ?? "");
  const keyInsight = String(form.get("keyInsight") ?? "").trim().slice(0, 300);
  if (!keyInsight) return;
  const session = await db.session.findFirst({ where: { id: sessionId, userId: user.id } });
  if (!session) return;
  await db.assessment.update({ where: { sessionId }, data: { keyInsight } });
  revalidatePath(`/session/${sessionId}`);
  redirect(`/session/${sessionId}?saved=1#reflect`);
}
