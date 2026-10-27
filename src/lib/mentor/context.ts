import "server-only";
import { createTwoFilesPatch } from "diff";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const WINDOW = 10;

type Msg = { role: string; content: string; meta?: string | null };

export function numbered(code: string) {
  const lines = code.replace(/\s+$/, "").split("\n");
  const width = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(width)}| ${l}`).join("\n");
}

export function codeDiff(before: string, after: string) {
  if (before === after) return "";
  const patch = createTwoFilesPatch("before", "after", before, after, "", "", { context: 1 });
  // Drop the file header lines; keep hunks.
  const body = patch.split("\n").slice(4).join("\n").trim();
  return body.length > 1500 ? body.slice(0, 1500) + "\n… (diff truncated)" : body;
}

export function workspaceBlock(opts: { code: string; lastMentorCode: string; language: string; fileName: string }) {
  const { code, lastMentorCode, language, fileName } = opts;
  if (!code.trim()) return `[Editor: ${fileName} is empty]`;
  const parts = [`[Editor: ${fileName}]\n\`\`\`${language}\n${numbered(code)}\n\`\`\``];
  if (lastMentorCode && lastMentorCode !== code) {
    const diff = codeDiff(lastMentorCode, code);
    if (diff) parts.push(`[Changes since your last reply]\n\`\`\`diff\n${diff}\n\`\`\``);
  } else if (lastMentorCode === code) {
    parts.push("[No code changes since your last reply]");
  }
  return parts.join("\n");
}

/** Maps stored messages (last WINDOW) into chat messages. Events become bracketed user notes. */
export function historyMessages(messages: Msg[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  for (const m of messages.slice(-WINDOW)) {
    if (m.role === "assistant") {
      // Replay the stage tag the reply started with, so the model keeps the format going.
      let stage = "";
      try {
        stage = m.meta ? (JSON.parse(m.meta).stage ?? "") : "";
      } catch {}
      out.push({ role: "assistant", content: stage ? `[[stage:${stage}]] ${m.content}` : m.content });
    }
    else if (m.role === "event") out.push({ role: "user", content: `[Event] ${m.content}` });
    else out.push({ role: "user", content: m.content });
  }
  // Merge consecutive user messages; some models dislike them.
  const merged: ChatCompletionMessageParam[] = [];
  for (const m of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === "user" && m.role === "user") {
      prev.content = `${prev.content}\n\n${m.content}`;
    } else merged.push({ ...m });
  }
  return merged;
}
