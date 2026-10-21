import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { isJsonRequest, jsonError, jsonOk, sameOriginOrNull } from "@/lib/server/http";
import { completeText, toAiError } from "@/lib/ai/openai-server";
import { readHostedConfig } from "@/lib/server/hosted-config";
import { SELF_TEST_IMAGE_DATA_URL } from "@/lib/ai/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/test — makes two tiny real requests (text, then a fixed test image) so Settings can show
 * whether text and vision truly work. Sends only fixed content, never user content, so it needs no consent.
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
      "No AI provider is configured on this server. Set OPENAI_API_KEY (see .env.example).",
    );
  }

  const limited = rateLimit(`ai-test:${clientKey(request)}`, 5, 60_000);
  if (!limited.ok) {
    return jsonError(429, "rate-limited", "Too many connection tests. Wait a moment.", {
      "Retry-After": String(limited.retryAfterSec),
    });
  }

  const started = Date.now();
  try {
    await completeText(
      { system: "Reply with the single word OK.", user: "ping", maxTokens: 256 },
      { cfg: config, timeoutMs: 20_000 },
    );
    const textMs = Date.now() - started;
    // Prove the vision model can really read an image: the fixed test image shows the number 42.
    let vision: { ok: boolean; model: string; message?: string };
    try {
      const v = await completeText(
        {
          system: "Reply with only the number shown in the image.",
          user: "What number is in the image?",
          images: [{ dataUrl: SELF_TEST_IMAGE_DATA_URL }],
          maxTokens: 512,
        },
        { cfg: config, timeoutMs: 30_000, vision: true },
      );
      vision = /42/.test(v.text)
        ? { ok: true, model: v.model }
        : {
            ok: false,
            model: v.model,
            message: "The vision model answered but did not read the test image correctly.",
          };
    } catch (error) {
      vision = { ok: false, model: config.visionModel, message: toAiError(error).message };
    }
    return jsonOk({
      ok: true,
      provider: config.provider,
      model: config.model,
      latencyMs: textMs,
      vision,
    });
  } catch (error) {
    const failure = toAiError(error);
    return jsonError(failure.status, failure.code, failure.message);
  }
}
