import { NextResponse } from "next/server";
import { getOwnedSession } from "@/lib/session";
import { getProblem } from "@/problems";

/** Hidden tests are only handed out at submit time (they run in the browser in v1). */
export async function POST(_req: Request, ctx: RouteContext<"/api/session/[id]/hidden">) {
  const { id } = await ctx.params;
  const owned = await getOwnedSession(id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const problem = getProblem(owned.session.problemSlug);
  return NextResponse.json({ tests: [...problem.tests, ...problem.hiddenTests] });
}
