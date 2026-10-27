import { Fragment, type ReactNode } from "react";

/** Minimal, safe markdown: paragraphs, ``` blocks, `code`, **bold**, and "- " lists. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const parts = text.split(/```[a-zA-Z]*\n?([\s\S]*?)```/g);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      blocks.push(
        <pre key={i} className="overflow-x-auto rounded-lg bg-ground px-3 py-2 font-mono text-[12.5px] leading-relaxed">
          {part.replace(/\n$/, "")}
        </pre>,
      );
      return;
    }
    part
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((p, j) => {
        const lines = p.split("\n");
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          blocks.push(
            <ul key={`${i}-${j}`} className="list-disc space-y-0.5 pl-5">
              {lines.map((l, k) => (
                <li key={k}>{inline(l.replace(/^\s*[-*] /, ""))}</li>
              ))}
            </ul>,
          );
        } else {
          blocks.push(
            <p key={`${i}-${j}`} className="m-0">
              {lines.map((l, k) => (
                <Fragment key={k}>
                  {k > 0 && <br />}
                  {inline(l)}
                </Fragment>
              ))}
            </p>,
          );
        }
      });
  });
  return <div className={`flex flex-col gap-2 ${className ?? ""}`}>{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      out.push(
        <code key={m.index} className="rounded bg-bubble px-1 py-px font-mono text-[0.92em]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(
        <strong key={m.index} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
