"use client";

import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { RichText } from "@/components/RichText";
import { ArrowUpIcon, BulbIcon, CheckIcon, ChevronIcon, EyeIcon, PlayIcon, XIcon } from "@/components/icons";
import { formatArgs, formatValue, forLanguage } from "@/lib/format";
import { STAGES, stageIndex } from "@/lib/mentor/stages";
import { runTests, warmRunner } from "@/lib/runner/client";
import type { CaseResult, RunResult } from "@/lib/runner/types";
import type { Language, PublicProblem, TestCase } from "@/problems";
import { setMentorInterrupt } from "./actions";

type Highlight = { start: number; end: number; note: string };
export type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "event";
  content: string;
  meta?: { hint?: number; highlights?: Highlight[] } | null;
  pending?: boolean;
};

type MentorInput =
  | { kind: "start" }
  | { kind: "message"; text: string }
  | { kind: "hint" }
  | { kind: "run_failed" }
  | { kind: "retry" };
type Editor = Parameters<OnMount>[0];
type Monaco = Parameters<OnMount>[1];

const SNAPSHOT_DELAY = 2500;
const HINT_MAX = 4;

export function Workspace(props: {
  sessionId: string;
  problem: PublicProblem;
  topic: string;
  dayNumber: number;
  isReview: boolean;
  initial: {
    stage: string;
    code: string;
    language: Language;
    hintsUsed: number;
    messages: ChatMsg[];
    interrupt: boolean;
  };
}) {
  const { sessionId, problem, initial } = props;
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMsg[]>(initial.messages);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A reply that failed earlier (rate limit, closed tab) leaves the student's last message unanswered.
  const [error, setError] = useState<{ message: string; code?: string } | null>(() => {
    const last = [...initial.messages].reverse().find((m) => m.role !== "event");
    return last?.role === "user" ? { message: "The mentor didn't get to answer your last message.", code: "upstream" } : null;
  });
  const [stage, setStage] = useState(initial.stage);
  const [hintsUsed, setHintsUsed] = useState(initial.hintsUsed);
  const [interrupt, setInterrupt] = useState(initial.interrupt);
  const [draft, setDraft] = useState("");
  const [showEarlier, setShowEarlier] = useState(false);
  const [problemOpen, setProblemOpen] = useState(true);
  const [pane, setPane] = useState<"problem" | "chat" | "code">("chat");
  const [unread, setUnread] = useState(false);
  const paneRef = useRef(pane);
  useEffect(() => {
    paneRef.current = pane;
    // Monaco measures itself while hidden (0×0); re-measure when the Code tab is shown on phones.
    if (pane === "code") {
      const t = setTimeout(() => editorRef.current?.layout(), 0);
      return () => clearTimeout(t);
    }
  }, [pane]);

  const [language, setLanguage] = useState<Language>(initial.language);
  const [code, setCode] = useState(initial.code);
  const [highlights, setHighlights] = useState<Highlight[]>(
    () => [...initial.messages].reverse().find((m) => m.meta?.highlights?.length)?.meta?.highlights ?? [],
  );
  const [result, setResult] = useState<(RunResult & { kind: "run" | "submit"; total: number }) | null>(null);
  const [running, setRunning] = useState<"run" | "submit" | null>(null);
  const [tab, setTab] = useState<"tests" | "console">("tests");
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const editorRef = useRef<Editor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorations = useRef<ReturnType<Editor["createDecorationsCollection"]> | null>(null);
  const codeByLang = useRef<Partial<Record<Language, string>>>({ [initial.language]: initial.code });
  const lastSent = useRef({ code: initial.code, language: initial.language });
  const pendingPaste = useRef(0);
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  const fnName = problem.functionName[language];

  // ---------------------------------------------------------------- snapshots

  const sendSnapshot = useCallback(async () => {
    const current = { code: codeByLang.current[language] ?? "", language };
    if (current.code === lastSent.current.code && current.language === lastSent.current.language && !pendingPaste.current) return;
    const pastedLines = pendingPaste.current;
    pendingPaste.current = 0;
    lastSent.current = current;
    try {
      await fetch(`/api/session/${sessionId}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...current, pastedLines }),
      });
      setSyncedAt(Date.now());
    } catch {
      lastSent.current = { code: "", language }; // retry next time
    }
  }, [sessionId, language]);

  const flushSnapshot = useCallback(async () => {
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    snapshotTimer.current = null;
    await sendSnapshot();
  }, [sendSnapshot]);

  useEffect(() => {
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    snapshotTimer.current = setTimeout(() => void sendSnapshot(), SNAPSHOT_DELAY);
    return () => {
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    };
  }, [code, language, sendSnapshot]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void warmRunner(language);
  }, [language]);

  // ---------------------------------------------------------------- mentor

  const askMentor = useCallback(
    async (input: MentorInput) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      if (input.kind === "message") {
        setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: input.text, pending: true }]);
      }
      await flushSnapshot();

      const turnHighlights: Highlight[] = [];
      try {
        const res = await fetch(`/api/session/${sessionId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        setStreaming("");
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            if (!frame.startsWith("data: ")) continue;
            const e = JSON.parse(frame.slice(6));
            switch (e.type) {
              case "user":
                setMessages((m) => {
                  const idx = m.findIndex((x) => x.pending);
                  const msg: ChatMsg = { id: e.id, role: "user", content: e.content, meta: e.meta ?? null };
                  if (idx === -1) return [...m, msg];
                  const copy = [...m];
                  copy[idx] = msg;
                  return copy;
                });
                break;
              case "text":
                text += e.delta;
                setStreaming(text);
                break;
              case "stage":
                setStage(e.stage);
                break;
              case "hints":
                setHintsUsed(e.used);
                break;
              case "highlight":
                turnHighlights.push({ start: e.start, end: e.end, note: e.note });
                setHighlights([...turnHighlights]);
                break;
              case "done":
                if (paneRef.current !== "chat") setUnread(true);
                setMessages((m) => [
                  ...m,
                  {
                    id: e.id,
                    role: "assistant",
                    content: e.content,
                    meta: turnHighlights.length ? { highlights: turnHighlights } : null,
                  },
                ]);
                break;
              case "error":
                setError({ message: e.message, code: e.code });
                break;
            }
          }
        }
      } catch (err) {
        setError({ message: err instanceof Error ? err.message : "Couldn't reach the mentor." });
        setMessages((m) => m.filter((x) => !x.pending));
      } finally {
        setStreaming(null);
        busyRef.current = false;
        setBusy(false);
      }
    },
    [sessionId, flushSnapshot],
  );

  // The mentor opens the session. Deferred so a StrictMode double-mount cancels the first call.
  useEffect(() => {
    if (initial.messages.length > 0 || startedRef.current) return;
    const t = setTimeout(() => {
      startedRef.current = true;
      void askMentor({ kind: "start" });
    }, 0);
    return () => clearTimeout(t);
  }, [askMentor, initial.messages.length]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streaming, error]);

  function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void askMentor({ kind: "message", text });
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  // ---------------------------------------------------------------- editor

  const beforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme("mentor-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "75756F", fontStyle: "italic" },
        { token: "keyword", foreground: "14493B" },
        { token: "string", foreground: "8A4A12" },
        { token: "number", foreground: "A2410F" },
      ],
      colors: {
        "editor.background": "#FBFBFA",
        "editorLineNumber.foreground": "#75756F",
        "editorLineNumber.activeForeground": "#18181B",
        "editor.lineHighlightBackground": "#F1F1EE",
        "editor.lineHighlightBorder": "#00000000",
        "editorGutter.background": "#FBFBFA",
      },
    });
  };

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorations.current = editor.createDecorationsCollection([]);
    editor.onDidPaste((e) => {
      const lines = e.range.endLineNumber - e.range.startLineNumber + 1;
      pendingPaste.current = Math.max(pendingPaste.current, lines);
    });
    applyDecorations(highlights);
  };

  const applyDecorations = useCallback((hs: Highlight[]) => {
    const monaco = monacoRef.current;
    const coll = decorations.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !coll || !model) return;
    const max = model.getLineCount();
    coll.set(
      hs
        .filter((h) => h.start <= max)
        .flatMap((h) => {
          const end = Math.min(h.end, max);
          return [
            {
              range: new monaco.Range(h.start, 1, end, 1),
              options: {
                isWholeLine: true,
                className: "mentor-line",
                glyphMarginClassName: "mentor-glyph",
                hoverMessage: { value: `**Mentor:** ${h.note}` },
              },
            },
            {
              range: new monaco.Range(end, model.getLineMaxColumn(end), end, model.getLineMaxColumn(end)),
              options: { after: { content: `   ← ${h.note}`, inlineClassName: "mentor-note" } },
            },
          ];
        }),
    );
  }, []);

  useEffect(() => applyDecorations(highlights), [highlights, applyDecorations]);

  function jumpTo(line: number) {
    setPane("code");
    const ed = editorRef.current;
    if (!ed) return;
    ed.revealLineInCenter(line);
    ed.setPosition({ lineNumber: line, column: 1 });
    ed.focus();
  }

  function onCodeChange(value: string | undefined) {
    const v = value ?? "";
    codeByLang.current[language] = v;
    setCode(v);
  }

  function switchLanguage(next: Language) {
    if (next === language) return;
    codeByLang.current[language] = code;
    const nextCode = codeByLang.current[next] ?? problem.starter[next];
    codeByLang.current[next] = nextCode;
    setLanguage(next);
    setCode(nextCode);
    setResult(null);
    setHighlights([]);
  }

  // ---------------------------------------------------------------- run / submit

  async function run() {
    if (running) return;
    setRunning("run");
    setTab("tests");
    const r = await runTests({ language, code, fnName, tests: problem.tests, compare: problem.compare });
    setResult({ ...r, kind: "run", total: problem.tests.length });
    setRunning(null);
    if (r.error || r.stdout) setTab(r.error ? "console" : "tests");
    try {
      await flushSnapshot();
      const res = await fetch(`/api/session/${sessionId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r),
      }).then((x) => x.json());
      if (res.event) setMessages((m) => [...m, { id: `ev-${Date.now()}`, role: "event", content: res.event }]);
      if (res.interrupt) void askMentor({ kind: "run_failed" });
    } catch {
      /* the run itself still shows locally */
    }
  }

  async function submit() {
    if (running) return;
    setRunning("submit");
    setTab("tests");
    try {
      await flushSnapshot();
      const { tests } = (await fetch(`/api/session/${sessionId}/hidden`, { method: "POST" }).then((x) => x.json())) as {
        tests: TestCase[];
      };
      const r = await runTests({ language, code, fnName, tests, compare: problem.compare });
      const passed = r.cases.filter((c) => c.passed).length;
      const res = await fetch(`/api/session/${sessionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passed, total: r.error ? -1 : tests.length, code }),
      }).then((x) => x.json());
      if (res.solved) {
        router.push(`/session/${sessionId}`);
        return;
      }
      setResult({ ...r, kind: "submit", total: tests.length });
      if (r.error) setTab("console");
      setMessages((m) => [
        ...m,
        { id: `ev-${Date.now()}`, role: "event", content: `Submitted: ${passed}/${tests.length} of all tests passed.` },
      ]);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Submit failed" });
    } finally {
      setRunning(null);
    }
  }

  // ---------------------------------------------------------------- render

  const current = stageIndex(stage);
  const visibleMessages = showEarlier ? messages : messages.slice(-14);
  const hiddenCount = messages.length - visibleMessages.length;
  const synced = syncedAt ? Math.max(0, Math.round((now - syncedAt) / 1000)) : null;

  // Phones get one pane at a time (Problem / Chat / Code); from lg up everything is side by side.
  const show = (p: typeof pane) => (pane === p ? "flex" : "hidden");

  return (
    <main className="flex flex-auto flex-col lg:flex-row">
      <div role="tablist" aria-label="Workspace" className="flex border-b border-line bg-surface lg:hidden">
        {(["problem", "chat", "code"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pane === p}
            onClick={() => {
              setPane(p);
              if (p === "chat") setUnread(false);
            }}
            className={`relative min-h-11 flex-1 capitalize ${pane === p ? "font-medium text-ink shadow-[inset_0_-2px_0_var(--color-ink)]" : "text-muted"}`}
          >
            {p}
            {p === "chat" && unread && pane !== "chat" && (
              <span aria-label="New mentor message" className="absolute right-[calc(50%-26px)] top-3 size-2 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------ problem + chat */}
      <section
        aria-label="Problem and mentor chat"
        className={`${pane === "code" ? "hidden" : "flex"} h-[calc(100dvh-101px)] min-w-0 flex-col border-line bg-surface lg:flex lg:h-[calc(100dvh-57px)] lg:w-[460px] lg:flex-none lg:border-r`}
      >
        <div
          className={`${show("problem")} min-h-0 flex-auto flex-col gap-2.5 overflow-y-auto border-b border-line px-6 pb-4 pt-5 lg:flex lg:flex-none lg:overflow-visible`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Day {props.dayNumber}</span>
            <span className="text-xs text-muted" aria-hidden="true">
              ·
            </span>
            <DifficultyBadge difficulty={problem.difficulty} />
            <span className="rounded-full border border-line px-2 py-px text-xs text-muted">{props.topic}</span>
            {props.isReview && (
              <span className="rounded-full bg-accent-soft px-2 py-px text-xs font-medium text-accent-strong">Re-solve</span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-expanded={problemOpen}
                onClick={() => setProblemOpen((o) => !o)}
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[13px] text-muted hover:bg-bubble hover:text-ink"
              >
                {problemOpen ? "Hide" : "Show"}
                <ChevronIcon up={problemOpen} size={14} />
              </button>
            </div>
          </div>
          <h1 className="m-0 text-[19px] font-semibold tracking-[-0.01em]">{problem.title}</h1>
          {problemOpen && (
            <>
              <RichText text={forLanguage(problem.statement, language)} className="text-ink-2" />
              <div className="flex flex-col gap-0.5 rounded-lg bg-ground px-3 py-2.5 font-mono text-[12.5px]">
                {problem.tests.slice(0, 2).map((t, i) => (
                  <span key={i} className="break-words">
                    {formatArgs(t.args, problem.params, language)} → {formatValue(t.expected, language)}
                  </span>
                ))}
                {problem.constraints.map((c) => (
                  <span key={c} className="text-muted">
                    {forLanguage(c, language)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 border-b border-line px-6 py-3">
          <div className="flex justify-between text-xs text-muted">
            <span>
              Stage {current + 1} of {STAGES.length} · {STAGES[current].label}
            </span>
            {current < STAGES.length - 1 && <span>Next: {STAGES[current + 1].label}</span>}
          </div>
          <ol aria-label="Solving stages" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {STAGES.map((s, i) =>
              i < current ? (
                <li key={s.id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent-strong">
                  <CheckIcon size={12} />
                  {s.label}
                </li>
              ) : i === current ? (
                <li key={s.id} aria-current="step" className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-white">
                  {s.label}
                </li>
              ) : (
                <li key={s.id} className="inline-flex items-center rounded-full border border-line px-2 py-px text-xs text-muted">
                  {s.label}
                </li>
              ),
            )}
          </ol>
        </div>

        <div
          aria-label="Conversation with mentor"
          aria-live="polite"
          className={`${show("chat")} min-h-0 flex-auto flex-col gap-4 overflow-y-auto px-6 py-4 lg:flex`}
        >
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowEarlier(true)}
              className="min-h-8 self-center rounded-full border border-line bg-surface px-3 text-xs text-muted hover:text-ink"
            >
              Show {hiddenCount} earlier messages
            </button>
          )}
          {visibleMessages.map((m) => (
            <Message key={m.id} msg={m} onJump={jumpTo} />
          ))}
          {streaming !== null && (
            <div className="flex max-w-[92%] flex-col gap-1">
              <span className="text-xs font-semibold text-accent">Mentor</span>
              {streaming ? <RichText text={streaming} /> : <TypingDots />}
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-lg border border-warn-line bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn-strong">
              {error.message}{" "}
              {error.code === "no_key" || error.code === "cap" ? (
                <Link href="/settings" className="font-medium text-warn underline">
                  Open Settings
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void askMentor(messages.some((m) => m.role !== "event") ? { kind: "retry" } : { kind: "start" })}
                  className="font-medium text-warn underline disabled:opacity-50"
                >
                  Try again
                </button>
              )}
            </div>
          )}
          <div ref={chatEnd} />
        </div>

        <form
          className={`${show("chat")} flex-col gap-2.5 border-t border-line px-6 pb-4 pt-3 lg:flex`}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="reply" className="sr-only">
            Explain your thinking to the mentor
          </label>
          <textarea
            id="reply"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onComposerKey}
            placeholder="Explain your thinking…"
            className="w-full resize-none rounded-[10px] border border-field bg-surface px-3 py-2.5 leading-normal"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || hintsUsed >= HINT_MAX}
              onClick={() => void askMentor({ kind: "hint" })}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-field bg-surface px-3 hover:bg-ground disabled:opacity-50"
            >
              <BulbIcon size={15} />
              Hint
              <span className="text-xs text-muted">
                {hintsUsed} of {HINT_MAX} used
              </span>
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={interrupt}
                onChange={(e) => {
                  setInterrupt(e.target.checked);
                  void setMentorInterrupt(e.target.checked);
                }}
                className="size-4 accent-accent"
              />
              Mentor can interrupt
            </label>
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 font-medium text-white disabled:opacity-50"
            >
              Send
              <ArrowUpIcon size={15} />
            </button>
          </div>
        </form>
      </section>

      {/* ------------------------------------------------ editor + tests */}
      <section
        aria-label="Code editor and tests"
        className={`${show("code")} h-[calc(100dvh-101px)] min-w-0 flex-auto flex-col bg-code lg:flex lg:h-[calc(100dvh-57px)]`}
      >
        <div className="flex min-h-[52px] flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2">
          <span className="rounded-md bg-bubble px-2.5 py-1 font-mono text-[13px]">
            {language === "python" ? "solution.py" : "solution.js"}
          </span>
          <label className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            Language
            <select
              value={language}
              onChange={(e) => switchLanguage(e.target.value as Language)}
              className="min-h-8 rounded-md border border-field bg-surface px-2 text-ink"
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
            </select>
          </label>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span aria-hidden="true" className={`size-2 rounded-full ${busy ? "animate-pulse bg-accent" : "bg-accent"}`} />
            Mentor is watching{synced !== null ? ` · synced ${synced < 5 ? "just now" : `${synced}s ago`}` : ""}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => void run()}
              disabled={!!running}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-field bg-surface px-3.5 font-medium hover:bg-ground disabled:opacity-60"
            >
              <PlayIcon size={13} />
              {running === "run" ? "Running…" : "Run"}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!!running}
              className="inline-flex min-h-9 items-center rounded-lg bg-accent px-3.5 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
            >
              {running === "submit" ? "Checking…" : "Submit"}
            </button>
          </div>
        </div>

        {/* Absolutely filling a relative box gives Monaco a definite size; height:100% inside a flex item can collapse to ~5px. */}
        <div className="relative min-h-0 flex-auto">
          <div className="absolute inset-0">
          <Editor
            height="100%"
            language={language}
            value={code}
            onChange={onCodeChange}
            beforeMount={beforeMount}
            onMount={onMount}
            theme="mentor-light"
            loading={<div className="p-4 text-[13px] text-muted">Loading editor…</div>}
            options={{
              minimap: { enabled: false },
              fontSize: 13.5,
              lineHeight: 22,
              fontFamily:
                typeof window !== "undefined"
                  ? getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono") || "monospace"
                  : "monospace",
              glyphMargin: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: language === "python" ? 4 : 2,
              padding: { top: 12 },
              renderLineHighlight: "line",
              overviewRulerLanes: 0,
              wordWrap: "on",
            }}
          />
          </div>
        </div>

        <TestPanel
          problem={problem}
          language={language}
          result={result}
          running={running}
          tab={tab}
          setTab={setTab}
        />
      </section>
    </main>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const styles: Record<string, string> = {
    easy: "bg-accent-soft text-accent-strong",
    medium: "bg-warn-soft text-warn-strong",
    hard: "bg-[#F6E3E0] text-[#8E2B1E]",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[difficulty] ?? styles.easy}`}>
      {difficulty}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1.5" aria-label="Mentor is typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

function Message({ msg, onJump }: { msg: ChatMsg; onJump: (line: number) => void }) {
  if (msg.role === "event") {
    return <div className="self-center rounded-full bg-ground px-3 py-1 text-center text-xs text-muted">{msg.content}</div>;
  }
  if (msg.role === "user") {
    return (
      <div className={`max-w-[82%] self-end rounded-[12px_12px_4px_12px] bg-bubble px-3.5 py-2.5 ${msg.pending ? "opacity-70" : ""}`}>
        {msg.meta?.hint ? (
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <BulbIcon size={14} /> Asked for a hint (level {msg.meta.hint})
          </span>
        ) : (
          <p className="m-0 whitespace-pre-wrap">{msg.content}</p>
        )}
      </div>
    );
  }
  const hs = msg.meta?.highlights ?? [];
  if (hs.length) {
    return (
      <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-[#FCFCFB] px-3.5 py-3">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <EyeIcon size={14} />
          <span>
            <span className="font-semibold text-accent">Mentor</span> · looking at your code
          </span>
        </div>
        <RichText text={msg.content} />
        <div className="flex flex-wrap gap-1.5">
          {hs.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onJump(h.start)}
              className="min-h-8 rounded-md border border-line bg-surface px-2.5 text-xs hover:bg-ground"
            >
              Jump to line {h.start === h.end ? h.start : `${h.start}–${h.end}`}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex max-w-[92%] flex-col gap-1">
      <span className="text-xs font-semibold text-accent">Mentor</span>
      <RichText text={msg.content} />
    </div>
  );
}

function TestPanel(props: {
  problem: PublicProblem;
  language: Language;
  result: (RunResult & { kind: "run" | "submit"; total: number }) | null;
  running: "run" | "submit" | null;
  tab: "tests" | "console";
  setTab: (t: "tests" | "console") => void;
}) {
  const { problem, language, result, running, tab, setTab } = props;
  const passed = result?.cases.filter((c) => c.passed).length ?? 0;
  // Submit runs visible tests first, then hidden ones; only the latter are labelled hidden.
  type Row = (CaseResult | (TestCase & { pending: true })) & { hidden?: boolean };
  const rows: Row[] = !result
    ? problem.tests.map((t) => ({ ...t, pending: true as const }))
    : result.kind === "submit"
      ? result.cases
          .map((c, i) => ({ ...c, hidden: i >= problem.tests.length }))
          .filter((c) => !c.passed)
          .slice(0, 3)
      : result.cases;

  return (
    <div className="flex h-[200px] flex-none flex-col border-t border-line bg-surface lg:h-[248px]">
      <div className="flex items-center gap-1 border-b border-line px-4">
        {(["tests", "console"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-10 px-2.5 capitalize ${tab === t ? "font-medium shadow-[inset_0_-2px_0_var(--color-ink)]" : "text-muted"}`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted">
          {running ? (
            running === "submit" ? "Running all tests…" : "Running…"
          ) : result && !result.error ? (
            <>
              <span className="font-semibold text-ink">
                {passed} of {result.total} passed
              </span>
              {result.kind === "run" ? ` · ${problem.hiddenCount} hidden tests run on Submit` : " · including hidden tests"}
            </>
          ) : (
            `${problem.tests.length} visible · ${problem.hiddenCount} hidden on Submit`
          )}
        </span>
      </div>

      {tab === "console" ? (
        <pre className="m-0 flex-auto overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12.5px]">
          {result?.error && <span className="text-warn">{result.error + "\n\n"}</span>}
          {result?.stdout || (!result?.error && <span className="text-muted">print / console.log output shows here</span>)}
        </pre>
      ) : result?.error ? (
        <div className="flex-auto overflow-auto px-4 py-3">
          <p className="m-0 text-[13px] text-warn">
            Your code didn&apos;t run.{" "}
            <button type="button" onClick={() => setTab("console")} className="underline">
              See the error
            </button>
          </p>
        </div>
      ) : (
        <ul className="m-0 flex flex-auto list-none flex-col gap-0.5 overflow-y-auto px-4 py-2 font-mono text-[13px]">
          {result?.kind === "submit" && rows.length === 0 && <li className="text-muted">All tests passed.</li>}
          {rows.map((c, i) => (
            <TestRow key={i} c={c} params={problem.params} language={language} hidden={!!c.hidden} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TestRow({
  c,
  params,
  language,
  hidden,
}: {
  c: CaseResult | (TestCase & { pending: true });
  params: string[];
  language: Language;
  hidden: boolean;
}) {
  const label = formatArgs(c.args, params, language);
  if ("pending" in c) {
    return (
      <li className="flex min-h-[30px] items-center gap-2.5">
        <span aria-label="Not run" className="mx-1 size-2 rounded-full bg-line" />
        <span className="min-w-0 flex-auto truncate">{label}</span>
        <span className="text-muted">→ {formatValue(c.expected, language)}</span>
      </li>
    );
  }
  if (c.passed) {
    return (
      <li className="flex min-h-[30px] items-center gap-2.5">
        <CheckIcon size={15} className="flex-none text-accent" role="img" aria-label="Passed" aria-hidden={false} />
        <span className="min-w-0 flex-auto truncate">{label}</span>
        <span className="text-muted">→ {formatValue(c.got, language)}</span>
      </li>
    );
  }
  return (
    <li className="-mx-2.5 mt-1 flex flex-col gap-1 rounded-lg bg-warn-soft px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <XIcon size={15} className="flex-none text-warn" role="img" aria-label="Failed" aria-hidden={false} />
        <span className="min-w-0 flex-auto break-all">
          {hidden && <span className="font-sans text-xs text-warn-strong">Hidden test · </span>}
          {label}
        </span>
      </div>
      <div className="pl-6 text-ink-2">
        {c.error ? (
          <span className="whitespace-pre-wrap text-warn">{c.error}</span>
        ) : (
          <>
            expected <span className="font-medium">{formatValue(c.expected, language)}</span> · got{" "}
            <span className="font-medium text-warn">{formatValue(c.got, language)}</span>
          </>
        )}
      </div>
    </li>
  );
}
