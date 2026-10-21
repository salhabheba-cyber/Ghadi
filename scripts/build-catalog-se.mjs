// Offline build step: converts public-domain Standard Ebooks sources (CC0 markup, GitHub) into Ghadi reader JSON.
// Usage: node scripts/build-catalog-se.mjs <dirWithSeRepos>
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const src = process.argv[2];
const root = path.resolve(import.meta.dirname, "..");
const outBooks = path.join(root, "public/books");
fs.mkdirSync(outBooks, { recursive: true });

// Age ranges and genres are Ghadi's editorial suggestions (Standard Ebooks does not publish audiences).
const EDITORIAL = {
  "lewis-carroll_alices-adventures-in-wonderland": [8, 12, ["fantasy", "classic"]],
  "lewis-carroll_through-the-looking-glass": [9, 13, ["fantasy", "classic"]],
  "kenneth-grahame_the-wind-in-the-willows": [8, 12, ["animal story", "classic"]],
  "j-m-barrie_peter-and-wendy": [8, 12, ["fantasy", "adventure", "classic"]],
  "rudyard-kipling_the-jungle-book": [9, 13, ["animal story", "adventure", "classic"]],
  "rudyard-kipling_just-so-stories": [6, 9, ["fable", "classic"]],
  "l-frank-baum_the-wonderful-wizard-of-oz": [8, 12, ["fantasy", "adventure", "classic"]],
  "l-m-montgomery_anne-of-green-gables": [10, 15, ["classic", "coming of age"]],
  "robert-louis-stevenson_treasure-island": [11, 16, ["adventure", "classic"]],
  "frances-hodgson-burnett_the-secret-garden": [9, 13, ["classic", "nature"]],
  "frances-hodgson-burnett_a-little-princess": [9, 13, ["classic"]],
  "louisa-may-alcott_little-women": [11, 16, ["classic", "family"]],
  "mark-twain_the-adventures-of-tom-sawyer": [11, 16, ["adventure", "classic"]],
  "h-g-wells_the-time-machine": [14, 18, ["science fiction", "classic"]],
  "arthur-conan-doyle_the-adventures-of-sherlock-holmes": [13, 18, ["mystery", "classic"]],
  "arthur-conan-doyle_the-hound-of-the-baskervilles": [13, 18, ["mystery", "classic"]],
  "jack-london_the-call-of-the-wild": [12, 17, ["adventure", "animal story", "classic"]],
  "e-nesbit_five-children-and-it": [7, 11, ["fantasy", "classic"]],
  "e-nesbit_the-railway-children": [8, 12, ["family", "classic"]],
  "jane-austen_pride-and-prejudice": [15, 18, ["classic", "romance"]],
  "mary-shelley_frankenstein": [15, 18, ["science fiction", "classic"]],
  "jules-verne_around-the-world-in-eighty-days_george-makepeace-towle": [
    11,
    16,
    ["adventure", "classic"],
  ],
  "george-macdonald_the-princess-and-the-goblin": [8, 12, ["fantasy", "classic"]],
  "charles-kingsley_the-water-babies": [9, 13, ["fantasy", "classic"]],
  "anna-sewell_black-beauty": [9, 13, ["animal story", "classic"]],
};

