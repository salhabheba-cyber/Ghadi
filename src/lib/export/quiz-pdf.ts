import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ExportError, LABELS, letter, type ExportDoc } from "./types";

const W = 595.28; // A4
const H = 841.89;
const M = 54;
const TOP = H - 78;
const BOTTOM = 62;
const PURPLE = rgb(0.427, 0.157, 0.851);
const GREY = rgb(0.42, 0.45, 0.5);
const INK = rgb(0.1, 0.1, 0.16);

/** Standard PDF fonts only cover WinAnsi (Latin). Arabic would silently become "?" so we refuse instead. */
function assertSupported(doc: ExportDoc) {
  const texts = [
    doc.title,
    doc.subtitle ?? "",
    doc.studentName ?? "",
    ...(doc.items ?? []).flatMap((q) => [q.prompt, ...q.options]),
    ...(doc.key ?? []).flatMap((k) => [k.prompt, k.answer, k.explanation ?? ""]),
  ].join("");
  if (doc.language === "ar" || /[֐-ࣿ]/.test(texts)) {
    throw new ExportError(
      "unsupported-script",
      "PDF export does not support Arabic or other right-to-left scripts yet. Choose Word (.docx) or Excel (.xlsx) for this quiz.",
    );
  }
}

function clean(font: PDFFont, s: string): string {
  const norm = s.replace(/\s+/g, " ").replace(/[‘’]/g, "’").trim();
  let out = "";
  for (const ch of norm) {
    try {
      font.widthOfTextAtSize(ch, 10);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const words = clean(font, text).split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) <= width) cur = t;
    else {
      if (cur) lines.push(cur);
      // Hard-split a single very long token.
      let rest = w;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      cur = rest;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export async function buildQuizPdf(doc: ExportDoc): Promise<Buffer> {
  assertSupported(doc);
  const L = LABELS[doc.language];
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(await pdf.embedFont(StandardFonts.Helvetica), doc.title));
  pdf.setCreator("Ghadi");
  pdf.setProducer("Ghadi");
  pdf.setSubject(doc.items ? "Quiz" : "Answer key");
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page!: PDFPage;
  let y = TOP;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = TOP;
  };
  const ensure = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };
  const text = (s: string, x: number, size: number, font: PDFFont, color = INK) => {
    page.drawText(s, { x, y, size, font, color });
  };

  // One "block" = lines drawn together; moved wholesale to the next page if it would be split.
  interface Line {
    s: string;
    x: number;
    size: number;
    font: PDFFont;
    color?: ReturnType<typeof rgb>;
    gap: number; // vertical advance after this line
  }
  const drawBlock = (lines: Line[], before = 0) => {
    const total = lines.reduce((a, l) => a + l.gap, 0) + before;
    if (total < TOP - BOTTOM) ensure(total);
    else ensure(lines[0]?.gap ?? 14);
    y -= before;
    for (const l of lines) {
      ensure(l.gap);
      text(l.s, l.x, l.size, l.font, l.color);
      y -= l.gap;
    }
  };

  newPage();
  // Title block
  for (const line of wrap(bold, doc.title, 22, W - 2 * M)) {
    text(line, M, 22, bold, PURPLE);
    y -= 28;
  }
  if (doc.subtitle) {
    for (const line of wrap(reg, doc.subtitle, 12, W - 2 * M)) {
      text(line, M, 12, reg, GREY);
      y -= 17;
    }
  }
  y -= 4;

  if (doc.items) {
    if (doc.studentFields) {
      const colW = (W - 2 * M) / 3;
      const fields: [string, string | undefined][] = [
        [L.name, doc.studentName],
        [L.date, doc.date],
        [L.score, undefined],
      ];
      fields.forEach(([label, val], i) => {
        const x = M + i * colW;
        text(`${label}: ${val ? clean(reg, val) : ""}`, x, 10, reg);
        page.drawLine({
          start: { x, y: y - 4 },
          end: { x: x + colW - 14, y: y - 4 },
          thickness: 0.6,
          color: GREY,
        });
      });
      y -= 26;
    }
    for (const line of wrap(ital, L.instructions, 10, W - 2 * M)) {
      text(line, M, 10, ital, GREY);
      y -= 14;
    }
    y -= 8;

    for (const q of doc.items) {
      const lines: Line[] = [];
      const num = `${q.number}.`;
      const numW = bold.widthOfTextAtSize(num, 11) + 6;
      wrap(bold, q.prompt, 11, W - 2 * M - numW).forEach((s, i) =>
        lines.push({
          s: i === 0 ? `${num} ${s}` : s,
          x: i === 0 ? M : M + numW,
          size: 11,
          font: bold,
          gap: 15,
        }),
      );
      if (q.options.length) {
        q.options.forEach((opt, i) => {
          const lab = `${letter(i)}.`;
          wrap(reg, opt, 10.5, W - 2 * M - 48).forEach((s, j) =>
            lines.push({
              s: j === 0 ? `${lab}  ${s}` : s,
              x: M + (j === 0 ? 22 : 36),
              size: 10.5,
              font: reg,
              gap: 14,
            }),
          );
        });
      } else {
        const n = q.type === "short" ? 3 : 1;
        for (let i = 0; i < n; i++) lines.push({ s: "", x: M, size: 10, font: reg, gap: 22 });
      }
      const startY = y;
      drawBlock(lines, 6);
      if (q.options.length === 0) {
        // draw writing rules for the blank lines of this block
        const n = q.type === "short" ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const ly = y + (n - i) * 22 - 6;
          if (ly > BOTTOM - 10 && ly < startY + 20)
            page.drawLine({
              start: { x: M + 22, y: ly },
              end: { x: W - M, y: ly },
              thickness: 0.5,
              color: GREY,
            });
        }
      }
      y -= 6;
    }
  }

  if (doc.key) {
    if (doc.items) newPage();
    else if (y < TOP - 60) newPage();
    text(clean(bold, `${L.answerKey}`), M, 18, bold, PURPLE);
    y -= 28;
    for (const k of doc.key) {
      const lines: Line[] = [];
      const num = `${k.number}.`;
      const numW = bold.widthOfTextAtSize(num, 11) + 6;
      wrap(bold, k.answer, 11, W - 2 * M - numW).forEach((s, i) =>
        lines.push({
          s: i === 0 ? `${num} ${s}` : s,
          x: i === 0 ? M : M + numW,
          size: 11,
          font: bold,
          gap: 15,
        }),
      );
      if (k.explanation)
        wrap(ital, k.explanation, 10, W - 2 * M - 22).forEach((s) =>
          lines.push({ s, x: M + 22, size: 10, font: ital, color: GREY, gap: 13 }),
        );
      drawBlock(lines, 4);
    }
  }

  // Header/footer on every page once the page count is known.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: M, y: H - 40 },
      end: { x: W - M, y: H - 40 },
      thickness: 1.2,
      color: PURPLE,
    });
    p.drawText("Ghadi", { x: M, y: H - 34, size: 11, font: bold, color: PURPLE });
    const t = clean(reg, doc.title).slice(0, 70);
    const tw = reg.widthOfTextAtSize(t, 9);
    p.drawText(t, { x: W - M - tw, y: H - 34, size: 9, font: reg, color: GREY });
    const foot = `${L.generatedWith}  |  ${L.page} ${i + 1} ${L.of} ${pages.length}`;
    const fw = reg.widthOfTextAtSize(foot, 8.5);
    p.drawText(foot, { x: (W - fw) / 2, y: 30, size: 8.5, font: reg, color: GREY });
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
