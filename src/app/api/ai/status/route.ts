import { jsonOk } from "@/lib/server/http";
import { readHostedConfig } from "@/lib/server/hosted-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reports whether the optional hosted AI route is configured, which provider and model, and that it
 * is cloud-based. Never returns a secret or the base URL.
 */
export function GET() {
  const config = readHostedConfig();
  return jsonOk(
    config
      ? {
          configured: true,
          provider: config.provider,
          model: config.model,
          visionModel: config.visionModel,
          cloud: true,
        }
      : { configured: false },
  );
}
