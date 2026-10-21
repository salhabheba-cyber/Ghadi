import { OfflineProvider } from "./offline";
import { createOllamaProvider } from "./ollama";
import { createHostedProvider } from "./hosted-client";
import { ProviderError, type CallOptions, type Generated, type StudyProvider } from "./types";
import type { Settings } from "@/lib/validation/schemas";
import { errorMessage } from "@/lib/utils";

export const offlineProvider = new OfflineProvider();

/** Builds the provider chosen in Settings. Throws ProviderError if it is selected but not usable. */
export function createProvider(settings: Settings, hostedModelLabel?: string): StudyProvider {
  switch (settings.provider) {
    case "ollama":
      return createOllamaProvider(settings.ollamaEndpoint, settings.ollamaModel);
    case "hosted":
      return createHostedProvider(settings.hostedConsent, hostedModelLabel);
    default:
      return offlineProvider;
  }
}

export type GeneratedWithFallback<T> = Generated<T> & {
  /** Set when the chosen provider failed and offline generation was used instead. */
  fellBackBecause?: string;
};

/**
 * Runs a generation on the chosen provider. If that provider fails (not installed, unreachable,
 * timeout, bad output, no consent...) the error is rethrown so the UI can show it. Only when the
 * caller explicitly sets `call.allowOfflineFallback` does it fall back to the offline generator, and
 * then it says so in the notices, so offline output is never presented as model output.
 */
export async function generateWithFallback<T>(
  settings: Settings,
  run: (provider: StudyProvider, call: CallOptions) => Promise<Generated<T>>,
  call: CallOptions = {},
  hostedModelLabel?: string,
): Promise<GeneratedWithFallback<T>> {
  if (settings.provider === "offline") return run(offlineProvider, call);
  try {
    return await run(createProvider(settings, hostedModelLabel), call);
  } catch (error) {
    if (error instanceof ProviderError && error.code === "cancelled") throw error;
    if (call.signal?.aborted) throw new ProviderError("cancelled", "Generation was cancelled.");
    if (!call.allowOfflineFallback) throw error;
    const reason = errorMessage(error);
    const result = await run(offlineProvider, call);
    return {
      ...result,
      notices: [
        `The selected AI provider failed, so Ghadi used offline heuristics instead. Reason: ${reason}`,
        ...result.notices,
      ],
      fellBackBecause: reason,
    };
  }
}
