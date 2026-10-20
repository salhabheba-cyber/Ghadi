import { decodeEntities } from "./html-extract";

/**
 * YouTube transcript support (best effort).
 *
 * Ghadi only reads caption tracks that YouTube itself exposes publicly for a video. It does not
 * download audio or video, does not transcribe speech, and does not bypass access controls. Videos
 * without accessible captions (private, age-gated, region-locked, captions disabled) are reported as
 * unsupported. YouTube's page format is not a public API and can change without notice.
 */

export const YOUTUBE_HOSTS = ["youtube.com", "youtu.be"] as const;

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeUrl(input: string): boolean {
  try {
    const host = new URL(input).hostname.toLowerCase();
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

export function parseYouTubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = m?.[1] ?? null;
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

/** Finds `marker` in the page and returns the JSON object that follows it, using string-aware brace matching. */
export function extractJsonObjectAfter(html: string, marker: string): unknown | null {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf("{", at + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length && i - start < 3_000_000; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  auto: boolean;
  name: string;
}

interface PlayerResponseShape {
  videoDetails?: { title?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: {
        baseUrl?: string;
        languageCode?: string;
        kind?: string;
        name?: { simpleText?: string };
      }[];
    };
  };
}

export function readPlayerResponse(html: string): { title: string | null; tracks: CaptionTrack[] } {
  const pr = extractJsonObjectAfter(html, "ytInitialPlayerResponse") as PlayerResponseShape | null;
  const title = pr?.videoDetails?.title?.trim() || null;
  const raw = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const tracks: CaptionTrack[] = [];
  for (const t of raw) {
    if (typeof t.baseUrl !== "string" || typeof t.languageCode !== "string") continue;
    tracks.push({
      baseUrl: t.baseUrl,
      languageCode: t.languageCode,
      auto: t.kind === "asr",
      name: t.name?.simpleText ?? t.languageCode,
    });
  }
  return { title, tracks };
}

/** Prefers a human-made track in the requested language, then auto-generated, then anything. */
export function pickCaptionTrack(tracks: CaptionTrack[], preferred = "en"): CaptionTrack | null {
  const lang = preferred.toLowerCase();
  const matches = (t: CaptionTrack) =>
    t.languageCode.toLowerCase() === lang || t.languageCode.toLowerCase().startsWith(`${lang}-`);
  return (
    tracks.find((t) => matches(t) && !t.auto) ??
    tracks.find((t) => matches(t)) ??
    tracks.find((t) => !t.auto) ??
    tracks[0] ??
    null
  );
}

/** Parses a transcript response in json3 or XML timedtext format into plain text. */
export function parseTranscript(body: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as { events?: { segs?: { utf8?: string }[] }[] };
      const lines = (data.events ?? [])
        .map((e) => (e.segs ?? []).map((s) => s.utf8 ?? "").join(""))
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      return joinTranscriptLines(lines);
    } catch {
      return "";
    }
  }
  const lines = [...trimmed.matchAll(/<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/gi)]
    .map((m) =>
      decodeEntities(decodeEntities((m[1] ?? "").replace(/<[^>]+>/g, "")))
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  return joinTranscriptLines(lines);
}

function joinTranscriptLines(lines: string[]): string {
  const paragraphs: string[] = [];
  let buf: string[] = [];
  let chars = 0;
  for (const line of lines) {
    buf.push(line);
    chars += line.length;
    if (chars > 400 && /[.!?؟]$/.test(line)) {
      paragraphs.push(buf.join(" "));
      buf = [];
      chars = 0;
    }
  }
  if (buf.length) paragraphs.push(buf.join(" "));
  return paragraphs.join("\n\n");
}
