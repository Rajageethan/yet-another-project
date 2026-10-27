import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canInterrupt } from "@/lib/mentor/engine";
import { getOwnedSession } from "@/lib/session";
import { formatValue, truncate } from "@/lib/format";
import { getProblem, type Language } from "@/problems";
import type { RunResult } from "@/lib/runner/types";

export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/run">) {
  const { id } = await ctx.params;
  const owned = await getOwnedSession(id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { user, session } = owned;

  const run = (await req.json().catch(() => null)) as RunResult | null;
  if (!run || !Array.isArray(run.cases)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const problem = getProblem(session.problemSlug);
  const lang = (session.language === "javascript" ? "javascript" : "python") as Language;
  const fn = problem.functionName[lang];
  // Show values the way the student's language writes them (True / None, not true / null).
  const fmt = (v: unknown) => truncate(formatValue(v, lang), 120);
  const passed = run.cases.filter((c) => c.passed).length;
  const total = run.cases.length;

  let content: string;
  if (run.error) {
    content = `Ran the tests: the code failed before any test finished. ${run.error.slice(0, 400)}`;
  } else {
    const failing = run.cases
      .filter((c) => !c.passed)
      .slice(0, 2)
      .map((c) =>
        c.error
          ? `${fn}(${c.args.map(fmt).join(", ")}) raised ${c.error.slice(0, 200)}`
          : `${fn}(${c.args.map(fmt).join(", ")}) expected ${fmt(c.expected)}, got ${fmt(c.got)}`,
      );
    content = `Ran the tests: ${passed}/${total} passed.${failing.length ? " Failing: " + failing.join("; ") : ""}`;
  }

  await db.$transaction([
    db.session.update({ where: { id: session.id }, data: { runs: { increment: 1 } } }),
    db.message.create({ data: { sessionId: session.id, role: "event", content } }),
  ]);

  const failed = !!run.error || passed < total;
  return NextResponse.json({ ok: true, interrupt: failed && canInterrupt(user, session), event: content });
}
