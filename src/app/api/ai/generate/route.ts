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
import { completeText, toAiError } from "@/lib/ai/openai-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 120_000;
const UPSTREAM_TIMEOUT_MS = 170_000;

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

  const limited = rateLimit(`ai:${clientKey(request)}`, 40, 60_000);
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

  try {
    const { text, model } = await completeText(
      {
        system: prompt.system,
        user: prompt.user,
        json: true,
        temperature: 0.2,
        maxTokens: task === "guide-section" ? 12_000 : 4096,
      },
      { cfg: config, timeoutMs: UPSTREAM_TIMEOUT_MS },
    );
    // Validate on the server too, so malformed model output never leaves this route as "success".
    try {
      parseTaskOutput(task, text, model);
    } catch (error) {
      const message =
        error instanceof ProviderError
          ? error.message
          : "The model's answer could not be validated.";
      return jsonError(502, "invalid-output", message);
    }
    return jsonOk({ text });
  } catch (error) {
    const failure = toAiError(error);
    return jsonError(failure.status, failure.code, failure.message);
  }
}