const text = (el) => el.textContent.replace(/\s+/g, " ").trim();
const manifest = [];
for (const dirName of fs.readdirSync(src).sort()) {
  const ed = EDITORIAL[dirName];
  const repo = path.join(src, dirName);
  const opfPath = path.join(repo, "src/epub/content.opf");
  if (!ed || !fs.existsSync(opfPath)) continue;
  const opf = new JSDOM(fs.readFileSync(opfPath, "utf8"), { contentType: "text/xml" }).window
    .document;
  const q = (sel) => opf.querySelector(sel);
  const title = text(q('dc\\:title[id="title"], title[id="title"]') || q("dc\\:title, title"));
  const author = text(
    q('dc\\:creator[id="author"], creator[id="author"]') || q("dc\\:creator, creator"),
  );
  const subjects = [...opf.querySelectorAll("dc\\:subject, subject")].map(text);
  const manifestItems = new Map(
    [...opf.querySelectorAll("manifest > item, item")].map((i) => [
      i.getAttribute("id"),
      i.getAttribute("href"),
    ]),
  );
  const spine = [...opf.querySelectorAll("spine > itemref, itemref")]
    .map((i) => manifestItems.get(i.getAttribute("idref")))
    .filter((h) => h && h.endsWith(".xhtml"));
  const metaVal = (prop) =>
    text(opf.querySelector(`meta[property="${prop}"]`) || { textContent: "" });
  const SKIP =
    /(titlepage|halftitlepage|imprint|colophon|uncopyright|loi|toc|copyright|dedication|endnotes|frontispiece)\.xhtml$/;
  const chapters = [];
  let words = 0;
  for (const href of spine) {
    if (SKIP.test(href)) continue;
    const file = path.join(repo, "src/epub", href);
    if (!fs.existsSync(file)) continue;
    const doc = new JSDOM(fs.readFileSync(file, "utf8"), { contentType: "application/xhtml+xml" })
      .window.document;
    const blocks = [];
    for (const el of doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li")) {
      if (el.closest("nav")) continue;
      const tag = el.tagName.toLowerCase();
      const clone = el.cloneNode(true);
      clone.querySelectorAll("sup, a[epub\\:type='noteref']").forEach((n) => n.remove());
      clone.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
      const x = text(clone);
      if (!x) continue;
      if (/^h\d$/.test(tag)) {
        const sub = el.querySelector("[epub\\:type~='subtitle']");
        const ordinal = el.querySelector("[epub\\:type~='ordinal']");
        blocks.push({ t: "h", x: ordinal && sub ? `${text(ordinal)} ${text(sub)}`.trim() : x });
      } else {
        blocks.push({ t: el.closest("blockquote") ? "q" : "p", x });
        words += x.split(" ").length;
      }
    }
    if (blocks.length === 0) continue;
    const heading = blocks.find((b) => b.t === "h");
    chapters.push({ id: `c${chapters.length + 1}`, title: heading ? heading.x : "", blocks });
  }
  if (chapters.length === 0) continue;
  const slug = "se-" + dirName.replace(/_/g, "-").slice(0, 70);
  fs.writeFileSync(
    path.join(outBooks, `${slug}.json`),
    JSON.stringify({ v: 1, lang: "en", dir: "ltr", layout: "scroll", chapters }),
  );
  const ease = Number(metaVal("se:reading-ease.flesch"));
  const urlPath = dirName.split("_").join("/");
  manifest.push({
    slug,
    source: "standardebooks",
    sourceId: dirName,
    language: "en",
    title,
    author,
    synopsis: metaVal("se:long-description") ? "" : "",
    shortDescription: "",
    ageMin: ed[0],
    ageMax: ed[1],
    readingLevel:
      Number.isFinite(ease) && ease > 0 ? `Flesch reading ease ${Math.round(ease)}` : null,
    levelBasis: "age range is a Ghadi editorial suggestion",
    genres: ed[2],
    subjects: subjects.slice(0, 5),
    pageCount: chapters.length,
    wordCount: words,
    estMinutes: Math.round(words / 200),
    sourceUrl: `https://standardebooks.org/ebooks/${urlPath}`,
    license: "Public domain (US); markup CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    attribution: `${title} by ${author}. Text from Standard Ebooks (https://standardebooks.org), which dedicates its contributions to the public domain under CC0 1.0.`,
    coverPath: null,
    contentPath: `/books/${slug}.json`,
    layout: "scroll",
    verifiedOn: new Date().toISOString().slice(0, 10),
    _shortDescription: metaVal("se:short-description") || null,
  });
  console.log(slug, chapters.length, "ch", words, "words");
}
fs.writeFileSync(path.join(root, "src/lib/books/manifest-se.json"), JSON.stringify(manifest));
