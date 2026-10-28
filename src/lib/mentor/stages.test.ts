import { describe, expect, it } from "vitest";
import { nextStage } from "./stages";

describe("nextStage", () => {
  it("keeps the stage when no tag was given", () => {
    expect(nextStage("examples", null, false)).toBe("examples");
  });

  it("never moves on unprompted turns", () => {
    expect(nextStage("examples", "brute_force", true)).toBe("examples");
    expect(nextStage("code", "understand", true)).toBe("code");
  });

  it("jumps forward to where the student already is, up to code", () => {
    expect(nextStage("understand", "examples", false)).toBe("examples");
    expect(nextStage("understand", "optimize", false)).toBe("optimize");
    expect(nextStage("examples", "code", false)).toBe("code");
  });

  it("moves past code one stage at a time", () => {
    expect(nextStage("understand", "reflect", false)).toBe("code");
    expect(nextStage("code", "reflect", false)).toBe("test");
    expect(nextStage("test", "reflect", false)).toBe("complexity");
  });

  it("allows moving back any distance", () => {
    expect(nextStage("test", "understand", false)).toBe("understand");
  });

  it("treats an unknown current stage as understand", () => {
    expect(nextStage("bogus", "complexity", false)).toBe("code");
  });
});
