/**
 * Optional hosted-AI configuration, read from server-side environment variables only.
 *
 * Two ways to configure it (the first complete one wins, so older deployments keep working):
 *  1. Generic OpenAI-compatible: GHADI_HOSTED_AI_PROVIDER=openai-compatible plus
 *     GHADI_HOSTED_AI_BASE_URL, GHADI_HOSTED_AI_API_KEY and GHADI_HOSTED_AI_MODEL.
 *  2. OpenAI: OPENAI_API_KEY (required), OPENAI_MODEL (optional) and OPENAI_BASE_URL (optional).
 */

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
/** Used only when OPENAI_MODEL is not set. A small, inexpensive, widely available model. */
export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

export type HostedProviderKind = "openai" | "openai-compatible";

export interface HostedConfig {
  provider: HostedProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
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
    };
  }
  return null;
}
