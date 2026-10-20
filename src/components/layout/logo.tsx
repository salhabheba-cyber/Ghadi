import { cn } from "@/lib/utils";

/** Original Ghadi mark: a rounded tile holding a stylised "G" built from an open ring and a bar. */
export function LogoMark({ className }: { className?: string }) {
  // CSS gradient (no SVG <defs> ids), so several logos can coexist even when one is display:none.
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-brand-500 to-purple-500",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="h-full w-full" role="img" aria-label="Ghadi logo">
        <path
          d="M22.5 11.2A8 8 0 1 0 24 16h-7"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
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
