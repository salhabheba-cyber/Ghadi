"use client";
import { FolderPlus, Library, Pencil, Search, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  useConfirm,
  useToast,
} from "@/components/ui/primitives";
import { useLive } from "@/hooks/use-live";
import {
  allTags,
  filterLibrary,
  parseTags,
  TYPE_LABEL,
  type ItemType,
  type LibraryItem,
  type SortKey,
} from "@/lib/library";
import { getDb } from "@/lib/storage/db";
import {
  createCollection,
  deleteCollection,
  deleteDeck,
  deleteDocument,
  deleteGuide,
  deleteNote,
  deleteQuiz,
  renameCollection,
} from "@/lib/storage/repo";
import { errorMessage, formatDate } from "@/lib/utils";

const HREF: Record<ItemType, string> = {
  document: "/documents",
  guide: "/study",
  note: "/notes",
  quiz: "/quizzes",
  deck: "/flashcards",
};
const TABLE = {
  document: "documents",
  guide: "guides",
  note: "notes",
  quiz: "quizzes",
  deck: "decks",
} as const;

export default function LibraryPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { data, error } = useLive(async () => {
    const db = getDb();
    const [documents, guides, notes, quizzes, decks, collections] = await Promise.all([
      db.documents.toArray(),
      db.guides.toArray(),
      db.notes.toArray(),
      db.quizzes.toArray(),
      db.decks.toArray(),
      db.collections.toArray(),
    ]);
    const items: LibraryItem[] = [
      ...documents.map((d) => ({
        key: `document:${d.id}`,
        id: d.id,
        type: "document" as const,
        title: d.title,
        subtitle: `${d.kind.toUpperCase()} · ${d.wordCount.toLocaleString()} words`,
        tags: d.tags,
        collectionId: d.collectionId,
        updatedAt: d.updatedAt,
        createdAt: d.createdAt,
        searchText: `${d.title} ${d.tags.join(" ")} ${d.text.slice(0, 2000)}`.toLowerCase(),
      })),
      ...guides.map((g) => ({
        key: `guide:${g.id}`,
        id: g.id,
        type: "guide" as const,
        title: g.title,
        subtitle: `${g.sections.length} sections`,
        tags: g.tags,
        collectionId: g.collectionId,
        updatedAt: g.updatedAt,
        createdAt: g.createdAt,
        searchText: `${g.title} ${g.overview} ${g.tags.join(" ")}`.toLowerCase(),
      })),
      ...notes.map((n) => ({
        key: `note:${n.id}`,
        id: n.id,
        type: "note" as const,
        title: n.title,
        subtitle: n.summary.slice(0, 100),
        tags: n.tags,
        collectionId: n.collectionId,
        updatedAt: n.updatedAt,
        createdAt: n.createdAt,
        searchText:
          `${n.title} ${n.summary} ${n.keyConcepts.join(" ")} ${n.tags.join(" ")}`.toLowerCase(),
      })),
      ...quizzes.map((q) => ({
        key: `quiz:${q.id}`,
        id: q.id,
        type: "quiz" as const,
        title: q.title,
        subtitle: `${q.questions.length} questions`,
        tags: q.tags,
        collectionId: q.collectionId,
        updatedAt: q.updatedAt,
        createdAt: q.createdAt,
        searchText: `${q.title} ${q.tags.join(" ")}`.toLowerCase(),
      })),
      ...decks.map((d) => ({
        key: `deck:${d.id}`,
        id: d.id,
        type: "deck" as const,
        title: d.title,
        subtitle: d.description,
        tags: d.tags,
        collectionId: d.collectionId,
        updatedAt: d.updatedAt,
        createdAt: d.createdAt,
        searchText: `${d.title} ${d.description} ${d.tags.join(" ")}`.toLowerCase(),
      })),
    ];
    return { items, collections };
  }, []);

  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<ItemType[]>([]);
  const [collectionId, setCollectionId] = useState<string>("all");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagTarget, setTagTarget] = useState<LibraryItem | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [colDialog, setColDialog] = useState<{ id?: string; name: string } | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const shown = useMemo(
    () => filterLibrary(items, { query, types, collectionId, tag, sort }),
    [items, query, types, collectionId, tag, sort],
  );
  const colName = new Map((data?.collections ?? []).map((c) => [c.id, c.name]));

  async function setItemField(
    item: LibraryItem,
    patch: { collectionId?: string | undefined; tags?: string[] },
  ) {
    const t = getDb()[TABLE[item.type]] as unknown as {
      update: (id: string, changes: object) => Promise<number>;
    };
    await t.update(item.id, { ...patch, updatedAt: new Date().toISOString() });
  }
  async function bulkDelete() {
    const ok = await confirm({
      title: `Delete ${selected.size} item(s)?`,
      message: "They will be removed from this device. This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      for (const key of selected) {
        const [type, id] = key.split(":") as [ItemType, string];
        if (type === "document") await deleteDocument(id);
        else if (type === "guide") await deleteGuide(id);
        else if (type === "note") await deleteNote(id);
        else if (type === "quiz") await deleteQuiz(id);
        else await deleteDeck(id);
      }
      setSelected(new Set());
      toast("Deleted.", "good");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function saveCollection() {
    if (!colDialog) return;
    try {
      if (colDialog.id) await renameCollection(colDialog.id, colDialog.name);
      else await createCollection(colDialog.name);
      setColDialog(null);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  const tags = allTags(items);
  const toggleType = (t: ItemType) =>
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <>
      <PageHeader
        title="My Library"
        description="Everything you have imported or created, in one place."
        actions={
          <Button variant="secondary" onClick={() => setColDialog({ name: "" })}>
            <FolderPlus className="h-4 w-4" aria-hidden /> New collection
          </Button>
        }
      />
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]"
            aria-hidden
          />
          <Input
            aria-label="Search library"
            placeholder="Search titles, tags and text…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="recent">Recently updated</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A–Z</option>
          <option value="type">Type</option>
        </Select>
        <Select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="all">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(TYPE_LABEL) as ItemType[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={types.includes(t)}
            onClick={() => toggleType(t)}
            className={`rounded-full border px-3 py-1 text-sm ${types.includes(t) ? "border-brand-600 bg-brand-600 text-white" : "border-[var(--border)] hover:bg-[var(--surface-2)]"}`}
          >
            {TYPE_LABEL[t]}s
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
        <Select
          aria-label="Collection"
          className="!w-auto"
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
        >
          <option value="all">All collections</option>
          <option value="none">No collection</option>
          {data?.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {collectionId !== "all" && collectionId !== "none" ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Rename collection"
              onClick={() =>
                setColDialog({ id: collectionId, name: colName.get(collectionId) ?? "" })
              }
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Delete collection"
              onClick={async () => {
                if (
                  await confirm({
                    title: "Delete collection?",
                    message: "Items inside are kept; they just leave the collection.",
                    confirmLabel: "Delete",
                    danger: true,
                  })
                ) {
                  await deleteCollection(collectionId);
                  setCollectionId("all");
                }
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </>
        ) : null}
        {selected.size > 0 ? (
          <Button size="sm" variant="danger" className="ml-auto" onClick={() => void bulkDelete()}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete {selected.size} selected
          </Button>
        ) : null}
      </div>

      {data && items.length === 0 ? (
        <EmptyState
          icon={<Library className="h-8 w-8" />}
          title="Your library is empty"
          action={
            <Link href="/documents" className="text-brand-600 underline dark:text-brand-400">
              Add a document
            </Link>
          }
        >
          Imported documents and everything made from them will appear here.
        </EmptyState>
      ) : null}
      {items.length > 0 && shown.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nothing matches these filters.</p>
      ) : null}

      <ul className="space-y-2">
        {shown.map((i) => (
          <li
            key={i.key}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <input
              type="checkbox"
              aria-label={`Select ${i.title}`}
              checked={selected.has(i.key)}
              onChange={(e) =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (e.target.checked) n.add(i.key);
                  else n.delete(i.key);
                  return n;
                })
              }
            />
            <Link href={`${HREF[i.type]}/${i.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                <Badge tone="brand">{TYPE_LABEL[i.type]}</Badge>
                {i.collectionId && colName.get(i.collectionId) ? (
                  <Badge>{colName.get(i.collectionId)}</Badge>
                ) : null}
                {i.tags.map((t) => (
                  <Badge key={t}>#{t}</Badge>
                ))}
                <span>{formatDate(i.updatedAt)}</span>
              </p>
            </Link>
            <Select
              aria-label={`Collection for ${i.title}`}
              className="!w-36 shrink-0"
              value={i.collectionId ?? ""}
              onChange={(e) => void setItemField(i, { collectionId: e.target.value || undefined })}
            >
              <option value="">No collection</option>
              {data?.collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Edit tags for ${i.title}`}
              onClick={() => {
                setTagTarget(i);
                setTagInput(i.tags.join(", "));
              }}
            >
              <Tag className="h-4 w-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={tagTarget !== null} onClose={() => setTagTarget(null)} title="Edit tags">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (tagTarget)
              void setItemField(tagTarget, { tags: parseTags(tagInput) })
                .then(() => setTagTarget(null))
                .catch((er) => toast(errorMessage(er), "error"));
          }}
          className="space-y-3"
        >
          <Field label="Tags, separated by commas">
            {(id) => (
              <Input id={id} value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTagTarget(null)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={colDialog !== null}
        onClose={() => setColDialog(null)}
        title={colDialog?.id ? "Rename collection" : "New collection"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveCollection();
          }}
          className="space-y-3"
        >
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                required
                maxLength={100}
                value={colDialog?.name ?? ""}
                onChange={(e) => setColDialog((c) => (c ? { ...c, name: e.target.value } : c))}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setColDialog(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!colDialog?.name.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
