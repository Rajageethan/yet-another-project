import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { completeSession } from "@/lib/progress";
import { getOwnedSession } from "@/lib/session";
import { getProblem } from "@/problems";

export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/submit">) {
  const { id } = await ctx.params;
  const owned = await getOwnedSession(id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { user, session } = owned;
  if (session.status === "solved") return NextResponse.json({ ok: true, solved: true });

  const body = (await req.json().catch(() => null)) as { passed?: number; total?: number; code?: string } | null;
  const problem = getProblem(session.problemSlug);
  const expectedTotal = problem.tests.length + problem.hiddenTests.length;
  const passed = Number(body?.passed ?? 0);
  const total = Number(body?.total ?? 0);

  // Make sure the graded code is what the mentor and assessment see.
  if (typeof body?.code === "string" && body.code !== session.code) {
    await db.session.update({ where: { id }, data: { code: body.code.slice(0, 20_000) } });
    session.code = body.code.slice(0, 20_000);
  }

  // A submit runs the tests too, so it counts toward "test runs".
  await db.session.update({ where: { id }, data: { runs: { increment: 1 } } });
  session.runs += 1;

  if (total !== expectedTotal || passed !== total) {
    await db.message.create({
      data: { sessionId: id, role: "event", content: `Submitted: ${passed}/${total} of all tests (including hidden) passed.` },
    });
    return NextResponse.json({ ok: true, solved: false, passed, total });
  }

  await db.message.create({
    data: { sessionId: id, role: "event", content: `Submitted: all ${total} tests passed. Problem solved.` },
  });
  await completeSession(user, session);
  return NextResponse.json({ ok: true, solved: true });
}
