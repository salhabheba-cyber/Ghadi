/**
 * Optional hosted-AI configuration, read from server-side environment variables only.
 *
 * Two ways to configure it (the first complete one wins, so older deployments keep working):
 *  1. Generic OpenAI-compatible: GHADI_HOSTED_AI_PROVIDER=openai-compatible plus
 *     GHADI_HOSTED_AI_BASE_URL, GHADI_HOSTED_AI_API_KEY and GHADI_HOSTED_AI_MODEL.
 *  2. OpenAI (primary): OPENAI_API_KEY (required); OPENAI_MODEL, OPENAI_VISION_MODEL and OPENAI_BASE_URL
 *     are optional.
 */

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
/**
 * Default models, used only when the environment does not name one. They are the single place the app
 * chooses models, and both can be overridden without a code change (OPENAI_MODEL, OPENAI_VISION_MODEL).
 * Per OpenAI's model documentation both accept image input and support structured outputs on Chat
 * Completions. (gpt-4.1 and gpt-5-mini are marked deprecated there, so they are not used.)
 *  - text: efficient, for guides, notes, quizzes, flashcards, explanations;
 *  - vision: the more capable model, because transcribing a maths worksheet photo must be accurate.
 */
export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";
export const DEFAULT_OPENAI_VISION_MODEL = "gpt-6.1-sol";

export type HostedProviderKind = "openai" | "openai-compatible";

export interface HostedConfig {
  provider: HostedProviderKind;
  baseUrl: string;
  apiKey: string;
  /** Model for text tasks. */
  model: string;
  /** Vision-capable model for reading photos and scanned pages. */
  visionModel: string;
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function readHostedConfig(env: NodeJS.ProcessEnv = process.env): HostedConfig | null {
  const provider = env.GHADI_HOSTED_AI_PROVIDER?.trim();
  const baseUrl = env.GHADI_HOSTED_AI_BASE_URL?.trim();
  const apiKey = env.GHADI_HOSTED_AI_API_KEY?.trim();
  const model = env.GHADI_HOSTED_AI_MODEL?.trim();
  if (provider === "openai-compatible" && baseUrl && apiKey && model && validHttpUrl(baseUrl)) {
    return {
      provider: "openai-compatible",
      baseUrl: baseUrl.replace(/\/+$/, ""),
      apiKey,
      model,
      visionModel: env.GHADI_HOSTED_AI_VISION_MODEL?.trim() || model,
    };
  }

  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const custom = env.OPENAI_BASE_URL?.trim();
    if (custom && !validHttpUrl(custom)) return null;
    return {
      provider: "openai",
      baseUrl: (custom || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, ""),
      apiKey: openaiKey,
      model: env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
      visionModel: env.OPENAI_VISION_MODEL?.trim() || DEFAULT_OPENAI_VISION_MODEL,
    };
  }
  return null;
}
