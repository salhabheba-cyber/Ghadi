import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  extractArticle,
  htmlToStudyText,
} from "@/lib/document-processing/html-extract";
import {
  isYouTubeUrl,
  parseTranscript,
  parseYouTubeId,
  pickCaptionTrack,
  readPlayerResponse,
} from "@/lib/document-processing/youtube";
import {
  decodeTextBytes,
  extractPlainText,
  extractPptx,
  looksScanned,
  slideTextFromXml,
} from "@/lib/document-processing/extractors";
import { DocumentProcessingError, validateFile } from "@/lib/document-processing/files";
import { processFile, processPastedText, toStudyDocument } from "@/lib/document-processing/process";
import { documentSchema } from "@/lib/validation/schemas";

const fakeFile = (name: string, bytes: number[] | string) =>
  new File(
    [typeof bytes === "string" ? new TextEncoder().encode(bytes) : new Uint8Array(bytes)],
    name,
  );

describe("HTML article extraction", () => {
  const html = `<!doctype html><html><head><title>Fallback &amp; Title</title><meta property="og:title" content="Cells &amp; Tissues">
  <style>.x{color:red}</style><script>alert('x')</script></head><body>
  <nav><p>Home | About | Contact us now please</p></nav>
  <article><h1>Cells &amp; Tissues</h1><p>Cells are the basic unit of life, and every organism is made of them.</p>
  <h2>Organelles</h2><p>Mitochondria produce most of the energy a cell needs to function properly.</p>
  <ul><li>The nucleus stores genetic information</li></ul><script>evil()</script></article>
  <footer><p>Copyright notice that should be removed from the output text</p></footer></body></html>`;

  it("keeps article text, headings and lists, and drops scripts, styles and navigation", () => {
    const { title, text } = extractArticle(html);
    expect(title).toBe("Cells & Tissues");
    expect(text).toContain("## Organelles");
    expect(text).toContain("Mitochondria produce most of the energy");
    expect(text).toContain("- The nucleus stores genetic information");
    expect(text).not.toMatch(/alert|evil|color:red|Home \||Copyright/);
  });

  it("never emits markup (output is plain text)", () => {
    const { text } = extractArticle(
      '<article><p>Hello <b onclick="x()">world</b> <img src=x onerror=alert(1)> this paragraph is long enough.</p></article>',
    );
    expect(text).not.toMatch(/<|onerror|onclick/);
  });

  it("decodes named and numeric entities and ignores invalid code points", () => {
    expect(decodeEntities("a &amp; b &lt;3 &#65; &#x42; &rsquo; &bogus; &#1114112;")).toBe(
      "a & b <3 A B ’ &bogus; ",
    );
  });

  it("converts converted-document HTML into study text", () => {
    expect(
      htmlToStudyText(
        "<h1>Title</h1><p>Body text.</p><ul><li>One</li></ul><table><tr><td>Cell</td></tr></table>",
      ),
    ).toBe("## Title\n\nBody text.\n\n- One\nCell");
  });
});

describe("YouTube transcripts (parsing only)", () => {
  it("recognises video ids from supported address shapes", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ?t=5")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(parseYouTubeId("https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(isYouTubeUrl("https://m.youtube.com/watch?v=x")).toBe(true);
    expect(isYouTubeUrl("https://notyoutube.com/")).toBe(false);
  });

  const page = `<html><script>var ytInitialPlayerResponse = {"videoDetails":{"title":"Intro to Cells {live}"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[
    {"baseUrl":"https://www.youtube.com/api/timedtext?v=x&lang=fr","languageCode":"fr","name":{"simpleText":"French"}},
    {"baseUrl":"https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr","languageCode":"en","kind":"asr","name":{"simpleText":"English (auto)"}},
    {"baseUrl":"https://www.youtube.com/api/timedtext?v=x&lang=en","languageCode":"en","name":{"simpleText":"English"}}]}}};var other = 1;</script></html>`;

  it("reads the title and caption tracks even when strings contain braces", () => {
    const { title, tracks } = readPlayerResponse(page);
    expect(title).toBe("Intro to Cells {live}");
    expect(tracks).toHaveLength(3);
  });

  it("prefers a human-made track in the requested language", () => {
    const { tracks } = readPlayerResponse(page);
    expect(pickCaptionTrack(tracks, "en")?.auto).toBe(false);
    expect(pickCaptionTrack(tracks, "fr")?.languageCode).toBe("fr");
    expect(pickCaptionTrack(tracks, "de")?.languageCode).toBe("fr");
    expect(pickCaptionTrack([], "en")).toBeNull();
  });

  it("returns no tracks (so the import is refused) when a video has no captions", () => {
    expect(
      readPlayerResponse(
        '<script>var ytInitialPlayerResponse = {"videoDetails":{"title":"No captions"}};</script>',
      ).tracks,
    ).toEqual([]);
  });

  it("parses json3 and XML transcripts into text", () => {
    const json3 = JSON.stringify({
      events: [
        { segs: [{ utf8: "Hello" }, { utf8: " world." }] },
        { segs: [{ utf8: "\n" }] },
        { segs: [{ utf8: "Second line." }] },
      ],
    });
    expect(parseTranscript(json3)).toBe("Hello world. Second line.");
    expect(
      parseTranscript(
        '<transcript><text start="0" dur="1">It&amp;#39;s here</text><text start="1">Second</text></transcript>',
      ),
    ).toBe("It's here Second");
    expect(parseTranscript("garbage")).toBe("");
  });
});

