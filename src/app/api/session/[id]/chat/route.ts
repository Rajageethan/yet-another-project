import { NextResponse } from "next/server";
import { getOwnedSession } from "@/lib/session";
import { mentorStream, type MentorInput } from "@/lib/mentor/engine";

export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/chat">) {
  const { id } = await ctx.params;
  const owned = await getOwnedSession(id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as MentorInput | null;
  const kinds = ["start", "message", "hint", "run_failed", "retry"];
  if (!body || !kinds.includes(body.kind)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (owned.session.status !== "active" && body.kind !== "message") {
    return NextResponse.json({ error: "Session is finished" }, { status: 409 });
  }

  return new Response(mentorStream(owned.user, owned.session, body), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
