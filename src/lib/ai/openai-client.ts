/**
 * OpenAI client — server-only.
 * Uses the admin key stored in GHADI_HOSTED_AI_API_KEY (same env var as the
 * OpenAI-compatible hosted config, but accessed through the official SDK for
 * streaming, structured output, and richer error handling).
 *
 * Never imported by client bundles: all callers live inside API routes or
 * Server Actions that are tagged `"use server"`.
 */

import OpenAI from "openai";
import { readHostedConfig } from "@/lib/server/hosted-config";

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (_client) return _client;
  const cfg = readHostedConfig();
  if (!cfg) {
    throw new Error(
      "OpenAI is not configured. Set GHADI_HOSTED_AI_API_KEY, GHADI_HOSTED_AI_BASE_URL and GHADI_HOSTED_AI_MODEL.",
    );
  }
  _client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
  });
  return _client;
}

export function getModel(): string {
  const cfg = readHostedConfig();
  return cfg?.model ?? "gpt-4o-mini";
}

/** True when admin has configured the hosted AI key. */
export function isOpenAIConfigured(): boolean {
  return readHostedConfig() !== null;
}