describe("file validation", () => {
  it("accepts supported files whose contents match their type", async () => {
    expect(await validateFile(fakeFile("a.txt", "hello"))).toBe("txt");
    expect(await validateFile(fakeFile("a.PDF", "%PDF-1.7 ..."))).toBe("pdf");
    expect(await validateFile(fakeFile("slides.pptx", [0x50, 0x4b, 3, 4]))).toBe("pptx");
    expect(await validateFile(fakeFile("pic.png", [0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe("image");
  });

  it("rejects unsupported, empty, mislabelled and oversized files with clear messages", async () => {
    await expect(validateFile(fakeFile("a.exe", "MZ"))).rejects.toThrow(
      /not a supported file type/,
    );
    await expect(validateFile(fakeFile("old.doc", "x"))).rejects.toThrow(
      /save the file as \.docx/i,
    );
    await expect(validateFile(fakeFile("empty.txt", ""))).rejects.toThrow(/is empty/);
    await expect(validateFile(fakeFile("fake.pdf", "just text"))).rejects.toThrow(
      /does not look like a real \.pdf/,
    );
    await expect(validateFile(fakeFile("fake.png", "just text"))).rejects.toThrow(/real image/);
    await expect(
      validateFile({ name: "big.txt", size: 6 * 1024 * 1024, slice: () => new Blob(["x"]) }),
    ).rejects.toThrow(/over the 5\.0 MB limit/);
  });
});

describe("text extraction", () => {
  it("reads UTF-8 with BOM, UTF-16, and flags legacy encodings", () => {
    expect(decodeTextBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]))?.text).toBe("hi");
    expect(decodeTextBytes(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]))?.text).toBe("hi");
    const legacy = decodeTextBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9]));
    expect(legacy?.text).toBe("café");
    expect(legacy?.warning).toMatch(/Windows-1252/);
    expect(new TextDecoder().decode(new TextEncoder().encode("مرحبا"))).toBe("مرحبا");
  });

  it("rejects binary data posing as text", () => {
    expect(() =>
      extractPlainText(new Uint8Array(Array.from({ length: 500 }, (_, i) => (i % 7) + 1)).buffer),
    ).toThrow(DocumentProcessingError);
  });

  it("detects scanned PDFs by how little text they contain", () => {
    expect(looksScanned("", 5)).toBe(true);
    expect(looksScanned("x".repeat(500), 5)).toBe(false);
  });

  it("extracts slide text and speaker notes from a real PPTX container", async () => {
    const ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
    const slide = (t: string) =>
      `<?xml version="1.0"?><p:sld xmlns:p="p" ${ns}><a:p><a:r><a:t>${t}</a:t></a:r></a:p><a:p><a:r><a:t>Second</a:t></a:r><a:r><a:t> run</a:t></a:r></a:p></p:sld>`;
    const zip = new JSZip();
    zip.file("ppt/slides/slide2.xml", slide("Beta"));
    zip.file("ppt/slides/slide1.xml", slide("Alpha"));
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      '<Relationships><Relationship Target="../notesSlides/notesSlide1.xml"/></Relationships>',
    );
    zip.file(
      "ppt/notesSlides/notesSlide1.xml",
      `<p:notes xmlns:p="p" ${ns}><a:p><a:r><a:t>Remember the demo</a:t></a:r></a:p></p:notes>`,
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const r = await extractPptx(buffer);
    expect(r.pageCount).toBe(2);
    expect(r.text.indexOf("Alpha")).toBeLessThan(r.text.indexOf("Beta"));
    expect(r.text).toContain("## Slide 1");
    expect(r.text).toContain("Second run");
    expect(r.text).toContain("Speaker notes: Remember the demo");
    expect(slideTextFromXml("<broken")).toBe("");
  });

  it("refuses a zip that has no slides", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<x/>");
    await expect(extractPptx(await zip.generateAsync({ type: "arraybuffer" }))).rejects.toThrow(
      /No slides/,
    );
  });
});

describe("document processing", () => {
  it("processes a text file into a valid, storable document", async () => {
    const file = new File(
      ["# Cells\n\nCells are the basic unit of life in every organism on Earth."],
      "my_biology_notes.md",
    );
    const p = await processFile(file);
    expect(p).toMatchObject({
      kind: "md",
      title: "my biology notes",
      status: "ready",
      extractionMethod: "text",
    });
    const doc = toStudyDocument(p);
    expect(documentSchema.safeParse(doc).success).toBe(true);
    expect(doc.wordCount).toBeGreaterThan(10);
  });

  it("marks files with no text as empty rather than failing silently", async () => {
    const p = await processFile(new File(["   \n  "], "blank.txt"));
    expect(p.status).toBe("empty");
  });

  it("requires explicit OCR consent before reading images", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])], "scan.png");
    await expect(processFile(png)).rejects.toThrow(/needs the optional OCR engine/);
  });

  it("handles pasted text and derives a title when none is given", () => {
    const p = processPastedText("", "# My Heading\n\nSome pasted study text goes here.");
    expect(p.title).toBe("My Heading");
    expect(p.kind).toBe("paste");
  });
});
