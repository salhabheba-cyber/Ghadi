import { describe, expect, it } from "vitest";
import { parseAgenda } from "@/lib/agenda/parse";

describe("agenda text parsing (never invents dates)", () => {
  it("reads unambiguous dates in several formats", () => {
    const r = parseAgenda("Math worksheet 2026-10-20\nBring paints - 21 October 2026\nSpelling test Oct 22, 2026\nLe 3 novembre 2026 sortie");
    expect(r.map((x) => x.dueOn)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22", "2026-11-03"]);
    expect(r.every((x) => !x.ambiguous)).toBe(true);
    expect(r[1]!.title).toBe("Bring paints");
  });
  it("flags day/month order when it could be either", () => {
    const r = parseAgenda("Reading log 03/04/2026");
    expect(r[0]).toMatchObject({ dueOn: "2026-04-03", ambiguous: true });
    expect(parseAgenda("Trip 25/04/2026")[0]).toMatchObject({ dueOn: "2026-04-25", ambiguous: false });
  });
  it("keeps lines without a full date as undated items instead of guessing", () => {
    const r = parseAgenda("Science project due Friday\nArt on 12/10\nHomework 31 Feb 2026");
    expect(r.map((x) => x.dueOn)).toEqual([null, null, null]);
  });
  it("skips empty and tiny lines, and caps the number of items", () => {
    expect(parseAgenda("\n  \n-\nok\n")).toHaveLength(0);
    expect(parseAgenda(Array.from({ length: 80 }, (_, i) => `Task number ${i} 2026-11-01`).join("\n"))).toHaveLength(30);
  });
  it("ignores impossible dates", () => {
    expect(parseAgenda("Test 2026-13-40")[0]!.dueOn).toBeNull();
  });
});
