import type { Visual } from "@/lib/schemas";

export function ShapeSvg({ shape, color, size = 112 }: { shape: "circle" | "square" | "triangle" | "star"; color: string; size?: number }) {
  const common = { fill: color, stroke: "#17302F", strokeWidth: 4 };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {shape === "circle" && <circle cx="50" cy="50" r="40" {...common} />}
      {shape === "square" && <rect x="12" y="12" width="76" height="76" rx="4" {...common} />}
      {shape === "triangle" && <polygon points="50,10 92,88 8,88" strokeLinejoin="round" {...common} />}
      {shape === "star" && <polygon points="50,8 61,38 93,38 67,57 77,89 50,70 23,89 33,57 7,38 39,38" strokeLinejoin="round" {...common} />}
    </svg>
  );
}

/** Decorative: every visual is paired with visible text, so screen readers skip it. */
export function VisualView({ visual, small = false }: { visual: Visual; small?: boolean }) {
  if (visual.type === "emoji") return <span className={small ? "vis-small" : "emoji-big"} aria-hidden="true">{visual.value}</span>;
  if (visual.type === "swatch") return <span className={small ? "swatch-chip" : "swatch-big"} style={{ background: visual.color, display: "inline-block" }} aria-hidden="true" />;
  return <ShapeSvg shape={visual.shape} color={visual.color} size={small ? 64 : 112} />;
}
