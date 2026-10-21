// Offline build step: converts public-domain French texts from GITenberg (GitHub mirror of Project Gutenberg)
// into Ghadi reader JSON. Usage: node scripts/build-catalog-gutenberg-fr.mjs <gitDir> <git_ok.json>
import fs from "node:fs";
import path from "node:path";

const [gitDir, okFile] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, "..");
const outBooks = path.join(root, "public/books");
const ok = JSON.parse(fs.readFileSync(okFile, "utf8"));

// [ageMin, ageMax, genres]; editorial suggestions by Ghadi. Plays are excluded (formatting is not prose).
const EDITORIAL = {
  15058: [7, 11, ["classic", "family"]],
  15059: [7, 11, ["classic", "family"]],
  15057: [7, 11, ["classic", "family"]],
  12969: [8, 12, ["classic"]],
  13013: [9, 13, ["adventure", "classic"]],
  13456: [8, 12, ["classic", "humour"]],
  12993: [8, 12, ["classic", "humour"]],
  18090: [8, 12, ["classic"]],
  14247: [6, 10, ["fairy tale"]],
  800: [11, 16, ["adventure", "classic"]],
  4791: [12, 17, ["science fiction", "adventure", "classic"]],
  4548: [12, 17, ["adventure", "classic"]],
  4717: [12, 17, ["science fiction", "classic"]],
  55456: [8, 12, ["fantasy", "classic"]],
  11770: [12, 17, ["classic", "short stories"]],
  12250: [6, 10, ["fairy tale"]],
  18244: [6, 10, ["fairy tale"]],
  18245: [6, 10, ["fairy tale"]],
  10687: [13, 18, ["humour", "classic"]],
  13256: [12, 17, ["classic", "coming of age"]],
  32854: [13, 18, ["mystery", "classic"]],
  62215: [14, 18, ["mystery", "classic"]],
  13765: [14, 18, ["mystery", "classic"]],
  4559: [10, 15, ["classic", "coming of age"]],
  54183: [9, 13, ["animal story", "adventure", "classic"]],
  13951: [13, 18, ["adventure", "classic"]],
  19657: [15, 18, ["classic", "history"]],
};

function readText(dir) {
  const files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f) && !/readme/i.test(f));
  files.sort((a, b) => fs.statSync(path.join(dir, b)).size - fs.statSync(path.join(dir, a)).size);
  const buf = fs.readFileSync(path.join(dir, files[0]));
  const utf8 = buf.toString("utf8");
  return utf8.includes("�") ? buf.toString("latin1") : utf8;
}

