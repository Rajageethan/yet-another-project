import { describe, expect, it } from "vitest";
import { EMPTY_STATE, applyUpdate, parseState, stateBlock } from "./state";

describe("parseState", () => {
  it("reads a stored state", () => {
    const s = parseState(JSON.stringify({ falseClaims: ["O(log n) is slower than O(n)"], insights: [], approach: "linear scan" }));
    expect(s.falseClaims).toEqual(["O(log n) is slower than O(n)"]);
    expect(s.approach).toBe("linear scan");
  });

  it("falls back to an empty state on bad or missing data", () => {
    expect(parseState("not json")).toEqual(EMPTY_STATE);
    expect(parseState("")).toEqual(EMPTY_STATE);
    expect(parseState(JSON.stringify({ insights: "oops" }))).toEqual(EMPTY_STATE);
  });
});

describe("applyUpdate", () => {
  const prev = { falseClaims: ["sorting keeps the indices"], insights: ["check before insert"], approach: "sort + two pointers" };

  it("keeps fields the model left out", () => {
    expect(applyUpdate(prev, { approach: "hash map of value to index" })).toEqual({ ...prev, approach: "hash map of value to index" });
  });

  it("replaces lists the model sent, so a corrected claim can be dropped", () => {
    expect(applyUpdate(prev, { falseClaims: [] }).falseClaims).toEqual([]);
  });

  it("keeps at most 3 short strings per list and ignores junk", () => {
    const next = applyUpdate(EMPTY_STATE, { insights: ["a", 7, "", "b", "c", "d", "x".repeat(400)], approach: 12 });
    expect(next.insights).toEqual(["a", "b", "c"]);
    expect(next.approach).toBe("");
    expect(applyUpdate(EMPTY_STATE, { insights: ["x".repeat(400)] }).insights[0].length).toBeLessThanOrEqual(160);
  });

  it("ignores a non-object update", () => {
    expect(applyUpdate(prev, null)).toEqual(prev);
    expect(applyUpdate(prev, "nope")).toEqual(prev);
  });
});

describe("stateBlock", () => {
  it("is empty when nothing is known", () => {
    expect(stateBlock(EMPTY_STATE, false)).toBe("");
  });

  it("puts unexplained pasted code first", () => {
    const block = stateBlock({ ...EMPTY_STATE, insights: ["last opened closes first"] }, true);
    expect(block.indexOf("PASTED CODE")).toBeGreaterThan(-1);
    expect(block.indexOf("PASTED CODE")).toBeLessThan(block.indexOf("last opened closes first"));
  });

  it("lists claims, insights and approach", () => {
    const block = stateBlock({ falseClaims: ["O(log n) is slower"], insights: ["halving"], approach: "binary search" }, false);
    expect(block).toContain("O(log n) is slower");
    expect(block).toContain("halving");
    expect(block).toContain("binary search");
    expect(block).not.toContain("PASTED CODE");
  });
});
