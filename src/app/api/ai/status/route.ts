import { jsonOk } from "@/lib/server/http";
import { readHostedConfig } from "@/lib/server/hosted-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports whether the optional hosted AI route is configured. Never returns any secret. */
export function GET() {
  const config = readHostedConfig();
  return jsonOk(config ? { configured: true, model: config.model } : { configured: false });
}
