"use client";
import { useCallback } from "react";
import { useConfirm } from "@/components/ui/primitives";
import { loadSettings, saveSettings } from "@/lib/storage/repo";

export const AI_CONSENT_TITLE = "Use OpenAI for this?";

export const AI_CONSENT_TEXT = {
  text: "To do this, Ghadi sends the text of your material to OpenAI through this app's server. OpenAI usage is billed to the API account configured on the server (it is separate from any ChatGPT subscription) and may cost money. Your files stay on your device, and you can withdraw this permission any time in Settings.",
  images:
    "To read this photo or scan, Ghadi sends the image to OpenAI through this app's server. OpenAI usage is billed to the API account configured on the server (it is separate from any ChatGPT subscription) and may cost money. Images are not stored by Ghadi, and you can withdraw this permission any time in Settings.",
} as const;

/**
 * Returns a function that makes sure the learner has agreed to send their material to OpenAI,
 * asking once (and remembering the answer). Resolves to false when they decline, so callers do
 * nothing and make no paid request.
 */
export function useEnsureAiConsent() {
  const confirm = useConfirm();
  return useCallback(
    async (what: "text" | "images" = "text"): Promise<boolean> => {
      const settings = await loadSettings();
      if (settings.hostedConsent) return true;
      const ok = await confirm({
        title: AI_CONSENT_TITLE,
        message: AI_CONSENT_TEXT[what],
        confirmLabel: "Allow and continue",
      });
      if (ok) await saveSettings({ ...settings, hostedConsent: true });
      return ok;
    },
    [confirm],
  );
}
