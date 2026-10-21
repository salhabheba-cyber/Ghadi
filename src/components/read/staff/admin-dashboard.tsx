"use client";
import { useState } from "react";
import { useLoad } from "../common";
import { get, patch, post } from "@/lib/read/api";
import type { AdminBookRow, AuditEvent, PlatformStatsData } from "@/lib/read/types";
import {
  AuditTable,
  Banner,
  Bars,
  Secret,
  Stat,
  StaffFrame,
  Tabs,
  btn,
  btn2,
  card,
  input,
  msgOf,
  useAction,
} from "./ui";

type Tab = "schools" | "books" | "audit";
interface SchoolRow {
  id: string;
  name: string;
  join_code: string;
  archived_at: string | null;
  students: number;
  pending: number;
  books_completed: number;
  admins: number;
}

export function AdminDashboard() {
  return (
    <StaffFrame area="admin" title="Ghadi platform administration">
      {() => <Inner />}
    </StaffFrame>
  );
}

function Inner() {
  const [tab, setTab] = useState<Tab>("schools");
  return (
    <>
      <Tabs
        tabs={[
          { id: "schools", label: "Schools" },
          { id: "books", label: "Library" },
          { id: "audit", label: "Activity log" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "schools" ? <Schools /> : tab === "books" ? <Books /> : <Audit />}
    </>
  );
}

function Schools() {
  const { data, error, loading, reload } = useLoad(
    () => get<{ stats: PlatformStatsData }>("admin/overview"),
    [],
  );
  const a = useAction();
  const [name, setName] = useState("");
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inv, setInv] = useState({ email: "", name: "" });
  const [link, setLink] = useState<string | null>(null);
  if (loading && !data) return <p className="text-[var(--muted)]">Loading…</p>;
  if (error || !data) return <Banner tone="error">{msgOf(error)}</Banner>;
  const s = data.stats;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Schools" value={s.schools} />
        <Stat
          label="Active students"
          value={s.students.active}
          hint={s.students.pending ? `${s.students.pending} pending` : undefined}
        />
        <Stat label="Books finished (verified)" value={s.booksCompleted} />
        <Stat label="Readers in the last 7 days" value={s.activeReadersLast7Days} />
      </div>
      <Banner>
        This page shows counts only. Platform administrators cannot see students&apos; names or
        reading histories; school staff manage those.
      </Banner>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className={`${card} overflow-x-auto`}>
          <h2 className="mb-2 font-bold">Schools</h2>
          {s.perSchool.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No schools yet. Create the first one.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                  <th className="py-2 text-start">School</th>
                  <th className="text-start">Students</th>
                  <th className="text-start">Books</th>
                  <th className="text-start">Admins</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(s.perSchool as SchoolRow[]).map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)]">
                    <td className="py-2 font-medium" dir="auto">
                      {r.name}
                      {r.archived_at ? (
                        <em className="ms-2 text-xs font-normal">archived</em>
                      ) : null}
                    </td>
                    <td>
                      {r.students}
                      {r.pending ? ` (+${r.pending})` : ""}
                    </td>
                    <td>{r.books_completed}</td>
                    <td>{r.admins}</td>
                    <td className="space-x-2 whitespace-nowrap py-2 text-end">
                      <button
                        className={btn2}
                        onClick={() => {
                          setInviteFor(r.id);
                          setLink(null);
                        }}
                      >
                        Invite admin
                      </button>
                      <button
                        className={btn2}
                        onClick={() =>
                          a.run(async () => {
                            await patch(`admin/schools/${r.id}`, { archived: !r.archived_at });
                            reload();
                          })
                        }
                      >
                        {r.archived_at ? "Restore" : "Archive"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {inviteFor ? (
            <form
              className="mt-4 grid gap-2 rounded-xl border border-brand-400 p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await a.run(() =>
                  post<{ invitePath: string }>(`admin/schools/${inviteFor}/invite`, inv),
                );
                if (r) {
                  setLink(`${window.location.origin}${r.invitePath}`);
                  reload();
                }
              }}
            >
              <h3 className="font-semibold">Invite a school administrator</h3>
              <input
                className={input}
                type="email"
                required
                placeholder="Email"
                aria-label="Email"
                value={inv.email}
                onChange={(e) => setInv({ ...inv, email: e.target.value })}
              />
              <input
                className={input}
                required
                placeholder="Name"
                aria-label="Name"
                value={inv.name}
                onChange={(e) => setInv({ ...inv, name: e.target.value })}
              />
              <div className="flex gap-2">
                <button className={btn} disabled={a.busy}>
                  Create invitation link
                </button>
                <button type="button" className={btn2} onClick={() => setInviteFor(null)}>
                  Close
                </button>
              </div>
              {link ? (
                <Secret
                  label="Invitation link"
                  value={link}
                  note="Valid for 7 days, one use. Send it yourself: Ghadi does not send email."
                />
              ) : null}
            </form>
          ) : null}
        </section>
        <div className="flex flex-col gap-4">
          <section className={card}>
            <h2 className="mb-2 font-bold">New school</h2>
            <form
              className="grid gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await a.run(() => post("admin/schools", { name }), "School created");
                if (r) {
                  setName("");
                  reload();
                }
              }}
            >
              <input
                className={input}
                required
                placeholder="School name"
                aria-label="School name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className={btn} disabled={a.busy}>
                Create school
              </button>
            </form>
            {a.error ? (
              <div className="mt-2">
                <Banner tone="error">{a.error}</Banner>
              </div>
            ) : null}
            {a.ok ? (
              <div className="mt-2">
                <Banner tone="ok">{a.ok}</Banner>
              </div>
            ) : null}
          </section>
          <section className={card}>
            <h2 className="mb-2 font-bold">Library</h2>
            <Bars
              label="Published books"
              rows={s.catalog.map((r) => ({ key: r.language.toUpperCase(), n: r.n }))}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function Books() {
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState("");
  const { data, error, loading, reload } = useLoad(
    () =>
      get<{ total: number; books: AdminBookRow[] }>(
        `admin/books?${new URLSearchParams({ limit: "40", ...(q ? { q } : {}), ...(language ? { language } : {}) })}`,
      ),
    [q, language],
  );
  const a = useAction();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--muted)]">
        Hide a book to remove it from search and suggestions for every school (for example if its
        license is in doubt). Hidden books stay in the catalog and can be shown again.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${input} max-w-xs`}
          placeholder="Search title or author"
          aria-label="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={`${input} w-auto`}
          aria-label="Language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="">All languages</option>
          <option value="ar">العربية</option>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </div>
      {a.error ? <Banner tone="error">{a.error}</Banner> : null}
      <div className={`${card} overflow-x-auto p-0`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
              <th className="p-3 text-start">Title</th>
              <th className="text-start">Lang</th>
              <th className="text-start">Ages</th>
              <th className="text-start">Source / license</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td className="p-3" colSpan={5}>
                  {msgOf(error)}
                </td>
              </tr>
            ) : (
              data?.books.map((b) => (
                <tr key={b.id} className="border-b border-[var(--border)]">
                  <td className="p-3" dir="auto">
                    <span className="font-medium">{b.title}</span>
                    <span className="block text-xs text-[var(--muted)]">{b.author}</span>
                  </td>
                  <td>{b.language.toUpperCase()}</td>
                  <td>
                    {b.age_min}–{b.age_max}
                  </td>
                  <td className="text-xs">
                    <a
                      className="underline"
                      href={b.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {b.source}
                    </a>{" "}
                    · {b.license}
                  </td>
                  <td className="pe-3 text-end">
                    <button
                      className={btn2}
                      onClick={() =>
                        a.run(async () => {
                          await patch(`admin/books/${b.id}`, { hidden: b.status === "published" });
                          reload();
                        })
                      }
                    >
                      {b.status === "published" ? "Hide" : "Show"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {data ? (
        <p className="text-xs text-[var(--muted)]">
          Showing {data.books.length} of {data.total}.
        </p>
      ) : null}
    </div>
  );
}

function Audit() {
  const { data, error, loading } = useLoad(() => get<{ events: AuditEvent[] }>("admin/audit"), []);
  return (
    <section className={card}>
      <h2 className="mb-3 font-bold">Activity across schools</h2>
      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <Banner tone="error">{msgOf(error)}</Banner>
      ) : (
        <AuditTable events={data?.events ?? []} />
      )}
    </section>
  );
}
