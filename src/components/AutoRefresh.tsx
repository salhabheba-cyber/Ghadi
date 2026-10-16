"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the server component every few seconds while background work (OCR) is running. */
export function AutoRefresh({ everyMs = 3000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => router.refresh(), everyMs); return () => clearInterval(t); }, [router, everyMs]);
  return null;
}
