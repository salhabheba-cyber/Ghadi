import { describe, expect, it } from "vitest";
import {
  allTags,
  filterLibrary,
  parseTags,
  type LibraryItem,
  type LibraryFilter,
} from "@/lib/library";

const mk = (over: Partial<LibraryItem>): LibraryItem => ({
  key: "k",
  id: "i",
  type: "note",
  title: "T",
  subtitle: "",
  tags: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  searchText: "t",
  ...over,
});
const base: LibraryFilter = {
  query: "",
  types: [],
  collectionId: "all",
  tag: "all",
  sort: "recent",
};
const items = [
  mk({
    key: "a",
    id: "a",
    title: "Photosynthesis",
    type: "document",
    tags: ["bio"],
    searchText: "photosynthesis bio",
    updatedAt: "2026-03-01T00:00:00.000Z",
    collectionId: "c1",
  }),
  mk({
    key: "b",
    id: "b",
    title: "Cell notes",
    type: "note",
    tags: ["bio", "exam"],
    searchText: "cell notes bio exam",
    updatedAt: "2026-02-01T00:00:00.000Z",
  }),
  mk({
    key: "c",
    id: "c",
    title: "algebra quiz",
    type: "quiz",
    searchText: "algebra quiz",
    updatedAt: "2026-04-01T00:00:00.000Z",
  }),
];

describe("library filtering", () => {
  it("searches all terms, case-insensitively", () => {
    expect(filterLibrary(items, { ...base, query: "BIO exam" }).map((i) => i.id)).toEqual(["b"]);
  });
  it("filters by type, collection and tag", () => {
    expect(filterLibrary(items, { ...base, types: ["quiz", "note"] })).toHaveLength(2);
    expect(filterLibrary(items, { ...base, collectionId: "c1" }).map((i) => i.id)).toEqual(["a"]);
    expect(
      filterLibrary(items, { ...base, collectionId: "none" })
        .map((i) => i.id)
        .sort(),
    ).toEqual(["b", "c"]);
    expect(filterLibrary(items, { ...base, tag: "exam" }).map((i) => i.id)).toEqual(["b"]);
  });
  it("sorts by recency, title and type", () => {
    expect(filterLibrary(items, base).map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(filterLibrary(items, { ...base, sort: "title" }).map((i) => i.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
    expect(filterLibrary(items, { ...base, sort: "type" }).map((i) => i.type)).toEqual([
      "document",
      "note",
      "quiz",
    ]);
  });
  it("does not mutate its input", () => {
    const copy = [...items];
    filterLibrary(items, { ...base, sort: "title" });
    expect(items).toEqual(copy);
  });
});

describe("tags", () => {
  it("collects unique sorted tags", () => expect(allTags(items)).toEqual(["bio", "exam"]));
  it("parses user input: trims, lowercases, dedupes, limits", () => {
    expect(parseTags(" Bio, exam ,bio,, ")).toEqual(["bio", "exam"]);
    expect(parseTags("x".repeat(100))[0]).toHaveLength(40);
    expect(parseTags(Array.from({ length: 50 }, (_, i) => `t${i}`).join(","))).toHaveLength(30);
  });
});
