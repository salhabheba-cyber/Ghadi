import { LlmProvider, type CompleteFn } from "./llm-provider";
import { ProviderError, type CallOptions } from "./types";

export interface HostedStatus {
  configured: boolean;
  /** Human-readable model label if configured (never includes secrets). */
  model?: string;
  /** Vision model used for photos and scanned pages. */
  visionModel?: string;
  /** "openai" or "openai-compatible". */
  provider?: string;
  /** Always true for hosted AI: document text leaves this device. */
  cloud?: boolean;
}

export type HostedTestResult =
  | {
      ok: true;
      provider: string;
      model: string;
      latencyMs: number;
      vision?: { ok: boolean; model: string; message?: string };
    }
  | { ok: false; code: string; message: string };

/** Asks the Ghadi server to make one real request to the hosted provider. Never reports success on failure. */
export async function testHostedConnection(
  fetchImpl: typeof fetch = fetch,
): Promise<HostedTestResult> {
  try {
    const res = await fetchImpl("/api/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const body = (await res.json().catch(() => null)) as
      | {
          ok?: boolean;
          provider?: string;
          model?: string;
          latencyMs?: number;
          vision?: { ok: boolean; model: string; message?: string };
        }
      | { error?: { code?: string; message?: string } }
      | null;
    if (res.ok && body && "ok" in body && body.ok === true) {
      return {
        ok: true,
        provider: body.provider ?? "unknown",
        model: body.model ?? "unknown",
        latencyMs: body.latencyMs ?? 0,
        vision: body.vision,
      };
    }
    const err = body && "error" in body ? body.error : undefined;
    return {
      ok: false,
      code: err?.code ?? "http-error",
      message: err?.message ?? `The connection test failed (HTTP ${res.status}).`,
    };
  } catch {
    return {
      ok: false,
      code: "unreachable",
      message: "Could not reach Ghadi's server to run the test.",
    };
  }
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
  modelLabel = "OpenAI",
  fetchImpl: typeof fetch = fetch,
): LlmProvider {
  if (!consent) {
    throw new ProviderError(
      "consent-required",
      "Ghadi needs your permission to send your material to OpenAI for this. Allow it and try again.",
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
      throw new ProviderError(
        "unreachable",
        "Could not reach Ghadi's server. Check your connection and try again.",
      );
    }
    const body = (await res.json().catch(() => null)) as {
      text?: string;
      error?: { code?: string; message?: string };
    } | null;
    if (!res.ok || !body || typeof body.text !== "string") {
      const message = body?.error?.message ?? `The AI request failed (HTTP ${res.status}).`;
      const code =
        res.status === 429
          ? "rate-limited"
          : res.status === 501
            ? "not-configured"
            : res.status === 504
              ? "timeout"
              : body?.error?.code === "invalid-output"
                ? "invalid-output"
                : "http-error";
      throw new ProviderError(code, message);
    }
    return body.text;
  };

  return new LlmProvider("hosted", modelLabel, "hosted-ai", modelLabel, complete);
}
