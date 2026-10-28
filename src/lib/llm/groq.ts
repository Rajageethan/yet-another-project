import "server-only";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/dates";
import type { AppUser } from "@/lib/session";
import { fakeClient, fakeLlmEnabled } from "./fake";

const BASE_URL = "https://api.groq.com/openai/v1";

// Each Groq model has its own per-minute token budget, so falling back to a second model adds headroom.
export const MODELS = {
  mentor: process.env.GROQ_MENTOR_MODEL || "openai/gpt-oss-120b",
  fallback: process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b",
  fast: process.env.GROQ_FAST_MODEL || "openai/gpt-oss-20b",
};

export class LlmError extends Error {
  constructor(
    message: string,
    public code: "no_key" | "cap" | "rate_limit" | "upstream",
  ) {
    super(message);
  }
}

export type Llm = { client: OpenAI; shared: boolean };

export function getLlm(user: AppUser): Llm {
  // Playwright suite only (E2E_FAKE_LLM=1, never in production): scripted replies, no network.
  if (fakeLlmEnabled) return { client: fakeClient(), shared: false };
  if (user.groqKeyEnc) {
    try {
      return { client: new OpenAI({ apiKey: decrypt(user.groqKeyEnc), baseURL: BASE_URL, maxRetries: 0 }), shared: false };
    } catch {
      // Fall through to the shared key if the stored key can't be decrypted (e.g. AUTH_SECRET changed).
    }
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new LlmError("No Groq API key is set up. Add your free key in Settings.", "no_key");
  }
  return { client: new OpenAI({ apiKey: key, baseURL: BASE_URL, maxRetries: 0 }), shared: true };
}

/** Counts one mentor turn against the shared-key daily cap. */
export async function countTurn(user: AppUser, llm: Llm) {
  if (!llm.shared) return;
  const cap = Number(process.env.DAILY_TURN_CAP || 60);
  const date = dayKey(user.timezone);
  const usage = await db.usageDay.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: { turns: { increment: 1 } },
    create: { userId: user.id, date, turns: 1 },
  });
  if (usage.turns > cap) {
    throw new LlmError(
      `You've used today's ${cap} mentor replies on the shared key. Add your own free Groq key in Settings to keep going.`,
      "cap",
    );
  }
}

type Effort = "low" | "medium" | "high";

// The mentor's replies are where reasoning pays off: in failure replays (eval/replay.ts) high effort fixed
// half the bad replies for ~20% more tokens. Summaries, assessments and drafts stay on low.
const MENTOR_EFFORT = (process.env.GROQ_MENTOR_REASONING || "high") as Effort;

/** Model-specific params: gpt-oss reasons, other models reject reasoning params. */
function tune<T extends { model: string }>(params: T, effort: Effort = "low"): T {
  if (params.model.startsWith("openai/gpt-oss")) {
    return { ...params, reasoning_effort: effort };
  }
  return params;
}

function isRetryable(err: unknown) {
  return err instanceof OpenAI.APIError && (err.status === 429 || (err.status ?? 0) >= 500);
}

/** The model is unavailable to this key (removed, decommissioned, or not enabled): try the next one. */
function isModelUnavailable(err: unknown) {
  if (!(err instanceof OpenAI.APIError)) return false;
  return err.status === 404 || (err.status === 400 && /model/i.test(err.message) && /decommission|not exist|not found|access/i.test(err.message));
}

function retryAfterMs(err: unknown, attempt: number) {
  if (err instanceof OpenAI.APIError) {
    const header = err.headers?.get?.("retry-after");
    const secs = header ? Number(header) : NaN;
    if (Number.isFinite(secs)) return Math.min(secs * 1000, 8000);
  }
  return 1000 * 2 ** attempt;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs a request against the given models in order, retrying 429/5xx with
 * backoff before falling back to the next model.
 */
async function withFallback<R>(models: string[], run: (model: string) => Promise<R>): Promise<R> {
  let lastErr: unknown;
  for (const model of [...new Set(models)]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await run(model);
      } catch (err) {
        lastErr = err;
        if (isModelUnavailable(err)) {
          console.warn(`[groq] model ${model} unavailable to this key, trying the next one`);
          break;
        }
        if (!isRetryable(err)) throw toLlmError(err);
        // On a rate limit, move to the next model (separate budget) after one short wait.
        if (attempt === 0) await sleep(Math.min(retryAfterMs(err, attempt), 3000));
        else {
          // Groq's message says which limit was hit (tokens/requests per minute/day) and the counts.
          const why = err instanceof OpenAI.APIError ? `${err.status} ${err.message.replace(/org_\w+/g, "org").slice(0, 220)}` : "?";
          console.warn(`[groq] ${model} still failing (${why}), falling back to the next model`);
        }
      }
    }
  }
  throw toLlmError(lastErr);
}

function toLlmError(err: unknown) {
  if (err instanceof LlmError) return err;
  if (err instanceof OpenAI.APIError) {
    if (err.status === 429) return new LlmError("The mentor is busy (rate limit). Try again in a minute.", "rate_limit");
    if (err.status === 401) return new LlmError("The Groq API key was rejected. Check it in Settings.", "no_key");
    return new LlmError(`Groq error ${err.status ?? ""}: ${err.message}`, "upstream");
  }
  return new LlmError(err instanceof Error ? err.message : "Unknown LLM error", "upstream");
}

type StreamParams = Omit<ChatCompletionCreateParamsStreaming, "model" | "stream">;
type JsonParams = Omit<ChatCompletionCreateParamsNonStreaming, "model" | "stream">;

export function streamMentor(llm: Llm, params: StreamParams) {
  return withFallback([MODELS.mentor, MODELS.fallback], (model) =>
    llm.client.chat.completions.create(tune({ ...params, model, stream: true }, MENTOR_EFFORT)),
  );
}

/** Non-streaming call that must return a JSON object. */
export async function completeJson<T>(llm: Llm, params: JsonParams, which: "mentor" | "fast" = "mentor"): Promise<T> {
  const models = which === "fast" ? [MODELS.fast, MODELS.mentor] : [MODELS.mentor, MODELS.fallback];
  const res = await withFallback(models, (model) =>
    llm.client.chat.completions.create(tune({ ...params, model, stream: false, response_format: { type: "json_object" } })),
  );
  const text = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as T;
}

export async function completeText(llm: Llm, params: JsonParams): Promise<string> {
  const res = await withFallback([MODELS.fast, MODELS.mentor], (model) =>
    llm.client.chat.completions.create(tune({ ...params, model, stream: false })),
  );
  return res.choices[0]?.message?.content?.trim() ?? "";
}
