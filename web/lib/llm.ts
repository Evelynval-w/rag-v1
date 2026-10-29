import OpenAI from "openai";
import { AnswerSchema, type Answer } from "./schema";
import { SYSTEM_MESSAGE, buildUserMessage } from "./prompt";
import type { Chunk } from "./rag-client";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }
  _client = new OpenAI({
    apiKey,
    baseURL:
      process.env.LLM_BASE_URL ??
      "https://generativelanguage.googleapis.com/v1beta/openai/",
    timeout: 30_000,
    maxRetries: 2,
  });
  return _client;
}

const MODEL = process.env.LLM_MODEL ?? "gemini-3.5-flash-lite";

export class LlmInvalidOutputError extends Error {
  readonly raw: string;
  constructor(raw: string, message: string) {
    super(message);
    this.name = "LlmInvalidOutputError";
    this.raw = raw;
  }
}

function stripFence(s: string): string {
  const m = s.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : s;
}

export async function answerFromChunks(
  question: string,
  chunks: Chunk[],
): Promise<{ answer: Answer; usage: { input: number; output: number } | null; model: string }> {
  const res = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_MESSAGE },
      { role: "user", content: buildUserMessage(question, chunks) },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? "";
  const cleaned = stripFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LlmInvalidOutputError(raw, "model did not return valid JSON");
  }
  const check = AnswerSchema.safeParse(parsed);
  if (!check.success) {
    throw new LlmInvalidOutputError(raw, check.error.message);
  }
  return {
    answer: check.data,
    model: MODEL,
    usage: res.usage
      ? {
          input: res.usage.prompt_tokens ?? 0,
          output: res.usage.completion_tokens ?? 0,
        }
      : null,
  };
}
