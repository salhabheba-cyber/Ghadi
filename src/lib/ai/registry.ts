import { OfflineProvider } from "./offline";
import { createHostedProvider } from "./hosted-client";
import { ProviderError, type CallOptions, type Generated, type StudyProvider } from "./types";
import type { LlmProvider } from "./llm-provider";
import type { Settings } from "@/lib/validation/schemas";
import { errorMessage } from "@/lib/utils";

/** The rule-based generator. It is never chosen automatically: only an explicit user action uses it. */
export const offlineProvider = new OfflineProvider();

/**
 * The AI engine is OpenAI, reached through Ghadi's own server. There is no provider setting and no
 * automatic switching to anything else. Throws ProviderError("consent-required") until the user has
 * agreed to send their material to OpenAI; the UI asks for that agreement and then retries.
 */
export function createProvider(settings: Pick<Settings, "hostedConsent">): LlmProvider {
  return createHostedProvider(settings.hostedConsent, "OpenAI");
}

export type GeneratedWithFallback<T> = Generated<T> & {
  /** Set when OpenAI failed and the user explicitly chose the offline generator instead. */
  fellBackBecause?: string;
};

/**
 * Runs a generation on OpenAI. If it fails, the error is rethrown so the UI can show it and a next
 * step. Only when the caller explicitly sets `call.allowOfflineFallback` (the user pressed "make a
 * basic version without AI") does it use the offline generator, and then the result says so in its
 * notices, so offline output is never presented as OpenAI output.
 */
export async function generateWithFallback<T>(
  settings: Pick<Settings, "hostedConsent">,
  run: (provider: StudyProvider, call: CallOptions) => Promise<Generated<T>>,
  call: CallOptions = {},
): Promise<GeneratedWithFallback<T>> {
  if (call.useOffline) return run(offlineProvider, call);
  try {
    return await run(createProvider(settings), call);
  } catch (error) {
    if (error instanceof ProviderError && error.code === "cancelled") throw error;
    if (call.signal?.aborted) throw new ProviderError("cancelled", "Generation was cancelled.");
    if (!call.allowOfflineFallback) throw error;
    const reason = errorMessage(error);
    const result = await run(offlineProvider, call);
    return {
      ...result,
      notices: [
        `OpenAI could not be used, so Ghadi made this with its offline rules (no AI). Reason: ${reason}`,
        ...result.notices,
      ],
      fellBackBecause: reason,
    };
  }
}
