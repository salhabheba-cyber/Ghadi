/**
 * Extracts readable article text from untrusted HTML. The output is plain text only: it is never
 * rendered as HTML, so nothing here needs to be "sanitised" for markup, but scripts/styles/navigation
 * are dropped so they do not pollute study material.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  times: "×",
  divide: "÷",
  plusmn: "±",
  middot: "·",
  bull: "•",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const cp = parseInt(body.slice(2), 16);
      return isValidCodePoint(cp) ? String.fromCodePoint(cp) : "";
    }
    if (body.startsWith("#")) {
      const cp = parseInt(body.slice(1), 10);
      return isValidCodePoint(cp) ? String.fromCodePoint(cp) : "";
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function isValidCodePoint(cp: number): boolean {
  return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff);
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " "))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m?.[1] ? stripTags(m[1]) : null;
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  if (!tag) return null;
  const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return content ? decodeEntities(content).trim() : null;
}

export interface ExtractedArticle {
  title: string;
  text: string;
}

const MAX_OUTPUT_CHARS = 1_500_000;

export function extractArticle(html: string): ExtractedArticle {
  let cleaned = html.replace(/<!--[\s\S]*?-->/g, " ");
  cleaned = cleaned.replace(
    /<(script|style|noscript|template|svg|iframe|nav|footer|aside|form|button|select|dialog|canvas)\b[\s\S]*?<\/\1\s*>/gi,
    " ",
  );

  const title =
    metaContent(cleaned, "og:title") ??
    firstMatch(cleaned, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    firstMatch(cleaned, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
    "Imported web page";

  // Prefer the largest <article>, then <main>, then <body>.
  const articles = [...cleaned.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)].map(
    (m) => m[1] ?? "",
  );
  const scope =
    articles.sort((a, b) => b.length - a.length)[0] ??
    /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(cleaned)?.[1] ??
    /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(cleaned)?.[1] ??
    cleaned;

  const lines: string[] = [];
  let last = "";
  for (const m of scope.matchAll(
    /<(h[1-6]|p|li|blockquote|pre|dt|dd|figcaption)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi,
  )) {
    const tag = (m[1] ?? "").toLowerCase();
    const text = stripTags(m[2] ?? "");
    if (!text || text === last) continue;
    if (tag.startsWith("h")) {
      if (text.length >= 3) lines.push("", `## ${text}`, "");
    } else if (tag === "li") {
      if (text.length >= 10) lines.push(`- ${text}`);
    } else if (text.length >= 25) {
      lines.push(text, "");
    }
    last = text;
  }

  let text = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length < 200) {
    text = stripTags(scope).replace(/\n{3,}/g, "\n\n");
  }
  return { title: truncateTitle(title), text: text.slice(0, MAX_OUTPUT_CHARS) };
}

function truncateTitle(t: string): string {
  const clean = t.replace(/\s+/g, " ").trim();
  return clean.length > 200 ? `${clean.slice(0, 199)}…` : clean || "Imported web page";
}

export function decodeBody(body: Buffer, charset: string | null, html?: boolean): string {
  let label = charset ?? "utf-8";
  if (!charset && html) {
    const sniff = body.subarray(0, 2048).toString("latin1");
    const m = /<meta[^>]+charset=["']?\s*([\w-]+)/i.exec(sniff);
    if (m?.[1]) label = m[1].toLowerCase();
  }
  try {
    return new TextDecoder(label, { fatal: false }).decode(body);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(body);
  }
}

/**
 * Converts already-extracted HTML (e.g. from a DOCX conversion) into study text: headings become
 * markdown headings, list items become bullets, table cells become lines.
 */
export function htmlToStudyText(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const lines: string[] = [];
  for (const m of cleaned.matchAll(
    /<(h[1-6]|p|li|blockquote|pre|td|th|dt|dd)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi,
  )) {
    const tag = (m[1] ?? "").toLowerCase();
    // Skip wrappers that contain nested blocks; their children are matched separately.
    const inner = m[2] ?? "";
    if (/<(p|li|h[1-6]|td|th)\b/i.test(inner)) continue;
    const text = stripTags(inner);
    if (!text) continue;
    if (tag.startsWith("h")) lines.push("", `## ${text}`, "");
    else if (tag === "li") lines.push(`- ${text}`);
    else if (tag === "td" || tag === "th") lines.push(text);
    else lines.push(text, "");
  }
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
