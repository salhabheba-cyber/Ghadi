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
import { buildPrompt, parseTaskOutput, taskNameSchema, taskPayloadSchema } from "@/lib/ai/tasks";
import { ProviderError } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 120_000;
const UPSTREAM_TIMEOUT_MS = 120_000;

const bodySchema = z.object({
  task: taskNameSchema,
  payload: taskPayloadSchema,
  /** The user must have explicitly agreed to send their content to the hosted provider. */
  consent: z.literal(true),
});

/**
 * Optional hosted AI. The API key lives only in server environment variables. The server builds the
 * prompt itself from a fixed set of study tasks (so this is not a general-purpose LLM proxy), caps
 * input size, rate limits, validates the model's JSON output with Zod, and never logs content or keys.
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
      "Hosted AI is not configured on this server. Ghadi works fully offline without it.",
    );
  }

  const limited = rateLimit(`ai:${clientKey(request)}`, 10, 60_000);
  if (!limited.ok) {
    return jsonError(
      429,
      "rate-limited",
      "Too many AI requests. Please wait a moment and try again.",
      {
        "Retry-After": String(limited.retryAfterSec),
      },
    );
  }

  const read = await readJsonLimited(request, MAX_BODY_BYTES);
  if (!read.ok) return jsonError(read.status, "bad-request", read.message);

  const parsed = bodySchema.safeParse(read.data);
  if (!parsed.success) {
    return jsonError(
      400,
      "consent-required",
      "A valid task and explicit consent to send content to the hosted provider are required.",
    );
  }
  const { task, payload } = parsed.data;
  const prompt = buildPrompt(task, payload);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
    });

    if (upstream.status === 429) {
      return jsonError(
        429,
        "rate-limited",
        "The hosted AI provider is rate limiting requests. Try again later.",
      );
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return jsonError(
        502,
        "upstream-auth",
        "The hosted AI provider rejected this server's credentials. Check the server configuration.",
      );
    }
    if (!upstream.ok) {
      return jsonError(
        502,
        "upstream-error",
        `The hosted AI provider returned HTTP ${upstream.status}.`,
      );
    }
    const data = (await upstream.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.length === 0) {
      return jsonError(
        502,
        "bad-response",
        "The hosted AI provider returned an empty or malformed answer.",
      );
    }
    // Validate on the server too, so malformed model output never leaves this route as "success".
    try {
      parseTaskOutput(task, text, config.model);
    } catch (error) {
      const message =
        error instanceof ProviderError
          ? error.message
          : "The model's answer could not be validated.";
      return jsonError(502, "invalid-output", message);
    }
    return jsonOk({ text });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return jsonError(504, "timeout", "The hosted AI provider took too long to answer.");
    }
    return jsonError(502, "unreachable", "Could not reach the hosted AI provider.");
  } finally {
    clearTimeout(timer);
  }
}
