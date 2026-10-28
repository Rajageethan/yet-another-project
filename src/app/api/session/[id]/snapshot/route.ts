import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { interruptGapElapsed } from "@/lib/mentor/engine";
import { pasteEventContent } from "@/lib/mentor/paste";
import { getOwnedSession } from "@/lib/session";

const MAX_CODE = 20_000;
const PASTE_FLAG_LINES = 8;

export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/snapshot">) {
  const { id } = await ctx.params;
  const owned = await getOwnedSession(id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { session } = owned;

  const body = (await req.json().catch(() => null)) as
    | { code?: string; language?: string; pastedLines?: number }
    | null;
  const code = String(body?.code ?? "").slice(0, MAX_CODE);
  const language = body?.language === "javascript" ? "javascript" : "python";
  const pastedLines = Number(body?.pastedLines ?? 0);
  const pasted = pastedLines >= PASTE_FLAG_LINES;

  if (code === session.code && language === session.language && !pasted) {
    return NextResponse.json({ ok: true, changed: false });
  }

  const event = pasted ? pasteEventContent(pastedLines) : undefined;
  await db.$transaction([
    db.session.update({
      where: { id: session.id },
      // A paste stays flagged for the mentor until the student explains it (see updateStudentState).
      data: { code, language, ...(pasted ? { pasteFlags: { increment: 1 }, pasteUnexplained: true } : {}) },
    }),
    db.codeSnapshot.create({ data: { sessionId: session.id, code, language, pasted } }),
    ...(event
      ? [
          db.message.create({
            data: { sessionId: session.id, role: "event", content: event, meta: JSON.stringify({ paste: pastedLines }) },
          }),
        ]
      : []),
  ]);

  // The mentor asks about a paste even with "Mentor can interrupt" off (that toggle is about failed runs).
  return NextResponse.json({ ok: true, changed: true, event, followUp: pasted && interruptGapElapsed(session) });
}
