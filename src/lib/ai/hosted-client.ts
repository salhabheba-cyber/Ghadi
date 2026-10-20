import { LlmProvider, type CompleteFn } from "./llm-provider";
import { ProviderError, type CallOptions } from "./types";

export interface HostedStatus {
  configured: boolean;
  /** Human-readable model label if configured (never includes secrets). */
  model?: string;
}

export async function fetchHostedStatus(fetchImpl: typeof fetch = fetch): Promise<HostedStatus> {
  try {
    const res = await fetchImpl("/api/ai/status", { cache: "no-store" });
    if (!res.ok) return { configured: false };
    return (await res.json()) as HostedStatus;
  } catch {
    return { configured: false };
  }
}

/**
 * Browser-side client for the optional hosted route. Keys never reach the browser: this only talks
 * to Ghadi's own /api/ai/generate endpoint, which holds the credentials server-side.
 * The caller must have recorded explicit user consent before constructing this provider.
 */
export function createHostedProvider(
  consent: boolean,
  modelLabel = "the hosted AI provider",
  fetchImpl: typeof fetch = fetch,
): LlmProvider {
  if (!consent) {
    throw new ProviderError(
      "consent-required",
      "Hosted AI sends your document text to a third party. Give your explicit consent in Settings first.",
    );
  }

  const complete: CompleteFn = async ({ task, payload }, call: CallOptions) => {
    let res: Response;
    try {
      res = await fetchImpl("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: call.signal,
        body: JSON.stringify({ task, payload, consent: true }),
      });
    } catch {
      if (call.signal?.aborted) throw new ProviderError("cancelled", "Generation was cancelled.");
      throw new ProviderError("unreachable", "Could not reach Ghadi's server for hosted AI.");
    }
    const body = (await res.json().catch(() => null)) as {
      text?: string;
      error?: { code?: string; message?: string };
    } | null;
    if (!res.ok || !body || typeof body.text !== "string") {
      const message = body?.error?.message ?? `Hosted AI request failed (HTTP ${res.status}).`;
      const code =
        res.status === 429 ? "rate-limited" : res.status === 501 ? "not-configured" : "http-error";
      throw new ProviderError(code, message);
    }
    return body.text;
  };

  return new LlmProvider("hosted", `Hosted (${modelLabel})`, "hosted-ai", modelLabel, complete);
}
