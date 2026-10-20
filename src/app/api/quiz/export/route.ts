/**
 * POST /api/quiz/export
 *
 * Exports a quiz as a downloadable Word (.docx) file.
 *
 * Body: {
 *   title: string
 *   subject?: string
 *   questions: ExportQuestion[]
 *   includeAnswers?: boolean
 *   format: "docx"
 * }
 *
 * Returns: application/vnd.openxmlformats-officedocument.wordprocessingml.document
 */

import { z } from "zod";
import { sameOriginOrNull, readJsonLimited, jsonError } from "@/lib/server/http";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { buildQuizDocx } from "@/lib/export/quiz-docx";
import type { ExportQuestion } from "@/lib/export/quiz-docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 200_000; // 200KB — generous for a big quiz

const questionSchema = z.object({
  type: z.enum(["mcq", "tf", "short", "fill"]),
  prompt: z.string().min(1).max(2000),
  options: z.array(z.string().max(500)).max(8).optional(),
  correct: z.array(z.string().max(500)).min(1),
  explanation: z.string().max(2000).optional(),
});

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  subject: z.string().max(200).optional(),
  questions: z.array(questionSchema).min(1).max(100),
  includeAnswers: z.boolean().default(false),
  format: z.enum(["docx"]).default("docx"),
});

export async function POST(req: Request) {
  if (!sameOriginOrNull(req)) return jsonError(403, "forbidden", "Cross-site requests not allowed.");

  const limited = rateLimit(`export:${clientKey(req)}`, 10, 60_000);
  if (!limited.ok) {
    return jsonError(429, "rate-limited", "Too many export requests.", {
      "Retry-After": String(limited.retryAfterSec),
    });
  }

  const read = await readJsonLimited(req, MAX_BODY_BYTES);
  if (!read.ok) return jsonError(read.status, "bad-request", read.message);

  const parsed = bodySchema.safeParse(read.data);
  if (!parsed.success) {
    return jsonError(400, "bad-request", "Invalid request body: " + parsed.error.message);
  }

  const { title, subject, questions, includeAnswers } = parsed.data;

  try {
    const buffer = await buildQuizDocx({
      title,
      subject,
      questions: questions as ExportQuestion[],
      includeAnswers,
      generatedAt: new Date().toLocaleDateString("en-GB"),
    });

    const safeTitle = title.replace(/[^a-z0-9]/gi, "_").slice(0, 60) || "quiz";
    const filename = `${safeTitle}_${includeAnswers ? "with_answers" : "student"}.docx`;

    // Convert Node Buffer to ArrayBuffer for the Web Response API
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    return new Response(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonError(500, "export-error", `Failed to generate document: ${msg}`);
  }
}
