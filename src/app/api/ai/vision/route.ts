import { z } from "zod";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import {
  isJsonRequest,
  jsonError,
  jsonOk,
  readJsonLimited,
  sameOriginOrNull,
} from "@/lib/server/http";
import { readHostedConfig } from "@/lib/server/hosted-config";
import { completeText, toAiError } from "@/lib/ai/openai-server";
import { extractJson } from "@/lib/ai/tasks";
import {
  DATA_URL_RE,
  MAX_VISION_DATA_URL_CHARS,
  MAX_VISION_IMAGES_PER_REQUEST,
  VISION_SYSTEM,
  buildVisionPrompt,
  transcriptionSchema,
} from "@/lib/ai/vision";
import { formatZodError } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 9_000_000;
const UPSTREAM_TIMEOUT_MS = 150_000;

const bodySchema = z.object({
  images: z
    .array(
      z.object({
        dataUrl: z.string().max(MAX_VISION_DATA_URL_CHARS).regex(DATA_URL_RE),
        /** The page number this image is, so references stay correct across batches. */
        page: z.number().int().min(1).max(10_000),
      }),
    )
    .min(1)
    .max(MAX_VISION_IMAGES_PER_REQUEST),
  /** The user must have agreed to send their photos/pages to OpenAI. */
  consent: z.literal(true),
});

/**
 * POST /api/ai/vision — faithful transcription of photos/scanned pages by the configured OpenAI
 * vision model. The key stays on the server; images arrive as data URLs from the user's own device
 * (never fetched from a URL), are size-capped, and are never stored or logged. The model's JSON is
 * validated before it is returned, and page numbers are checked so a batch cannot be mislabelled.
 */
export async function POST(request: Request) {
  if (!sameOriginOrNull(request))
    return jsonError(403, "forbidden", "Cross-site requests are not allowed.");
  if (!isJsonRequest(request))
    return jsonError(415, "unsupported-media-type", "Send the request as application/json.");

  const config = readHostedConfig();
  if (!config) {
    return jsonError(
      501,
      "not-configured",
      "OpenAI is not set up on this server. The server owner must set OPENAI_API_KEY.",
    );
  }

  const limited = rateLimit(`ai-vision:${clientKey(request)}`, 20, 60_000);
  if (!limited.ok) {
    return jsonError(429, "rate-limited", "Too many image requests. Please wait a moment.", {
      "Retry-After": String(limited.retryAfterSec),
    });
  }

  const read = await readJsonLimited(request, MAX_BODY_BYTES);
  if (!read.ok) return jsonError(read.status, "bad-request", read.message);
  const parsed = bodySchema.safeParse(read.data);
  if (!parsed.success) {
    const consentMissing = !(
      typeof read.data === "object" &&
      read.data !== null &&
      (read.data as { consent?: unknown }).consent === true
    );
    return jsonError(
      400,
      consentMissing ? "consent-required" : "bad-request",
      consentMissing
        ? "Explicit consent to send images to OpenAI is required."
        : `The images were not accepted (${formatZodError(parsed.error, 2)}).`,
    );
  }

  const pages = parsed.data.images.map((i) => i.page);
  try {
    const { text, model } = await completeText(
      {
        system: VISION_SYSTEM,
        user: buildVisionPrompt(pages),
        images: parsed.data.images.map((i) => ({ dataUrl: i.dataUrl })),
        json: true,
        maxTokens: 16_000,
      },
      { cfg: config, timeoutMs: UPSTREAM_TIMEOUT_MS, vision: true },
    );
    let json: unknown;
    try {
      json = extractJson(text);
    } catch {
      return jsonError(502, "invalid-output", "The model's reading of the image was not valid.");
    }
    const t = transcriptionSchema.safeParse(json);
    if (!t.success) {
      return jsonError(
        502,
        "invalid-output",
        `The model's reading of the image did not match the expected format (${formatZodError(t.error, 2)}).`,
      );
    }
    // The model must report exactly the pages we sent; otherwise references would be wrong.
    const returned = t.data.pages.map((p) => p.page).sort((a, b) => a - b);
    const expected = [...pages].sort((a, b) => a - b);
    if (returned.length !== expected.length || returned.some((p, i) => p !== expected[i])) {
      return jsonError(502, "invalid-output", "The model returned the wrong pages. Try again.");
    }
    return jsonOk({ transcription: t.data, model });
  } catch (error) {
    const failure = toAiError(error);
    return jsonError(failure.status, failure.code, failure.message);
  }
}