const HEADING =
  /^(?:(?:CHAPITRE|Chapitre|CHAP\.?|LIVRE|Livre|PARTIE|PREMI[ÈE]RE PARTIE|DEUXI[ÈE]ME PARTIE|TROISI[ÈE]ME PARTIE|ÉPILOGUE|PROLOGUE|PR[ÉE]FACE)\b.{0,80}|[IVXLC]{1,7}\.?(?:\s.{0,70})?|\d{1,3}\.?\s*\S.{0,60}|[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ\s'’,;:\-–—!?.]{3,70})$/;

function convert(raw) {
  let t = raw.replace(/\r/g, "");
  const s = t.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/);
  if (s >= 0) t = t.slice(t.indexOf("\n", s) + 1);
  const e = t.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/);
  if (e >= 0) t = t.slice(0, e);
  const endOld = t.search(/^End of (the )?Project Gutenberg/im);
  if (endOld >= 0) t = t.slice(0, endOld);
  t = t.replace(/\[Illustration[^\]]*\]/gi, "").replace(/\[Note[^\]]*\]/gi, "");
  const paras = t
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split("\n")
        .map((l) => l.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .replace(/_/g, "")
        .trim(),
    )
    .filter(Boolean);
  const chapters = [];
  let cur = { title: "", blocks: [] };
  const flush = () => {
    if (cur.blocks.length) chapters.push(cur);
  };
  for (const p of paras) {
    if (
      p.length < 80 &&
      HEADING.test(p) &&
      !/[a-zà-ÿ]{4,}.*[a-zà-ÿ]{4,}.*[a-zà-ÿ]{4,}/.test(p.replace(/^(Chapitre|Livre|Partie)\b/i, ""))
    ) {
      flush();
      cur = { title: p, blocks: [{ t: "h", x: p }] };
    } else cur.blocks.push({ t: "p", x: p });
  }
  flush();
  // Drop table-of-contents fragments and stubs: chapters with almost no prose.
  const prose = (c) => c.blocks.filter((b) => b.t === "p").reduce((n, b) => n + b.x.length, 0);
  let kept = chapters.filter((c) => prose(c) >= 300);
  // Normalise section sizes: merge tiny fragments forward, split very long runs at paragraph boundaries.
  const merged = [];
  for (const c of kept) {
    const last = merged[merged.length - 1];
    if (last && prose(last) < 6000) last.blocks.push(...c.blocks);
    else merged.push({ title: c.title, blocks: [...c.blocks] });
  }
  const out = [];
  for (const c of merged) {
    if (prose(c) <= 32000) {
      out.push(c);
      continue;
    }
    let part = { title: c.title, blocks: [] },
      size = 0,
      n = 1;
    for (const b of c.blocks) {
      part.blocks.push(b);
      if (b.t === "p") size += b.x.length;
      if (size >= 20000 && b.t === "p") {
        out.push(part);
        n += 1;
        size = 0;
        part = { title: `${c.title || "Suite"} (${n})`, blocks: [] };
      }
    }
    if (part.blocks.length) out.push(part);
  }
  kept = out.map((c, i) => ({ id: `c${i + 1}`, title: c.title || `${i + 1}`, blocks: c.blocks }));
  return kept;
}

const manifest = [];
for (const [id, [repo, title, author, rights]] of Object.entries(ok)) {
  const ed = EDITORIAL[id];
  if (!ed) continue;
  const dir = path.join(gitDir, repo);
  const chapters = convert(readText(dir));
  const words = chapters
    .flatMap((c) => c.blocks)
    .filter((b) => b.t === "p")
    .reduce((n, b) => n + b.x.split(" ").length, 0);
  if (chapters.length === 0 || words < 3000) {
    console.log("SKIP", id, title, words);
    continue;
  }
  const slug = `pg-fr-${id}`;
  const clean = title.split("\n")[0].replace(/\s+/g, " ").trim();
  fs.writeFileSync(
    path.join(outBooks, `${slug}.json`),
    JSON.stringify({ v: 1, lang: "fr", dir: "ltr", layout: "scroll", chapters }),
  );
  const [lastName, first] = author.split(",").map((s) => s.trim());
  manifest.push({
    slug,
    source: "gutenberg",
    sourceId: String(id),
    language: "fr",
    title: clean,
    author: first ? `${first} ${lastName}` : author,
    synopsis: "",
    ageMin: ed[0],
    ageMax: ed[1],
    readingLevel: null,
    levelBasis: "age range is a Ghadi editorial suggestion",
    genres: ed[2],
    subjects: [],
    pageCount: chapters.length,
    wordCount: words,
    estMinutes: Math.round(words / 180),
    sourceUrl: `https://www.gutenberg.org/ebooks/${id}`,
    license: rights.replace(/\.$/, ""),
    licenseUrl: "https://www.gutenberg.org/policy/permission.html",
    attribution: `${clean}, ${first ? first + " " + lastName : author}. Public-domain text from Project Gutenberg (ebook #${id}), via the GITenberg mirror. Project Gutenberg is a registered trademark of the Project Gutenberg Literary Archive Foundation.`,
    coverPath: null,
    contentPath: `/books/${slug}.json`,
    layout: "scroll",
    verifiedOn: new Date().toISOString().slice(0, 10),
  });
  console.log(slug, clean.slice(0, 40), chapters.length, "ch", words, "w");
}
fs.writeFileSync(
  path.join(root, "src/lib/books/manifest-gutenberg-fr.json"),
  JSON.stringify(manifest),
);
