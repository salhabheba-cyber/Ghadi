import type { GuideBlock } from "@/lib/validation/schemas";

type Flow = Extract<GuideBlock, { type: "flow" }>;

const NODE_W = 150;
const NODE_H = 50;
const GAP_X = 24;
const GAP_Y = 46;

/** Longest-path layering. Edges that would close a cycle are ignored for layout (still drawn). */
export function layoutFlow(flow: Flow) {
  const ids = flow.nodes.map((n) => n.id);
  const level = new Map(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const e of flow.edges) {
      const next = (level.get(e.from) ?? 0) + 1;
      if (next > (level.get(e.to) ?? 0) && next < ids.length) {
        level.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const rows = new Map<number, string[]>();
  for (const id of ids) {
    const l = level.get(id) ?? 0;
    rows.set(l, [...(rows.get(l) ?? []), id]);
  }
  const maxCols = Math.max(...Array.from(rows.values()).map((r) => r.length));
  const width = maxCols * NODE_W + (maxCols - 1) * GAP_X;
  const levels = Math.max(...Array.from(rows.keys())) + 1;
  const height = levels * NODE_H + (levels - 1) * GAP_Y;
  const pos = new Map<string, { x: number; y: number }>();
  for (const [l, row] of rows) {
    const rowW = row.length * NODE_W + (row.length - 1) * GAP_X;
    const x0 = (width - rowW) / 2;
    row.forEach((id, i) => pos.set(id, { x: x0 + i * (NODE_W + GAP_X), y: l * (NODE_H + GAP_Y) }));
  }
  return { pos, width, height };
}

function wrapLabel(label: string, max = 20): string[] {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/** A real SVG flowchart drawn only from the nodes and arrows the guide declares. */
export function FlowDiagram({ flow }: { flow: Flow }) {
  const { pos, width, height } = layoutFlow(flow);
  const pad = 12;
  const label = new Map(flow.nodes.map((n) => [n.id, n.label]));
  const summary = flow.edges
    .map((e) => `${label.get(e.from)} leads to ${label.get(e.to)}${e.label ? ` (${e.label})` : ""}`)
    .join("; ");
  return (
    <figure className="space-y-2">
      <svg
        viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
        className="mx-auto h-auto w-full max-w-xl"
        role="img"
        aria-label={`Flow diagram: ${flow.title}. ${summary}`}
      >
        <defs>
          <marker
            id="gh-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" className="fill-violet-600 dark:fill-violet-300" />
          </marker>
        </defs>
        {flow.edges.map((e, i) => {
          const a = pos.get(e.from)!;
          const b = pos.get(e.to)!;
          const down = b.y > a.y;
          const x1 = a.x + NODE_W / 2;
          const y1 = down ? a.y + NODE_H : a.y + NODE_H / 2;
          const x2 = b.x + NODE_W / 2;
          const y2 = down ? b.y : b.y + NODE_H / 2;
          const same = b.y === a.y;
          const sx = same ? (b.x > a.x ? a.x + NODE_W : a.x) : x1;
          const ex = same ? (b.x > a.x ? b.x : b.x + NODE_W) : x2;
          return (
            <g key={i}>
              <line
                x1={sx}
                y1={same ? a.y + NODE_H / 2 : y1}
                x2={ex}
                y2={same ? b.y + NODE_H / 2 : y2}
                className="stroke-violet-600 dark:stroke-violet-300"
                strokeWidth={2}
                markerEnd="url(#gh-arrow)"
              />
              {e.label ? (
                <text
                  x={(sx + ex) / 2 + 4}
                  y={((same ? a.y + NODE_H / 2 : y1) + (same ? b.y + NODE_H / 2 : y2)) / 2 - 3}
                  fontSize={11}
                  className="fill-neutral-700 dark:fill-neutral-200"
                >
                  {e.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {flow.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const lines = wrapLabel(n.label);
          return (
            <g key={n.id}>
              <rect
                x={p.x}
                y={p.y}
                width={NODE_W}
                height={NODE_H}
                rx={12}
                className="fill-violet-100 stroke-violet-600 dark:fill-violet-900 dark:stroke-violet-300"
                strokeWidth={1.5}
              />
              <text
                x={p.x + NODE_W / 2}
                y={p.y + NODE_H / 2 - (lines.length - 1) * 7 + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                className="fill-neutral-900 dark:fill-white"
              >
                {lines.map((l, i) => (
                  <tspan key={i} x={p.x + NODE_W / 2} dy={i === 0 ? 0 : 14}>
                    {l}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-[var(--muted)]">
        Diagram drawn only from relationships stated in your material.
      </figcaption>
    </figure>
  );
}
