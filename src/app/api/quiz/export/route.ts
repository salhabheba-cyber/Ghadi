/**
 * POST /api/quiz/export
 *
 * Builds a quiz file (PDF, Word or Excel) on explicit request. Nothing is generated or downloaded
 * until the user clicks Download in the export dialog.
 *
 * `content` decides what leaves the server:
 *   - "quiz"          questions only: correct answers/explanations are never passed to a builder
 *   - "quiz-and-key"  questions followed by a separate answer key (own page / own sheet)
 *   - "key"           answer key only
 */

import { z } from "zod";
import { sameOriginOrNull, readJsonLimited, jsonError } from "@/lib/server/http";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { buildQuizDocx } from "@/lib/export/quiz-docx";
import { buildQuizXlsx } from "@/lib/export/quiz-xlsx";
import { buildQuizPdf } from "@/lib/export/quiz-pdf";
import { ExportError, buildExportDoc, languageFor, type ExportFormat } from "@/lib/export/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 400_000;

const questionSchema = z.object({
  type: z.enum(["mcq", "tf", "short", "fill"]),
  prompt: z.string().min(1).max(2000),
  options: z.array(z.string().max(500)).max(8).optional(),
  correct: z.array(z.string().max(500)).min(1),
  explanation: z.string().max(2000).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(200).optional(),
  questions: z.array(questionSchema).min(1).max(100),
  format: z.enum(["pdf", "docx", "xlsx"]),
  content: z.enum(["quiz", "quiz-and-key", "key"]).default("quiz"),
  includeExplanations: z.boolean().default(false),
  studentFields: z.boolean().default(false),
  studentName: z.string().trim().max(120).optional(),
  date: z.string().trim().max(40).optional(),
  language: z.string().max(60).optional(),
});

const TYPES: Record<ExportFormat, { mime: string; ext: string }> = {
  pdf: { mime: "application/pdf", ext: "pdf" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
  },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
};

export async function POST(req: Request) {
  if (!sameOriginOrNull(req))
    return jsonError(403, "forbidden", "Cross-site requests not allowed.");

  const limited = rateLimit(`export:${clientKey(req)}`, 20, 60_000);
  if (!limited.ok) {
    return jsonError(
      429,
      "rate-limited",
      "Too many export requests. Wait a moment and try again.",
      {
        "Retry-After": String(limited.retryAfterSec),
      },
    );
  }

  const read = await readJsonLimited(req, MAX_BODY_BYTES);
  if (!read.ok) return jsonError(read.status, "bad-request", read.message);
  const parsed = bodySchema.safeParse(read.data);
  if (!parsed.success) return jsonError(400, "bad-request", "Invalid export request.");
  const b = parsed.data;

  try {
    const sample = b.questions.map((q) => q.prompt).join(" ");
    const doc = buildExportDoc({
      title: b.title,
      subtitle: b.subtitle,
      questions: b.questions.map((q) => ({ ...q, correct: q.correct })),
      content: b.content,
      includeExplanations: b.includeExplanations,
      studentFields: b.studentFields,
      studentName: b.studentName,
      date: b.date,
      language: languageFor(b.language, sample + b.title),
      generatedAt: new Date().toISOString(),
    });
    const buffer =
      b.format === "pdf"
        ? await buildQuizPdf(doc)
        : b.format === "xlsx"
          ? await buildQuizXlsx(doc)
          : await buildQuizDocx(doc);
    if (buffer.byteLength < 500) throw new ExportError("empty", "The generated file was empty.");

    const slug =
      b.title
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 50) || "quiz";
    const suffix =
      b.content === "key" ? "answer_key" : b.content === "quiz-and-key" ? "with_key" : "quiz";
    const t = TYPES[b.format];
    const body = new Uint8Array(buffer);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": t.mime,
        "Content-Disposition": `attachment; filename="${slug}_${suffix}.${t.ext}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof ExportError) {
      return jsonError(
        err.code === "unsupported-script" ? 422 : 400,
        "export-unsupported",
        err.message,
      );
    }
    return jsonError(
      500,
      "export-error",
      "Ghadi could not generate this file. Try another format.",
    );
  }
}
