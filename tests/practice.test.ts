import { describe, expect, it } from "vitest";
import { getPool } from "@/lib/db";
import { deleteLearningData, exportChildData } from "@/lib/repo/children";
import { EntitlementError, ensureSubscription } from "@/lib/repo/billing";
import { getText, listTexts, practiceSummary, submitDictation, submitReading } from "@/lib/repo/practice";
import { ensureSeed, makeChild, makeParent } from "./helpers";

async function setup() {
  await ensureSeed();
  const p = await makeParent("prac");
  const c = await makeChild(p.id);
  const texts = (await listTexts(p.id, c.id, "dictation"))!;
  return { p, c, texts };
}

describe("dictation and reading practice", () => {
  it("lists only approved texts in the child's language", async () => {
    const { p, c, texts } = await setup();
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((t) => t.language === "en")).toBe(true);
    const fr = await makeChild(p.id, { lessonLanguage: "fr" });
    expect((await listTexts(p.id, fr.id, "dictation"))!.length).toBe(0); // FR texts are still in_review
    expect(c.id).toBeTruthy();
  });

  it("scores a dictation, stores the attempt and shows it in the summary and export", async () => {
    const { p, c, texts } = await setup();
    const t = texts.find((x) => x.slug === "dictation-red-bird")!;
    const r = await submitDictation(p.id, c.id, t.id, "a red brid can fly");
    expect(r?.correctWords).toBe(4);
    expect(r?.items.map((i) => i.kind)).toContain("misspelled");
    expect((await practiceSummary(p.id, c.id))!.dictation).toHaveLength(1);
    expect((await exportChildData(p.id, c.id))!.dictationAttempts).toHaveLength(1);
  });

  it("another parent cannot read texts for, or write attempts to, this child", async () => {
    const { c, texts } = await setup();
    const other = await makeParent("other");
    expect(await listTexts(other.id, c.id, "dictation")).toBeNull();
    expect(await submitDictation(other.id, c.id, texts[0]!.id, "x")).toBeNull();
    expect(await getText(other.id, c.id, texts[0]!.id, "dictation")).toBeNull();
    expect(await submitReading(other.id, c.id, texts[0]!.id, [])).toBe(false);
  });

  it("validates reading marks and stores guardian-assessed attempts", async () => {
    const { p, c } = await setup();
    const t = (await listTexts(p.id, c.id, "reading"))![0]!;
    expect(await submitReading(p.id, c.id, t.id, [{ i: 0, status: "wow" }])).toBe(false); // bad status
    expect(await submitReading(p.id, c.id, t.id, [{ i: 999, status: "ok" }])).toBe(false); // word index out of range
    expect(await submitReading(p.id, c.id, t.id, "not an array")).toBe(false);
    expect(await submitReading(p.id, c.id, t.id, [{ i: 0, status: "ok" }, { i: 1, status: "help" }])).toBe(true);
    expect((await practiceSummary(p.id, c.id))!.reading).toHaveLength(1);
  });

  it("rejects oversize input and respects the subscription gate", async () => {
    const { p, c, texts } = await setup();
    expect(await submitDictation(p.id, c.id, texts[0]!.id, "x".repeat(1001))).toBeNull();
    await ensureSubscription(p.id);
    await getPool().query(`UPDATE subscriptions SET trial_ends_at = now() - interval '1 minute' WHERE user_id=$1`, [p.id]);
    await expect(submitDictation(p.id, c.id, texts[0]!.id, "the cat")).rejects.toBeInstanceOf(EntitlementError);
  });

  it("deleting learning data removes practice attempts too", async () => {
    const { p, c, texts } = await setup();
    await submitDictation(p.id, c.id, texts[0]!.id, "the cat sat");
    expect(await deleteLearningData(p.id, c.id)).toBe(true);
    expect((await practiceSummary(p.id, c.id))!.dictation).toHaveLength(0);
  });
});
