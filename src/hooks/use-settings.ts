"use client";
import { useLive } from "./use-live";
import { loadSettings } from "@/lib/storage/repo";
import { settingsSchema, type Settings } from "@/lib/validation/schemas";

export function useSettings(): Settings {
  const { data } = useLive(() => loadSettings(), []);
  return data ?? settingsSchema.parse({});
}
