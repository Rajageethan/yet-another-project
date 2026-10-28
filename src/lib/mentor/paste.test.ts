import { describe, expect, it } from "vitest";
import { PASTE_EVENT_PREFIX, pasteEventContent } from "./paste";

describe("pasteEventContent", () => {
  it("describes the paste and starts with the shared prefix", () => {
    expect(pasteEventContent(10)).toBe("The student pasted 10 lines of code into the editor at once.");
    expect(pasteEventContent(8).startsWith(PASTE_EVENT_PREFIX)).toBe(true);
  });
});
