import fs from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { ICONS, ICON_VERSION } from "@/lib/brand";

const PUBLIC = path.join(__dirname, "..", "..", "public");

/** Minimal PNG decoder (8-bit, non-interlaced RGB/RGBA): enough to inspect pixels without a native dep. */
function decode(file: string) {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  let off = 8;
  let w = 0,
    h = 0,
    ct = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      ct = data[9]!;
      expect(data[8]).toBe(8);
      expect(data[12]).toBe(0);
    }
    if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * bpp);
  const stride = w * bpp;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? px[y * stride + x - bpp]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[y * stride + x] =
        (v + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth)) & 255;
    }
  }
  const at = (x: number, y: number) => {
    const i = (y * w + x) * bpp;
    return { r: px[i]!, g: px[i + 1]!, b: px[i + 2]!, a: bpp === 4 ? px[i + 3]! : 255 };
  };
  return { w, h, at, hasAlpha: bpp === 4 };
}

const fileFor = (url: string) => path.join(PUBLIC, url.split("?")[0]!);

describe("brand icons and web app manifest", () => {
  const m = manifest();

  it("names the app Ghadi and declares installable PWA fields", () => {
    expect(m.short_name).toBe("Ghadi");
    expect(m.name).toMatch(/^Ghadi/);
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.id).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("every manifest icon exists, is a real PNG of the declared size and carries a version", () => {
    for (const icon of m.icons ?? []) {
      expect(icon.src).toContain(`?v=${ICON_VERSION}`);
      expect(icon.type).toBe("image/png");
      const img = decode(fileFor(icon.src));
      expect(`${img.w}x${img.h}`).toBe(icon.sizes);
    }
  });

  it("has 192 and 512 'any' icons plus a 512 maskable icon", () => {
    const find = (sizes: string, purpose: string) =>
      (m.icons ?? []).find((i) => i.sizes === sizes && i.purpose === purpose);
    expect(find("192x192", "any")).toBeTruthy();
    expect(find("512x512", "any")).toBeTruthy();
    expect(find("512x512", "maskable")).toBeTruthy();
  });

  it("'any' icons have transparent rounded corners (no white box on the home screen)", () => {
    for (const url of [ICONS.any192, ICONS.any512]) {
      const img = decode(fileFor(url));
      expect(img.hasAlpha).toBe(true);
      for (const [x, y] of [
        [0, 0],
        [img.w - 1, 0],
        [0, img.h - 1],
        [img.w - 1, img.h - 1],
      ] as const)
        expect(img.at(x, y).a).toBe(0);
      expect(img.at(img.w >> 1, img.h >> 1).a).toBe(255);
    }
  });

  it("the maskable icon is fully opaque and purple to its edges, so Android's mask never shows white", () => {
    const img = decode(fileFor(ICONS.maskable512));
    for (const [x, y] of [
      [0, 0],
      [img.w - 1, 0],
      [0, img.h - 1],
      [img.w - 1, img.h - 1],
      [img.w >> 1, 0],
      [0, img.h >> 1],
    ] as const) {
      const p = img.at(x, y);
      expect(p.a).toBe(255);
      expect(p.b).toBeGreaterThan(200); // purple/blue, not white (r,g,b all high) or hair
      expect(p.g).toBeLessThan(170);
    }
  });

  it("the Apple touch icon is opaque 180x180 (iOS fills transparency with black)", () => {
    const img = decode(fileFor(ICONS.apple180));
    expect([img.w, img.h]).toEqual([180, 180]);
    expect(img.at(0, 0).a).toBe(255);
  });

  it("the in-app logo file exists", () => {
    expect(fs.statSync(path.join(PUBLIC, "ghadi-logo-128.webp")).size).toBeGreaterThan(1000);
  });
});
