/**
 * Streaming/chat helpers still used by the chat and answer-check routes. Server-only.
 * Configuration comes from src/lib/server/hosted-config.ts (OPENAI_API_KEY or GHADI_HOSTED_AI_*).
 */
import type OpenAI from "openai";
import { readHostedConfig } from "@/lib/server/hosted-config";
import { createClient, requireConfig } from "./openai-server";

/** A fresh client per call, so a changed environment is always honoured. */
export function getOpenAIClient(): OpenAI {
  return createClient(requireConfig());
}

export function getModel(): string {
  return requireConfig().model;
}

export function isOpenAIConfigured(): boolean {
  return readHostedConfig() !== null;
}
