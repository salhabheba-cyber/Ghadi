/** Reads optional hosted-AI configuration from server-side environment variables only. */

export interface HostedConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function readHostedConfig(env: NodeJS.ProcessEnv = process.env): HostedConfig | null {
  const provider = env.GHADI_HOSTED_AI_PROVIDER?.trim();
  const baseUrl = env.GHADI_HOSTED_AI_BASE_URL?.trim();
  const apiKey = env.GHADI_HOSTED_AI_API_KEY?.trim();
  const model = env.GHADI_HOSTED_AI_MODEL?.trim();
  if (provider !== "openai-compatible" || !baseUrl || !apiKey || !model) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}
