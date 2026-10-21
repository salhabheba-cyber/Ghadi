import ExcelJS from "exceljs";
import { LABELS, letter, type ExportDoc } from "./types";

const BRAND = "FF6D28D9";
const LIGHT = "FFF3EFFE";

function header(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  row.height = 26;
}

/**
 * Structured workbook. A quiz-only export has exactly one sheet ("Questions") with no answer
 * column; the key lives in its own sheet only when it was requested.
 */
export async function buildQuizXlsx(doc: ExportDoc): Promise<Buffer> {
  const L = LABELS[doc.language];
  const rtl = doc.language === "ar";
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ghadi";
  wb.title = doc.title;
  wb.created = new Date(doc.generatedAt);

  const view = { rightToLeft: rtl } as const;
  const maxOpts = doc.items ? Math.max(0, ...doc.items.map((q) => q.options.length)) : 0;

  if (doc.items) {
    const ws = wb.addWorksheet(L.questions.slice(0, 31), {
      views: [{ ...view, state: "frozen", ySplit: 4 }],
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
      headerFooter: { oddFooter: `&L${L.generatedWith}&R${L.page} &P ${L.of} &N` },
    });
    const cols = 4 + maxOpts + 1;
    ws.mergeCells(1, 1, 1, cols);
    ws.getCell(1, 1).value = doc.title;
    ws.getCell(1, 1).font = { size: 18, bold: true, color: { argb: BRAND } };
    ws.getRow(1).height = 30;
    ws.mergeCells(2, 1, 2, cols);
    ws.getCell(2, 1).value = [
      doc.subtitle,
      doc.studentFields
        ? `${L.name}: ${doc.studentName ?? ""}    ${L.date}: ${doc.date ?? ""}    ${L.score}:`
        : doc.date,
    ]
      .filter(Boolean)
      .join("   ");
    ws.getCell(2, 1).font = { color: { argb: "FF6B7280" } };

    const head = [
      "#",
      L.question,
      L.type,
      L.difficulty,
      ...Array.from({ length: maxOpts }, (_, i) => `${L.answer} ${letter(i)}`),
      L.yourAnswer,
    ];
    ws.getRow(4).values = head;
    header(ws.getRow(4));
    ws.columns = [
      { width: 5 },
      { width: 60 },
      { width: 18 },
      { width: 12 },
      ...Array.from({ length: maxOpts }, () => ({ width: 30 })),
      { width: 24 },
    ];
    doc.items.forEach((q, idx) => {
      const r = ws.addRow([
        q.number,
        q.prompt,
        L.types[q.type],
        L.levels[q.difficulty],
        ...Array.from({ length: maxOpts }, (_, i) => q.options[i] ?? ""),
        "",
      ]);
      r.alignment = { vertical: "top", wrapText: true, horizontal: rtl ? "right" : "left" };
      r.getCell(1).alignment = { vertical: "top", horizontal: "center" };
      if (idx % 2 === 1)
        r.eachCell({ includeEmpty: true }, (c) => {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
        });
      r.eachCell({ includeEmpty: true }, (c) => {
        c.border = { bottom: { style: "hair", color: { argb: "FFB8B8C8" } } };
      });
    });
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + doc.items.length, column: cols },
    };
  }

  if (doc.key) {
    const ws = wb.addWorksheet(L.answerKey.slice(0, 31), {
      views: [{ ...view, state: "frozen", ySplit: 3 }],
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    ws.mergeCells("A1:D1");
    ws.getCell("A1").value = `${L.answerKey} — ${doc.title}`;
    ws.getCell("A1").font = { size: 16, bold: true, color: { argb: BRAND } };
    ws.getRow(1).height = 28;
    const hasExpl = doc.key.some((k) => k.explanation);
    ws.getRow(3).values = ["#", L.question, L.answer, ...(hasExpl ? [L.explanation] : [])];
    header(ws.getRow(3));
    ws.columns = [{ width: 5 }, { width: 55 }, { width: 35 }, ...(hasExpl ? [{ width: 60 }] : [])];
    doc.key.forEach((k, idx) => {
      const r = ws.addRow([
        k.number,
        k.prompt,
        k.answer,
        ...(hasExpl ? [k.explanation ?? ""] : []),
      ]);
      r.alignment = { vertical: "top", wrapText: true, horizontal: rtl ? "right" : "left" };
      r.getCell(3).font = { bold: true };
      if (idx % 2 === 1)
        r.eachCell({ includeEmpty: true }, (c) => {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
        });
    });
    ws.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3 + doc.key.length, column: hasExpl ? 4 : 3 },
    };
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
