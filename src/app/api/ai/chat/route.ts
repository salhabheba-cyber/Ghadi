/**
 * POST /api/ai/chat
 *
 * Streaming ChatGPT-style endpoint powered by the admin OpenAI key.
 * Accepts a message history and streams back text tokens as Server-Sent Events.
 *
 * Body: { messages: [{role, content}][], context?: string }
 * Response: text/event-stream  data: <chunk>\n\n  …  data: [DONE]\n\n
 */

import { z } from "zod";
import { NextRequest } from "next/server";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { sameOriginOrNull, readJsonLimited } from "@/lib/server/http";
import { getOpenAIClient, getModel, isOpenAIConfigured } from "@/lib/ai/openai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 40_000;

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(8000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(60),
  /** Optional study context injected as a system message (document excerpt, quiz question, etc.) */
  context: z.string().max(8000).optional(),
});

const GHADI_SYSTEM = `You are Ghadi, a friendly and encouraging AI study assistant.
You help students learn by explaining concepts clearly, generating quizzes, checking answers,
and making studying engaging. Be concise, accurate, and supportive.
When correcting answers, explain why gently and clearly.
Respond in the same language the student uses (English, French, or Arabic).`;

export async function POST(req: NextRequest) {
  if (!sameOriginOrNull(req)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!isOpenAIConfigured()) {
    return new Response(
      JSON.stringify({ error: "not-configured", message: "AI is not configured on this server." }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  }

  const limited = rateLimit(`chat:${clientKey(req)}`, 20, 60_000);
  if (!limited.ok) {
    return new Response(
      JSON.stringify({ error: "rate-limited", message: "Too many requests. Please wait." }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  const read = await readJsonLimited(req, MAX_BODY_BYTES);
  if (!read.ok) {
    return new Response(JSON.stringify({ error: "bad-request", message: read.message }), {
      status: read.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = bodySchema.safeParse(read.data);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "bad-request", message: "Invalid message format." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { messages, context } = parsed.data;

  const systemMessages = [{ role: "system" as const, content: GHADI_SYSTEM }];
  if (context) {
    systemMessages.push({
      role: "system" as const,
      content: `Study context:\n${context}`,
    });
  }

  const openai = getOpenAIClient();
  const model = getModel();

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const completion = await openai.chat.completions.create({
          model,
          stream: true,
          temperature: 0.7,
          max_tokens: 1024,
          messages: [...systemMessages, ...messages],
        });

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(delta)}\n\n`));
          }
          if (chunk.choices[0]?.finish_reason) {
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
