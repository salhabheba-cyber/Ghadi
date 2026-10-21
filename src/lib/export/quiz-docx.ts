import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { LABELS, letter, type ExportDoc } from "./types";

const PURPLE = "6D28D9";
const GREY = "6B7280";
const FONT = "Calibri";

/** Editable Word document with real styles, headings, numbered questions and a page-numbered footer. */
export async function buildQuizDocx(doc: ExportDoc): Promise<Buffer> {
  const L = LABELS[doc.language];
  const rtl = doc.language === "ar";
  const bidi = rtl ? { bidirectional: true } : {};
  const align = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const run = (text: string, o: ConstructorParameters<typeof TextRun>[0] = {}) =>
    new TextRun({ text, font: FONT, rightToLeft: rtl, ...(o as object) });

  const body: (Paragraph | Table)[] = [];

  body.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: align,
      ...bidi,
      children: [run(doc.title)],
    }),
  );
  if (doc.subtitle)
    body.push(
      new Paragraph({
        style: "Subtitle",
        alignment: align,
        ...bidi,
        children: [run(doc.subtitle)],
      }),
    );

  if (doc.items) {
    if (doc.studentFields) {
      const cell = (label: string, value?: string) =>
        new TableCell({
          width: { size: 33, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            bottom: { style: BorderStyle.SINGLE, size: 6, color: GREY },
          },
          children: [
            new Paragraph({
              ...bidi,
              spacing: { before: 120, after: 40 },
              children: [
                run(`${label}: `, { bold: true, size: 20 }),
                run(value ?? "", { size: 20 }),
              ],
            }),
          ],
        });
      body.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [cell(L.name, doc.studentName), cell(L.date, doc.date), cell(L.score)],
            }),
          ],
        }),
      );
    }
    body.push(
      new Paragraph({
        alignment: align,
        ...bidi,
        spacing: { before: 200, after: 200 },
        children: [run(L.instructions, { italics: true, color: GREY, size: 20 })],
      }),
    );

    for (const q of doc.items) {
      body.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          alignment: align,
          ...bidi,
          keepNext: true,
          keepLines: true,
          children: [run(`${q.number}. `, { bold: true, color: PURPLE }), run(q.prompt)],
        }),
      );
      if (q.options.length > 0) {
        q.options.forEach((opt, i) =>
          body.push(
            new Paragraph({
              alignment: align,
              ...bidi,
              keepLines: true,
              keepNext: i < q.options.length - 1,
              indent: rtl ? { right: 480, hanging: 360 } : { left: 480, hanging: 360 },
              spacing: { after: 60 },
              children: [run(`${letter(i)}.\t`, { bold: true }), run(opt)],
              tabStops: [{ type: TabStopType.LEFT, position: 480 }],
            }),
          ),
        );
      } else {
        for (let i = 0; i < (q.type === "short" ? 3 : 1); i++)
          body.push(
            new Paragraph({
              spacing: { before: 200 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "9CA3AF", space: 1 } },
              children: [run("")],
            }),
          );
      }
      body.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
  }

  if (doc.key) {
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: align,
        ...bidi,
        // The key always starts on its own page when it follows the questions, so it can be detached.
        pageBreakBefore: doc.items !== null,
        children: [run(`${L.answerKey} — ${doc.title}`)],
      }),
    );
    for (const k of doc.key) {
      body.push(
        new Paragraph({
          alignment: align,
          ...bidi,
          keepNext: Boolean(k.explanation),
          keepLines: true,
          spacing: { before: 120, after: 40 },
          children: [
            run(`${k.number}. `, { bold: true, color: PURPLE }),
            run(k.answer, { bold: true }),
          ],
        }),
      );
      if (k.explanation)
        body.push(
          new Paragraph({
            alignment: align,
            ...bidi,
            keepLines: true,
            indent: rtl ? { right: 360 } : { left: 360 },
            spacing: { after: 80 },
            children: [
              run(`${L.explanation}: `, { italics: true, color: GREY }),
              run(k.explanation, { color: GREY }),
            ],
          }),
        );
    }
  }

  const document = new Document({
    creator: "Ghadi",
    title: doc.title,
    description: doc.items ? "Quiz" : "Answer key",
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          run: { font: FONT, size: 44, bold: true, color: PURPLE },
          paragraph: { spacing: { after: 80 } },
        },
        {
          id: "Subtitle",
          name: "Subtitle",
          basedOn: "Normal",
          next: "Normal",
          run: { font: FONT, size: 26, color: GREY },
          paragraph: { spacing: { after: 200 } },
        },
        {
          id: "Heading1",
          name: "heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 34, bold: true, color: PURPLE },
          paragraph: { spacing: { before: 120, after: 200 } },
        },
        {
          id: "Heading2",
          name: "heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 24, bold: false },
          paragraph: { spacing: { before: 240, after: 100 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PURPLE, space: 4 } },
                children: [run("Ghadi", { bold: true, color: PURPLE, size: 20 })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run(`${L.generatedWith} · ${L.page} `, { size: 16, color: GREY }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT,
                    size: 16,
                    color: GREY,
                  }),
                  run(` ${L.of} `, { size: 16, color: GREY }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONT,
                    size: 16,
                    color: GREY,
                  }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(document);
}
