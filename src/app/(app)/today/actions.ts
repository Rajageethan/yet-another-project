"use server";

import { db } from "@/lib/db";
import { getUser } from "@/lib/session";

export async function setMentorInterrupt(on: boolean) {
  const user = await getUser();
  if (!user) return;
  await db.user.update({ where: { id: user.id }, data: { mentorInterrupt: on } });
}
