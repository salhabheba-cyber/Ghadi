// @vitest-environment node
import { describe, expect, it } from "vitest";
import { completeText } from "@/lib/ai/openai-server";
import { readHostedConfig } from "@/lib/server/hosted-config";
import { SELF_TEST_IMAGE_DATA_URL } from "@/lib/ai/vision";

/**
 * A REAL OpenAI request. It runs only when OPENAI_API_KEY is present in the environment (for example
 * `OPENAI_API_KEY=... npm test`), makes two tiny paid requests, and is skipped otherwise, so CI
 * without credentials never claims OpenAI works. The key is read from the environment only.
 */
const cfg = readHostedConfig();

describe.skipIf(!cfg)("real OpenAI smoke test (needs OPENAI_API_KEY)", () => {
  it("answers a text request with the configured text model", async () => {
    const out = await completeText(
      { system: "Reply with the single word OK.", user: "ping", maxTokens: 256 },
      { cfg: cfg!, timeoutMs: 30_000 },
    );
    expect(out.text.length).toBeGreaterThan(0);
  }, 40_000);

  it("reads the test image with the configured vision model", async () => {
    const out = await completeText(
      {
        system: "Reply with only the number shown in the image.",
        user: "What number is in the image?",
        images: [{ dataUrl: SELF_TEST_IMAGE_DATA_URL }],
        maxTokens: 512,
      },
      { cfg: cfg!, timeoutMs: 60_000, vision: true },
    );
    expect(out.text).toMatch(/42/);
  }, 70_000);
});
