/**
 * Server-only OpenAI access, built on the official `openai` SDK.
 * Only API routes import this file; the key never reaches a browser bundle.
 */
import OpenAI from "openai";
import { readHostedConfig, type HostedConfig } from "@/lib/server/hosted-config";

export type AiFailureCode =
  | "not-configured"
  | "invalid-key"
  | "insufficient-credits"
  | "rate-limited"
  | "model-not-found"
  | "timeout"
  | "unreachable"
  | "bad-response"
  | "upstream-error";

export class AiError extends Error {
  constructor(
    readonly code: AiFailureCode,
    message: string,
    /** HTTP status Ghadi should answer with. */
    readonly status: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export function requireConfig(env: NodeJS.ProcessEnv = process.env): HostedConfig {
  const cfg = readHostedConfig(env);
  if (!cfg) {
    throw new AiError(
      "not-configured",
      "AI is not configured on this server. Ghadi still works fully offline.",
      501,
    );
  }
  return cfg;
}

export function createClient(cfg: HostedConfig, timeoutMs = 60_000): OpenAI {
  // One SDK-level retry covers transient 429/5xx/network blips; anything beyond that is surfaced.
  return new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    timeout: timeoutMs,
    maxRetries: 1,
  });
}

/** Reasoning-style models (gpt-5 and later, o-series) reject `temperature` and use `max_completion_tokens`. */
export function isReasoningModel(model: string): boolean {
  return /^(gpt-[5-9]|o\d)/i.test(model);
}

/** An image sent for transcription, as a data URL (never a remote URL, so nothing is fetched by the provider). */
export interface ImageInput {
  dataUrl: string;
}

export interface ChatCall {
  system: string;
  user: string;
  /** Images attached to the user message (vision requests). */
  images?: ImageInput[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export function buildChatParams(model: string, call: ChatCall) {
  const reasoning = isReasoningModel(model);
  const limit = call.maxTokens ?? 4096;
  return {
    model,
    messages: [
      { role: "system" as const, content: call.system },
      {
        role: "user" as const,
        content: call.images?.length
          ? [
              { type: "text" as const, text: call.user },
              ...call.images.map((i) => ({
                type: "image_url" as const,
                image_url: { url: i.dataUrl, detail: "high" as const },
              })),
            ]
          : call.user,
      },
    ],
    ...(call.json ? { response_format: { type: "json_object" as const } } : {}),
    ...(reasoning
      ? // Low effort keeps structured-extraction answers fast; the limit also covers hidden reasoning tokens.
        { max_completion_tokens: limit, reasoning_effort: "low" as const }
      : { max_tokens: limit, temperature: call.temperature ?? 0.2 }),
  };
}

/** Maps any SDK/network failure to a user-actionable AiError. Never includes the API key. */
export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AiError("timeout", "The AI provider took too long to answer. Try again.", 504);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AiError(
      "unreachable",
      "Could not reach the AI provider. Check the server's network.",
      502,
    );
  }
  if (error instanceof OpenAI.APIError) {
    const code = String(error.code ?? "");
    const status = error.status ?? 0;
    if (code === "insufficient_quota" || status === 402) {
      return new AiError(
        "insufficient-credits",
        "The AI provider account is out of credits. Add billing credit and try again.",
        402,
      );
    }
    if (status === 401 || status === 403 || code === "invalid_api_key") {
      return new AiError(
        "invalid-key",
        "The AI provider rejected this server's API key. Check the key in the server settings.",
        502,
      );
    }
    if (status === 429) {
      return new AiError(
        "rate-limited",
        "The AI provider is rate limiting requests. Try again shortly.",
        429,
      );
    }
    if (status === 404 || code === "model_not_found") {
      return new AiError(
        "model-not-found",
        "The configured OpenAI model was not found or is not available to this account. Set OPENAI_MODEL (text) or OPENAI_VISION_MODEL (images) on the server to a model your account can use.",
        502,
      );
    }
    return new AiError(
      "upstream-error",
      `The AI provider returned an error (HTTP ${status || "unknown"}).`,
      502,
    );
  }
  return new AiError("upstream-error", "The AI request failed unexpectedly.", 502);
}

/** Runs one non-streaming completion and returns the text. Throws AiError on any failure. */
export async function completeText(
  call: ChatCall,
  options: {
    cfg?: HostedConfig;
    timeoutMs?: number;
    signal?: AbortSignal;
    /** Use the vision model (set automatically when the call carries images). */
    vision?: boolean;
  } = {},
): Promise<{ text: string; model: string }> {
  const cfg = options.cfg ?? requireConfig();
  const model = options.vision || call.images?.length ? cfg.visionModel : cfg.model;
  try {
    const client = createClient(cfg, options.timeoutMs);
    const completion = await client.chat.completions.create(buildChatParams(model, call), {
      signal: options.signal,
    });
    const text = completion.choices[0]?.message?.content;
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new AiError("bad-response", "The AI provider returned an empty answer.", 502);
    }
    return { text, model };
  } catch (error) {
    throw toAiError(error);
  }
}
