import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { isJsonRequest, jsonError, jsonOk, sameOriginOrNull } from "@/lib/server/http";
import { completeText, toAiError } from "@/lib/ai/openai-server";
import { readHostedConfig } from "@/lib/server/hosted-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/test — makes one tiny real request to the configured provider so Settings can show
 * whether it truly works. Sends only a fixed word, never user content, so it needs no consent.
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
    return jsonOk({
      ok: true,
      provider: config.provider,
      model: config.model,
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    const failure = toAiError(error);
    return jsonError(failure.status, failure.code, failure.message);
  }
}
