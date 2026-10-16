import { describe, expect, it } from "vitest";
import { addItem, confirmItem, listItems, proposeFromText, removeItem, setStatus } from "@/lib/repo/agenda";
import { exportChildData } from "@/lib/repo/children";
import { makeChild, makeParent } from "./helpers";

describe("study planner", () => {
  it("proposed items are unconfirmed until a parent confirms, and dates are never invented", async () => {
    const p = await makeParent("ag"), c = await makeChild(p.id);
    expect(await proposeFromText(p.id, c.id, "Math sheet 2026-11-02\nBring a book on Friday")).toBe(2);
    let items = (await listItems(p.id, c.id))!;
    expect(items.every((i) => !i.confirmed && i.source === "extracted")).toBe(true);
    expect(items.find((i) => i.title === "Bring a book on Friday")!.dueOn).toBeNull();
    expect(await setStatus(p.id, items[0]!.id, "done")).toBe(false); // cannot complete an unconfirmed suggestion
    expect(await confirmItem(p.id, items[0]!.id, { title: items[0]!.title, dueOn: "2026-11-03" })).toBe(true);
    items = (await listItems(p.id, c.id))!;
    expect(items.find((i) => i.confirmed)!.dueOn).toBe("2026-11-03");
    expect(await setStatus(p.id, items.find((i) => i.confirmed)!.id, "done")).toBe(true);
  });
  it("validates manual input", async () => {
    const p = await makeParent("ag2"), c = await makeChild(p.id);
    expect(await addItem(p.id, c.id, { title: "", dueOn: null })).toBe(false);
    expect(await addItem(p.id, c.id, { title: "ok", dueOn: "2026-02-31" })).toBe(false);
    expect(await addItem(p.id, c.id, { title: "x".repeat(161) })).toBe(false);
    expect(await addItem(p.id, c.id, { title: "Read pages 4-5", dueOn: "2026-11-10" })).toBe(true);
    expect((await exportChildData(p.id, c.id))!.agendaItems).toHaveLength(1);
  });
  it("another parent cannot read, add, confirm, update or delete", async () => {
    const a = await makeParent("agA"), b = await makeParent("agB");
    const ca = await makeChild(a.id);
    await proposeFromText(a.id, ca.id, "Test 2026-12-01");
    const item = (await listItems(a.id, ca.id))![0]!;
    expect(await listItems(b.id, ca.id)).toBeNull();
    expect(await addItem(b.id, ca.id, { title: "intruder" })).toBe(false);
    expect(await proposeFromText(b.id, ca.id, "x 2026-12-01")).toBeNull();
    expect(await confirmItem(b.id, item.id, { title: "t" })).toBe(false);
    expect(await removeItem(b.id, item.id)).toBe(false);
    expect(await removeItem(a.id, item.id)).toBe(true);
  });
});
