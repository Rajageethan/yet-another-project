/**
 * What the student has shown so far, kept by the app instead of left to the model's memory. Failure
 * replays (eval/replay.ts) showed facts that appear once in the history get lost: no model or setting
 * stopped approving pasted code the student never explained. So the engine keeps these facts in
 * Session.studentState (updated by the fast model after each turn) and Session.pasteUnexplained (set by
 * the snapshot route) and puts them in every prompt.
 */
export type StudentState = {
  /** False things the student said that they haven't corrected yet. */
  falseClaims: string[];
  /** Correct key ideas the student has voiced in their own words. */
  insights: string[];
  /** The approach the student currently means to use, in a few words. */
  approach: string;
};

export const EMPTY_STATE: StudentState = { falseClaims: [], insights: [], approach: "" };

const MAX_ITEMS = 3;
const MAX_LEN = 160;

const clean = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_LEN) : "");

function list(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map(clean).filter(Boolean).slice(0, MAX_ITEMS);
}

export function parseState(json: string): StudentState {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const falseClaims = list(raw.falseClaims);
    const insights = list(raw.insights);
    if (!falseClaims || !insights) return EMPTY_STATE;
    return { falseClaims, insights, approach: clean(raw.approach) };
  } catch {
    return EMPTY_STATE;
  }
}

/** Merges the model's update into the previous state. Fields it leaves out (or garbles) keep their value. */
export function applyUpdate(prev: StudentState, update: unknown): StudentState {
  if (!update || typeof update !== "object") return prev;
  const u = update as Record<string, unknown>;
  return {
    falseClaims: list(u.falseClaims) ?? prev.falseClaims,
    insights: list(u.insights) ?? prev.insights,
    approach: "approach" in u ? clean(u.approach) : prev.approach,
  };
}

const quoted = (items: string[]) => items.map((s) => `"${s}"`).join("; ");

/** The prompt section for the state; empty when there's nothing to say. */
export function stateBlock(state: StudentState, pasteUnexplained: boolean) {
  const lines: string[] = [];
  if (pasteUnexplained) {
    lines.push(
      "- PASTED CODE NOT YET EXPLAINED: the student pasted code into the editor and hasn't explained it in their own words. Before anything else (approving it, edge cases, submitting), ask them what a key line does and why. Don't say whether it's correct.",
    );
  }
  if (state.falseClaims.length) {
    lines.push(`- Unresolved false claims: ${quoted(state.falseClaims)}. Deal with these first, with a question that makes them test the claim; don't agree with them.`);
  }
  if (state.insights.length) {
    lines.push(`- Insights they've voiced: ${quoted(state.insights)}. Build on these; don't ask for them again.`);
  }
  if (state.approach) {
    lines.push(`- Their current approach: ${state.approach}. Don't send them back to a weaker one.`);
  }
  if (!lines.length) return "";
  return `# What the student has shown so far (tracked by the app; trust it over your memory)\n${lines.join("\n")}`;
}
