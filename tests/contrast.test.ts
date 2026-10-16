import { describe, expect, it } from "vitest";
import fs from "node:fs";

/** WCAG 2.x contrast ratio between two sRGB hex colours. Checks tokens used for text in globals.css. */
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const css = fs.readFileSync("src/app/globals.css", "utf8");
const token = (name: string) => /#[0-9a-fA-F]{6}/.exec(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[0] ?? "")?.[0] ?? (() => { throw new Error(`missing token ${name}`); })();

const PAIRS: [string, string, string][] = [
  ["body text on ivory", token("ink"), token("ivory")],
  ["muted text on ivory", token("ink-soft"), token("ivory")],
  ["muted text on white", token("ink-soft"), "#ffffff"],
  ["link on ivory", token("brand-700"), token("ivory")],
  ["primary button text", "#ffffff", token("brand-700")],
  ["primary button hover text", "#ffffff", token("brand-800")],
  ["accent button text", token("brand-900"), token("sun")],
  ["secondary button on mint hover", token("brand-700"), token("soft-100")],
  ["body text on mint card", token("ink"), token("soft-100")],
  ["badge text", token("brand-900"), token("soft-300")],
  ["plum accent on ivory", token("plum"), token("ivory")],
  ["focus ring on ivory", token("brand-600"), token("ivory")],
  ["peach badge text", "#6e2c0d", "#fbdcc9"],
  ["error alert text", "#6e1f15", "#fbe9e6"],
  ["warning alert text", "#5b2a10", "#fdeee4"],
  ["danger button text", "#ffffff", token("danger")],
  ["info alert text", token("brand-900"), token("soft-100")],
];

describe("colour contrast (WCAG AA 4.5:1 for text)", () => {
  for (const [name, fg, bg] of PAIRS) {
    it(`${name}: ${fg} on ${bg}`, () => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5));
  }
});
