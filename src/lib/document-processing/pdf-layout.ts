/**
 * Position-aware text reconstruction for PDFs that have a real text layer.
 *
 * pdf.js returns text fragments with coordinates. Joining them in stream order (what a naive reader
 * does) merges columns, glues questions together and detaches exponents. This module rebuilds the
 * reading order from the geometry: lines, a two-column split when a clear gutter exists, paragraph
 * breaks, and superscripts/subscripts. It is pure (no pdf.js import) so it can be tested directly.
 */

export interface PdfTextItem {
  str: string;
  /** PDF transform matrix: [a, b, c, d, e, f]; e/f are the x/y of the baseline start. */
  transform: number[];
  width: number;
  height: number;
}

interface Piece {
  text: string;
  x0: number;
  x1: number;
  y: number;
  size: number;
}

interface Line {
  pieces: Piece[];
  y: number;
  size: number;
  x0: number;
  x1: number;
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

function toPieces(items: PdfTextItem[]): Piece[] {
  const pieces: Piece[] = [];
  for (const it of items) {
    if (typeof it.str !== "string" || it.str === "" || !Array.isArray(it.transform)) continue;
    const x0 = it.transform[4] ?? 0;
    const y = it.transform[5] ?? 0;
    const size = Math.abs(it.transform[3] ?? 0) || it.height || 10;
    const width = it.width > 0 ? it.width : it.str.length * size * 0.5;
    pieces.push({ text: it.str, x0, x1: x0 + width, y, size });
  }
  return pieces;
}

/** Groups fragments into lines by baseline, treating clearly smaller raised/lowered text as part of the line. */
function toLines(pieces: Piece[]): Line[] {
  const body = median(pieces.filter((p) => p.text.trim() !== "").map((p) => p.size)) || 10;
  const tolerance = body * 0.35;
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const lines: Line[] = [];
  const isSmall = (p: Piece) => p.size < body * 0.85;
  const add = (line: Line, p: Piece, small: boolean) => {
    line.pieces.push(p);
    if (!small && p.size >= line.size) {
      line.size = p.size;
      line.y = p.y;
    }
    line.x0 = Math.min(line.x0, p.x0);
    line.x1 = Math.max(line.x1, p.x1);
  };
  // Normal-size text first, so a raised exponent (which sorts above its base) finds its line.
  for (const p of sorted.filter((q) => !isSmall(q))) {
    let line = lines.find((l) => Math.abs(l.y - p.y) <= tolerance);
    if (!line) {
      line = { pieces: [], y: p.y, size: p.size, x0: p.x0, x1: p.x1 };
      lines.push(line);
    }
    add(line, p, false);
  }
  for (const p of sorted.filter(isSmall)) {
    // Exponent/subscript: smaller text within about one line height of a normal line, overlapping it in x.
    let line = lines.find((l) => {
      const dy = Math.abs(l.y - p.y);
      if (dy <= tolerance) return true;
      return dy <= body * 0.9 && p.x0 >= l.x0 - body && p.x0 <= l.x1 + body * 0.6;
    });
    if (!line) {
      line = { pieces: [], y: p.y, size: p.size, x0: p.x0, x1: p.x1 };
      lines.push(line);
    }
    add(line, p, true);
  }
  return lines.sort((a, b) => b.y - a.y);
}

function lineText(line: Line): string {
  const base = line.size;
  const ordered = [...line.pieces].sort((a, b) => a.x0 - b.x0);
  let out = "";
  let prevEnd = Number.NaN;
  let prevScript: "sup" | "sub" | null = null;
  for (const p of ordered) {
    const text = p.text;
    if (text.trim() === "") {
      if (out && !out.endsWith(" ")) out += " ";
      prevEnd = p.x1;
      continue;
    }
    const small = p.size < base * 0.85;
    const raised = small && p.y > line.y + base * 0.2;
    const lowered = small && p.y < line.y - base * 0.2;
    const script: "sup" | "sub" | null = raised ? "sup" : lowered ? "sub" : null;
    const gap = p.x0 - prevEnd;
    if (script) {
      // Attach to what it modifies without a space: x^2, H_2
      const mark = script === "sup" ? "^" : "_";
      const t = text.trim();
      out += t.length > 1 && !/^[-+−]?\d+$/.test(t) ? `${mark}(${t})` : `${mark}${t}`;
    } else {
      if (
        out &&
        !out.endsWith(" ") &&
        (prevScript !== null || Number.isNaN(gap) || gap > base * 0.18) &&
        !/^[,.;:)\]%]/.test(text) &&
        !/[(\[]$/.test(out)
      ) {
        out += " ";
      }
      out += text;
    }
    prevScript = script;
    prevEnd = Math.max(prevEnd || 0, p.x1);
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

/** Finds the x position of a vertical gutter that separates two text columns, if there clearly is one. */
function findGutter(lines: Line[], pageWidth: number): number | null {
  const textual = lines.filter((l) => lineText(l).length > 2);
  if (textual.length < 8 || pageWidth <= 0) return null;
  const buckets = 100;
  const counts = new Array<number>(buckets).fill(0);
  const x0 = Math.min(...textual.map((l) => l.x0));
  const span = Math.max(...textual.map((l) => l.x1)) - x0;
  if (span < pageWidth * 0.5) return null;
  for (const l of textual) {
    for (const p of l.pieces) {
      if (p.text.trim() === "") continue;
      const a = Math.max(0, Math.floor(((p.x0 - x0) / span) * buckets));
      const b = Math.min(buckets - 1, Math.floor(((p.x1 - x0) / span) * buckets));
      for (let i = a; i <= b; i++) counts[i] = (counts[i] ?? 0) + 1;
    }
  }
  const total = textual.length;
  let best: { start: number; end: number } | null = null;
  let start = -1;
  for (let i = 25; i <= 75; i++) {
    const empty = (counts[i] ?? 0) <= Math.max(1, total * 0.04);
    if (empty && start < 0) start = i;
    if ((!empty || i === 75) && start >= 0) {
      const end = empty && i === 75 ? i : i - 1;
      if (end - start >= 2 && (!best || end - start > best.end - best.start)) best = { start, end };
      start = -1;
    }
  }
  if (!best) return null;
  return x0 + ((best.start + best.end + 1) / 2 / buckets) * span;
}

function joinLines(lines: Line[], body: number): string[] {
  const out: string[] = [];
  let prevY: number | null = null;
  for (const line of lines) {
    const text = lineText(line);
    if (!text) continue;
    if (prevY !== null && prevY - line.y > body * 1.9 && out.length > 0 && out.at(-1) !== "") {
      out.push("");
    }
    const prev = out.at(-1);
    // Rejoin a word split by a hyphen at the line end ("photo-" + "synthesis"), but never a minus sign.
    if (prev && /[a-zà-ÿ]{2}-$/.test(prev) && /^[a-zà-ÿ]/.test(text)) {
      out[out.length - 1] = prev.slice(0, -1) + text;
    } else {
      out.push(text);
    }
    prevY = line.y;
  }
  return out;
}

/** Rebuilds the reading-order text of one PDF page. */
export function layoutPageText(items: PdfTextItem[], pageWidth: number): string {
  const pieces = toPieces(items);
  if (pieces.length === 0) return "";
  const lines = toLines(pieces);
  const body = median(lines.map((l) => l.size)) || 10;
  const gutter = findGutter(lines, pageWidth);
  if (gutter === null) return joinLines(lines, body).join("\n").trim();

  // Two columns: read each run of two-column lines left column first, then right; full-width lines
  // (titles, instructions) end the run and stay in place.
  const out: string[] = [];
  let left: Line[] = [];
  let right: Line[] = [];
  const flush = () => {
    if (left.length || right.length) {
      out.push(...joinLines(left, body));
      if (left.length && right.length) out.push("");
      out.push(...joinLines(right, body));
    }
    left = [];
    right = [];
  };
  for (const line of lines) {
    const straddles = line.pieces.some((p) => p.x0 < gutter - 2 && p.x1 > gutter + 2);
    if (straddles) {
      flush();
      out.push(...joinLines([line], body));
      continue;
    }
    const l = line.pieces.filter((p) => p.x1 <= gutter + 2);
    const r = line.pieces.filter((p) => p.x0 >= gutter - 2);
    if (l.length)
      left.push({
        ...line,
        pieces: l,
        x0: Math.min(...l.map((p) => p.x0)),
        x1: Math.max(...l.map((p) => p.x1)),
      });
    if (r.length)
      right.push({
        ...line,
        pieces: r,
        x0: Math.min(...r.map((p) => p.x0)),
        x1: Math.max(...r.map((p) => p.x1)),
      });
  }
  flush();
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
