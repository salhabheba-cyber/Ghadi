// Offline build step: converts openly licensed Global Storybooks / African Storybook Project stories
// (Markdown + images from GitHub) into Ghadi's reader JSON. Not run at deploy time.
// Usage: node scripts/build-catalog-asp.mjs <srcDir>   (srcDir contains asp-source, global-asp, asp-imagebank)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const src = process.argv[2];
const root = path.resolve(import.meta.dirname, "..");
const outBooks = path.join(root, "public/books");
const outImg = path.join(outBooks, "img");
fs.mkdirSync(outImg, { recursive: true });

const master = fs.readFileSync(path.join(src, "global-asp/MASTER.md"), "utf8");
const masterRows = new Map();
for (const m of master.matchAll(/^(\d{4}) \| \[(.*?)\]\((.*?)\) \| \[(.*?)\]\((.*?)\)/gm))
  masterRows.set(m[1], {
    title: m[2],
    url: m[3].replace(/^http:/, "https:"),
    lic: m[4],
    licUrl: m[5],
  });

const imgReadme = fs.readFileSync(path.join(src, "asp-imagebank/README.md"), "utf8");
const illus = new Map();
for (const m of imgReadme.matchAll(/^(\d{4}) \| _(.*?)_ \| \*\*(.*?)\*\* \| (.*?)\s*$/gm))
  illus.set(m[1], { by: m[3], lic: m[4].trim() });

