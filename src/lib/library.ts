export type ItemType = "document" | "note" | "quiz" | "deck";

export interface LibraryItem {
  key: string;
  id: string;
  type: ItemType;
  title: string;
  subtitle: string;
  tags: string[];
  collectionId?: string;
  updatedAt: string;
  createdAt: string;
  searchText: string;
}

export type SortKey = "recent" | "oldest" | "title" | "type";

export interface LibraryFilter {
  query: string;
  types: ItemType[];
  collectionId: string | "none" | "all";
  tag: string | "all";
  sort: SortKey;
}

export const TYPE_LABEL: Record<ItemType, string> = {
  document: "Document",
  note: "Note",
  quiz: "Quiz",
  deck: "Deck",
};

export function filterLibrary(items: LibraryItem[], f: LibraryFilter): LibraryItem[] {
  const q = f.query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const out = items.filter((i) => {
    if (f.types.length > 0 && !f.types.includes(i.type)) return false;
    if (f.collectionId === "none" && i.collectionId) return false;
    if (f.collectionId !== "all" && f.collectionId !== "none" && i.collectionId !== f.collectionId)
      return false;
    if (f.tag !== "all" && !i.tags.includes(f.tag)) return false;
    return terms.every((t) => i.searchText.includes(t));
  });
  const cmp: Record<SortKey, (a: LibraryItem, b: LibraryItem) => number> = {
    recent: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
    title: (a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
    type: (a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title),
  };
  return out.sort(cmp[f.sort]);
}

export function allTags(items: LibraryItem[]): string[] {
  return Array.from(new Set(items.flatMap((i) => i.tags))).sort((a, b) => a.localeCompare(b));
}

export function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .map((t) => t.slice(0, 40)),
    ),
  ).slice(0, 30);
}
