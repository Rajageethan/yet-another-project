import type { Language } from "@/problems";

/** Shows a test value the way it would be written in the student's language. */
export function formatValue(v: unknown, lang: Language): string {
  if (lang === "python") {
    if (v === null || v === undefined) return "None";
    if (v === true) return "True";
    if (v === false) return "False";
    if (Array.isArray(v)) return "[" + v.map((x) => formatValue(x, lang)).join(", ") + "]";
    if (typeof v === "object")
      return "{" + Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${formatValue(x, lang)}`).join(", ") + "}";
    return JSON.stringify(v);
  }
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return "[" + v.map((x) => formatValue(x, lang)).join(", ") + "]";
  return JSON.stringify(v);
}

export function formatArgs(args: unknown[], params: string[], lang: Language) {
  return args.map((a, i) => `${params[i] ?? `arg${i}`} = ${formatValue(a, lang)}`).join(", ");
}

/** Problem text is written Python-style; show `len(nums)` as `nums.length` to JavaScript users. */
export function forLanguage(text: string, lang: Language) {
  if (lang !== "javascript") return text;
  return text.replace(/\blen\(([\w.[\]]+)\)/g, "$1.length");
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
