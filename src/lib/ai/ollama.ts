import { LlmProvider, type CompleteFn } from "./llm-provider";
import { ProviderError, type CallOptions } from "./types";

export const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";
export const OLLAMA_TIMEOUT_MS = 180_000;

export function normalizeEndpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new ProviderError(
      "not-configured",
      "The Ollama address is not a valid URL. Example: http://localhost:11434",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProviderError(
      "not-configured",
      "The Ollama address must start with http:// or https://",
    );
  }
  return url.origin;
}

/** Combines a caller's AbortSignal with a timeout. */
function withTimeout(
  call: CallOptions,
  ms: number,
): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let didTimeOut = false;
  const timer = setTimeout(() => {
    didTimeOut = true;
    controller.abort();
  }, ms);
  const onAbort = () => controller.abort();
  if (call.signal) {
    if (call.signal.aborted) controller.abort();
    else call.signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => didTimeOut,
    cleanup: () => {
      clearTimeout(timer);
      call.signal?.removeEventListener("abort", onAbort);
    },
  };
}

function unreachable(endpoint: string): ProviderError {
  return new ProviderError(
    "unreachable",
    `Could not reach Ollama at ${endpoint}. Make sure Ollama is installed and running. If it is running, allow this site to call it by starting Ollama with OLLAMA_ORIGINS set to this site's address (for example OLLAMA_ORIGINS=http://localhost:3000).`,
  );
}

function modelMissing(model: string): ProviderError {
  return new ProviderError(
    "model-missing",
    `The model “${model}” is not installed in Ollama. Install it yourself with: ollama pull ${model}`,
  );
}

export interface OllamaConnectionResult {
  ok: boolean;
  models: string[];
  modelInstalled: boolean;
  message: string;
}

/** Checks the endpoint and whether the configured model is installed. Never downloads anything. */
export async function testOllamaConnection(
  endpointInput: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OllamaConnectionResult> {
  let endpoint: string;
  try {
    endpoint = normalizeEndpoint(endpointInput);
  } catch (error) {
    return { ok: false, models: [], modelInstalled: false, message: (error as Error).message };
  }
  const t = withTimeout({}, 8000);
  try {
    const res = await fetchImpl(`${endpoint}/api/tags`, { signal: t.signal });
    if (!res.ok) {
      return {
        ok: false,
        models: [],
        modelInstalled: false,
        message: `Ollama answered with HTTP ${res.status}. Is ${endpoint} really an Ollama server?`,
      };
    }
    const body = (await res.json()) as { models?: { name?: string }[] };
    const models = (body.models ?? []).map((m) => m.name ?? "").filter(Boolean);
    const installed = models.some(
      (m) => m === model || m === `${model}:latest` || m.split(":")[0] === model,
    );
    return installed
      ? {
          ok: true,
          models,
          modelInstalled: true,
          message: `Connected. Model “${model}” is installed.`,
        }
      : {
          ok: false,
          models,
          modelInstalled: false,
          message: `Connected to Ollama, but the model “${model}” is not installed. Install it yourself with: ollama pull ${model}`,
        };
  } catch {
    return {
      ok: false,
      models: [],
      modelInstalled: false,
      message: t.timedOut() ? "Timed out waiting for Ollama." : unreachable(endpoint).message,
    };
  } finally {
    t.cleanup();
  }
}

export function createOllamaProvider(
  endpointInput: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): LlmProvider {
  const endpoint = normalizeEndpoint(endpointInput);
  if (!model.trim())
    throw new ProviderError("not-configured", "Choose an Ollama model name in Settings.");

  const complete: CompleteFn = async ({ prompt }, call) => {
    const t = withTimeout(call, OLLAMA_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: t.signal,
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          options: { temperature: 0.2 },
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (res.status === 404 && /not found/i.test(text)) throw modelMissing(model);
        throw new ProviderError("http-error", `Ollama returned HTTP ${res.status}.`);
      }
      const body = (await res.json()) as { message?: { content?: string } };
      const content = body.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        throw new ProviderError("bad-response", "Ollama returned an empty answer.");
      }
      return content;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (call.signal?.aborted) throw new ProviderError("cancelled", "Generation was cancelled.");
      if (t.timedOut()) {
        throw new ProviderError(
          "timeout",
          "The local model took too long to answer. Try a smaller model, a shorter source, or fewer questions.",
        );
      }
      throw unreachable(endpoint);
    } finally {
      t.cleanup();
    }
  };

  return new LlmProvider(
    "ollama",
    `Ollama (${model})`,
    "local-ai",
    `the local model “${model}” via Ollama`,
    complete,
  );
}