function parse(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/\r/g, "");
  const parts = raw.split(/^##\s*$/m);
  const title = (parts[0].match(/^#\s*(.+)$/m) || [])[1]?.trim();
  const meta = parts[parts.length - 1];
  const pages = parts
    .slice(1, -1)
    .map((p) => p.trim().replace(/\n+/g, " ").replace(/\s+/g, " "))
    .filter(Boolean);
  const lic = (meta.match(/License:\s*\[?([A-Za-z\- ]+?)\]?\s*$/m) || [])[1]?.trim();
  const field = (k) => (meta.match(new RegExp(`${k}:\\s*(.+)`)) || [])[1]?.trim();
  return {
    title,
    pages,
    lic,
    text: field("Text"),
    illustration: field("Illustration"),
    translation: field("Translation"),
    adaptation: field("Adaptation"),
  };
}

const langs = [
  { code: "en", dir: path.join(src, "asp-source/en") },
  { code: "fr", dir: path.join(src, "asp-source/fr") },
  { code: "ar", dir: path.join(src, "global-asp/ar") },
];
// Pick stories that exist in French or Arabic (so every picked story is also available in English)
const byLang = {};
for (const l of langs) {
  byLang[l.code] = new Map();
  for (const f of fs.readdirSync(l.dir)) {
    const m = f.match(/^(\d{4})_.*\.md$/);
    if (m) byLang[l.code].set(m[1], path.join(l.dir, f));
  }
}
const MAX = Number(process.env.MAX_STORIES || 90);
const candidates = [...new Set([...byLang.ar.keys(), ...byLang.fr.keys()])].sort();
const manifest = [];
const usedIdx = new Set();

for (const idx of candidates) {
  if (usedIdx.size >= MAX) break;
  const ill = illus.get(idx);
  const mr = masterRows.get(idx);
  if (!ill || ill.lic !== "CC BY" || !mr || !/^CC-BY$/.test(mr.lic)) continue;
  const imgDir = path.join(src, "asp-imagebank/medium", idx);
  if (!fs.existsSync(imgDir)) continue;
  const imgs = fs
    .readdirSync(imgDir)
    .filter((f) => /\.jpe?g$/i.test(f))
    .sort();
  const parsed = {};
  let ok = true;
  for (const l of langs) {
    const f = byLang[l.code].get(idx);
    if (!f) continue;
    const p = parse(f);
    if (!p.title || p.pages.length < 3 || !/^CC-?BY$/i.test((p.lic || "").replace(/\s/g, ""))) {
      if (l.code === "en") ok = false;
      continue;
    }
    if (imgs.length < p.pages.length + 1 || imgs.length > p.pages.length + 3) {
      if (l.code === "en") ok = false;
      continue;
    }
    parsed[l.code] = p;
  }
  if (!ok || !parsed.en) continue;
  usedIdx.add(idx);
  fs.mkdirSync(path.join(outImg, idx), { recursive: true });
  const maxPages = Math.max(...Object.values(parsed).map((p) => p.pages.length)) + 1;
  for (let i = 0; i < Math.min(imgs.length, maxPages); i++) {
    const name = String(i + 1).padStart(2, "0") + ".jpg";
    await sharp(path.join(imgDir, imgs[i]))
      .resize({ width: 640, withoutEnlargement: true })
      .jpeg({ quality: 60, mozjpeg: true })
      .toFile(path.join(outImg, idx, name));
  }
  for (const [code, p] of Object.entries(parsed)) {
    const slug = `asp-${idx}-${code}`;
    const words = p.pages.join(" ").split(/\s+/).length;
    const avg = words / p.pages.length;
    const level = avg <= 8 ? 1 : avg <= 20 ? 2 : avg <= 40 ? 3 : 4;
    const ages = [
      [3, 5],
      [5, 7],
      [7, 9],
      [8, 11],
    ][level - 1];
    const dir = code === "ar" ? "rtl" : "ltr";
    const chapters = [
      {
        id: "cover",
        title: p.title,
        blocks: [
          { t: "img", src: `/books/img/${idx}/01.jpg`, alt: "" },
          { t: "h", x: p.title },
        ],
      },
    ];
    p.pages.forEach((txt, i) => {
      const imgName = String(i + 2).padStart(2, "0") + ".jpg";
      chapters.push({
        id: `p${i + 1}`,
        title: "",
        blocks: [
          { t: "img", src: `/books/img/${idx}/${imgName}`, alt: "" },
          { t: "p", x: txt },
        ],
      });
    });
    fs.writeFileSync(
      path.join(outBooks, `${slug}.json`),
      JSON.stringify({ v: 1, lang: code, dir, layout: "pages", chapters }),
    );
    const credits = [
      p.text && `Text: ${p.text}`,
      `Illustration: ${ill.by}`,
      p.translation && `Translation: ${p.translation}`,
      p.adaptation && `Adaptation: ${p.adaptation}`,
    ]
      .filter(Boolean)
      .join(" · ");
    manifest.push({
      slug,
      source: "globalstorybooks",
      sourceId: idx,
      language: code,
      title: p.title,
      author:
        (p.text || "African Storybook Project").split(",")[0].trim() +
        (p.text && p.text.includes(",") ? " and others" : ""),
      synopsis: "",
      excerpt: p.pages.slice(0, 2).join(" ").slice(0, 160),
      ageMin: ages[0],
      ageMax: ages[1],
      readingLevel: `Level ${level} of 4`,
      levelBasis: "estimated from words per page",
      genres: ["picture book"],
      subjects: [],
      pageCount: p.pages.length + 1,
      wordCount: words,
      estMinutes: Math.max(1, Math.round(words / (level <= 2 ? 60 : 90))),
      sourceUrl: mr.url,
      license: "CC BY " + (mr.licUrl.match(/by\/([\d.]+)/)?.[1] || "3.0"),
      licenseUrl: mr.licUrl,
      attribution: `${credits}. From the African Storybook Project${code === "ar" ? " / Global Storybooks" : ""}, licensed ${mr.lic}.`,
      coverPath: `/books/img/${idx}/01.jpg`,
      contentPath: `/books/${slug}.json`,
      layout: "pages",
      verifiedOn: new Date().toISOString().slice(0, 10),
    });
  }
}
fs.writeFileSync(path.join(root, "src/lib/books/manifest-asp.json"), JSON.stringify(manifest));
console.log(
  "stories",
  usedIdx.size,
  "books",
  manifest.length,
  Object.fromEntries(
    ["en", "fr", "ar"].map((c) => [c, manifest.filter((b) => b.language === c).length]),
  ),
);
