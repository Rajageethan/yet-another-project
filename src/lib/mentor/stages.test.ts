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

  it("moves forward at most one stage", () => {
    expect(nextStage("understand", "brute_force", false)).toBe("examples");
    expect(nextStage("understand", "examples", false)).toBe("examples");
  });

  it("allows moving back any distance", () => {
    expect(nextStage("test", "understand", false)).toBe("understand");
  });

  it("treats an unknown current stage as understand", () => {
    expect(nextStage("bogus", "code", false)).toBe("examples");
  });
});
