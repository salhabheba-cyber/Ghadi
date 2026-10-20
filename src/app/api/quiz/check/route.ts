/**
 * POST /api/quiz/check
 *
 * Ghadi checks a fill-in-the-blank or short-answer response using AI.
 * Returns: { correct: boolean, feedback: string, correctAnswer: string }
 */

import { z } from "zod";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { sameOriginOrNull, readJsonLimited, jsonError, jsonOk } from "@/lib/server/http";
import { getOpenAIClient, getModel, isOpenAIConfigured } from "@/lib/ai/openai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 10_000;

const bodySchema = z.object({
  question: z.string().min(1).max(1000),
  correctAnswer: z.string().min(1).max(500),
  userAnswer: z.string().min(0).max(500),
  language: z.enum(["en", "fr", "ar"]).default("en"),
  sourceExcerpt: z.string().max(1000).optional(),
});

const LANG_INSTRUCTIONS: Record<string, string> = {
  en: "Respond in English.",
  fr: "Réponds en français.",
  ar: "أجب باللغة العربية الفصحى.",
};

export async function POST(req: Request) {
  if (!sameOriginOrNull(req)) return jsonError(403, "forbidden", "Cross-site requests not allowed.");

  if (!isOpenAIConfigured()) {
    return jsonError(501, "not-configured", "AI is not configured on this server.");
  }

  const limited = rateLimit(`check:${clientKey(req)}`, 30, 60_000);
  if (!limited.ok) {
    return jsonError(429, "rate-limited", "Too many requests.", {
      "Retry-After": String(limited.retryAfterSec),
    });
  }

  const read = await readJsonLimited(req, MAX_BODY_BYTES);
  if (!read.ok) return jsonError(read.status, "bad-request", read.message);

  const parsed = bodySchema.safeParse(read.data);
  if (!parsed.success) {
    return jsonError(400, "bad-request", "Invalid request body.");
  }

  const { question, correctAnswer, userAnswer, language, sourceExcerpt } = parsed.data;
  const langLine = LANG_INSTRUCTIONS[language] ?? LANG_INSTRUCTIONS.en;

  const systemPrompt = `You are Ghadi, a kind and encouraging study assistant.
You check student answers for quiz questions. Be generous: accept synonyms,
paraphrases, and minor spelling mistakes as correct unless precision matters for the topic.
${langLine}
Respond ONLY with a JSON object (no markdown):
{"correct": boolean, "feedback": string, "correctAnswer": string}
- "correct": true if the student's answer is essentially right
- "feedback": 1-2 sentences explaining the result warmly; if wrong, show the right answer and why
- "correctAnswer": the ideal answer phrasing`;

  const userContent = [
    `Question: ${question}`,
    `Expected answer: ${correctAnswer}`,
    `Student's answer: ${userAnswer || "(no answer given)"}`,
    sourceExcerpt ? `Source context: ${sourceExcerpt}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const openai = getOpenAIClient();
    const model = getModel();

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let result: { correct?: boolean; feedback?: string; correctAnswer?: string };
    try {
      result = JSON.parse(raw);
    } catch {
      result = {};
    }

    return jsonOk({
      correct: result.correct ?? false,
      feedback: result.feedback ?? "Could not evaluate answer.",
      correctAnswer: result.correctAnswer ?? correctAnswer,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonError(502, "upstream-error", `AI check failed: ${msg}`);
  }
}
