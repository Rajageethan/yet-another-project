import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getOrCreateSession, getToday } from "@/lib/picker";
import { requireUser } from "@/lib/session";
import { getProblem, toPublic, topicName, type Language } from "@/problems";
import { Workspace, type ChatMsg } from "./Workspace";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const user = await requireUser();
  const { date, assignment } = await getToday(user);
  const session = await getOrCreateSession(user, date, assignment.problemSlug);
  if (session.status === "solved") redirect(`/session/${session.id}`);

  const problem = getProblem(session.problemSlug);
  const [messages, dayNumber] = await Promise.all([
    db.message.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } }),
    db.dailyAssignment.count({ where: { userId: user.id, date: { lte: date } } }),
  ]);

  const initialMessages: ChatMsg[] = messages.map((m) => ({
    id: m.id,
    role: m.role as ChatMsg["role"],
    content: m.content,
    meta: m.meta ? JSON.parse(m.meta) : null,
  }));

  return (
    <Workspace
      sessionId={session.id}
      problem={toPublic(problem)}
      topic={topicName(problem.topic)}
      dayNumber={dayNumber}
      isReview={assignment.kind === "review"}
      initial={{
        stage: session.stage,
        code: session.code,
        language: session.language as Language,
        hintsUsed: session.hintsUsed,
        messages: initialMessages,
        interrupt: user.mentorInterrupt,
      }}
    />
  );
}
