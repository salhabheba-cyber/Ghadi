import { cn } from "@/lib/utils";

/**
 * Ghadi logo mark — the Ghadi character illustration (brown wavy hair, round
 * glasses, daisy necklace) on the brand purple. Served from /public so it is
 * same-origin under the CSP and cached like any static asset.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static asset; next/image adds no value here
    <img
      src="/ghadi-logo-128.webp"
      alt="Ghadi logo"
      width={32}
      height={32}
      decoding="async"
      className={cn("h-8 w-8 shrink-0 rounded-[9px] object-cover", className)}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-lg font-bold tracking-tight", className)}>
      <LogoMark />
      Ghadi
    </span>
  );
}
