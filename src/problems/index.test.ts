import { describe, expect, it } from "vitest";
import { ACTIVE_TOPICS, TOPICS, problems } from "@/problems";

describe("ACTIVE_TOPICS", () => {
  it("lists only topics that have problems, in roadmap order", () => {
    for (const t of ACTIVE_TOPICS) expect(problems.some((p) => p.topic === t.id)).toBe(true);
    const order = ACTIVE_TOPICS.map((t) => TOPICS.findIndex((x) => x.id === t.id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("includes every roadmap topic that has a problem", () => {
    const withProblems = TOPICS.filter((t) => problems.some((p) => p.topic === t.id)).map((t) => t.id);
    expect(ACTIVE_TOPICS.map((t) => t.id)).toEqual(withProblems);
  });
});
