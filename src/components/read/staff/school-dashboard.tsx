"use client";
import { useState } from "react";
import { BoardList, useLoad, type BoardData } from "../common";
import { del, get, patch, post, put } from "@/lib/read/api";
import type { AuditEvent, SchoolStatsData, StudentReadingRow } from "@/lib/read/types";
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
  btnDanger,
  card,
  input,
  msgOf,
  useAction,
  type StaffActor,
} from "./ui";

interface ClassRow {
  id: string;
  name: string;
  grade: string;
  archived_at: string | null;
  students: number;
}
interface Challenge {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  prizes: Record<string, string>;
  archived_at?: string | null;
}
interface SchoolData {
  school: {
    id: string;
    name: string;
    nameFormat: string;
    leaderboardEnabled: boolean;
    classLeaderboardEnabled: boolean;
    requireApproval: boolean;
    pinPolicy: string;
    joinCode: string;
  };
  classes: ClassRow[];
  challenges: Challenge[];
  stats: SchoolStatsData;
  canAdminister: boolean;
}
type Tab = "overview" | "students" | "board" | "classes" | "settings" | "staff" | "audit";

export function SchoolDashboard() {
  return (
    <StaffFrame area="school" title="School reading dashboard">
      {(actor) => <Inner actor={actor} />}
    </StaffFrame>
  );
}

function Inner({ actor }: { actor: StaffActor }) {
  const [tab, setTab] = useState<Tab>("overview");
  const { data, error, loading, reload } = useLoad(() => get<SchoolData>("school"), []);
  if (loading && !data) return <p className="text-[var(--muted)]">Loading…</p>;
  if (error || !data) return <Banner tone="error">{msgOf(error)}</Banner>;
  const admin = data.canAdminister;
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "students", label: "Students" },
    { id: "board", label: "Leaderboard & prizes" },
    ...(admin
      ? ([
          { id: "classes", label: "Classes" },
          { id: "settings", label: "Settings" },
          { id: "staff", label: "Teachers" },
          { id: "audit", label: "Activity log" },
        ] as { id: Tab; label: string }[])
      : []),
  ];
  return (
    <>
      <p className="-mt-3 mb-4 text-[var(--muted)]">
        {data.school.name}
        {actor.classIds ? " · your classes only" : ""}
      </p>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "overview" ? <Overview d={data} /> : null}
      {tab === "students" ? <Students d={data} actor={actor} /> : null}
      {tab === "board" ? <BoardAdmin d={data} actor={actor} reload={reload} /> : null}
      {tab === "classes" && admin ? <Classes d={data} reload={reload} /> : null}
      {tab === "settings" && admin ? <Settings d={data} reload={reload} /> : null}
      {tab === "staff" && admin ? <StaffTab d={data} /> : null}
      {tab === "audit" && admin ? <Audit /> : null}
    </>
  );
}

function Overview({ d }: { d: SchoolData }) {
  const s = d.stats;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Active students"
          value={s.students.active}
          hint={s.students.pending ? `${s.students.pending} waiting for approval` : undefined}
        />
        <Stat
          label="Books finished (verified)"
          value={s.booksCompleted}
          hint={`${s.booksCompletedThisMonth} this month`}
        />
        <Stat label="Readers in the last 30 days" value={s.activeReadersLast30Days} />
        <Stat label="Average books per student" value={s.averageBooksPerStudent} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <section className={card}>
          <h2 className="mb-2 font-bold">Finished books by language</h2>
          <Bars
            label="By language"
            rows={s.byLanguage.map((r) => ({ key: r.language.toUpperCase(), n: r.n }))}
          />
        </section>
        <section className={card}>
          <h2 className="mb-2 font-bold">Most finished books</h2>
          <Bars label="Top books" rows={s.topBooks.map((r) => ({ key: r.title, n: r.n }))} />
        </section>
        <section className={card}>
          <h2 className="mb-2 font-bold">Finished per month</h2>
          <Bars label="Per month" rows={s.perMonth.map((r) => ({ key: r.month, n: r.n }))} />
        </section>
      </div>
      <Banner>
        Counts include only verified completions: 90% read, enough real reading time, and a passed
        comprehension check (or a teacher award). Voided records are excluded.
      </Banner>
    </div>
  );
}

interface StudentRow {
  id: string;
  display_name: string;
  nickname: string | null;
  age: number;
  language: string;
  status: string;
  id_hint: string;
  class_id: string | null;
  class_name: string | null;
  grade: string | null;
  has_pin: boolean;
  last_login_at: string | null;
  completed?: number;
}

function Students({ d, actor }: { d: SchoolData; actor: StaffActor }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [classId, setClassId] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useLoad(
    () =>
      get<{ students: StudentRow[] }>(
        `school/students?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(classId ? { classId } : {}) })}`,
      ),
    [q, status, classId],
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          className={`${input} max-w-xs`}
          placeholder="Search by name"
          aria-label="Search students"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={`${input} w-auto`}
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Any status</option>
          {["pending", "active", "disabled", "archived"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className={`${input} w-auto`}
          aria-label="Class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">All classes</option>
          {d.classes
            .filter((c) => !c.archived_at)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.grade ? `${c.grade} · ` : ""}
                {c.name}
              </option>
            ))}
        </select>
        {d.canAdminister || actor.role === "teacher" ? (
          <button className={`${btn} ms-auto`} onClick={() => setAdding(true)}>
            Add a student
          </button>
        ) : null}
      </div>
      {adding ? (
        <AddStudent
          d={d}
          onClose={() => {
            setAdding(false);
            list.reload();
          }}
        />
      ) : null}
      <div className={`${card} overflow-x-auto p-0`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
              <th className="p-3 text-start">Name</th>
              <th className="text-start">Class</th>
              <th className="text-start">Age</th>
              <th className="text-start">Lang</th>
              <th className="text-start">Status</th>
              <th className="text-start">ID ends</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.loading ? (
              <tr>
                <td className="p-3" colSpan={7}>
                  Loading…
                </td>
              </tr>
            ) : list.data?.students.length === 0 ? (
              <tr>
                <td className="p-3 text-[var(--muted)]" colSpan={7}>
                  No students match.
                </td>
              </tr>
            ) : (
              list.data?.students.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border)]">
                  <td className="p-3 font-medium" dir="auto">
                    {s.display_name}
                  </td>
                  <td>{s.class_name ?? "—"}</td>
                  <td>{s.age}</td>
                  <td>{s.language.toUpperCase()}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${s.status === "active" ? "bg-emerald-100 text-emerald-800" : s.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="font-mono text-xs">…{s.id_hint}</td>
                  <td className="pe-3 text-end">
                    <button className={btn2} onClick={() => setOpen(s.id)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {list.error ? <Banner tone="error">{msgOf(list.error)}</Banner> : null}
      {open ? (
        <StudentDetail
          id={open}
          d={d}
          onClose={() => {
            setOpen(null);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function AddStudent({ d, onClose }: { d: SchoolData; onClose: () => void }) {
  const a = useAction();
  const [f, setF] = useState({ name: "", classId: "", age: "8", language: "en", pin: "" });
  const [made, setMade] = useState<string | null>(null);
  return (
    <section className={card} aria-label="Add a student">
      <h2 className="mb-2 font-bold">Add a student</h2>
      {made ? (
        <div className="flex flex-col gap-3">
          <Secret
            label="Ghadi Student ID"
            value={made}
            note="Shown once. Give it to the student; Ghadi stores only a hash."
          />
          <button className={btn2} onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await a.run(() =>
              post<{ studentId: string }>("school/students", {
                name: f.name,
                classId: f.classId || undefined,
                age: Number(f.age),
                language: f.language,
                pin: f.pin || undefined,
              }),
            );
            if (r) setMade(r.studentId);
          }}
        >
          <input
            className={`${input} sm:col-span-2`}
            placeholder="Name"
            aria-label="Name"
            required
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
          <select
            className={input}
            aria-label="Class"
            value={f.classId}
            onChange={(e) => setF({ ...f, classId: e.target.value })}
          >
            <option value="">No class</option>
            {d.classes
              .filter((c) => !c.archived_at)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <input
            className={input}
            type="number"
            min={3}
            max={18}
            aria-label="Age"
            value={f.age}
            onChange={(e) => setF({ ...f, age: e.target.value })}
          />
          <select
            className={input}
            aria-label="Language"
            value={f.language}
            onChange={(e) => setF({ ...f, language: e.target.value })}
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
          </select>
          <div className="flex gap-2 sm:col-span-5">
            <button className={btn} disabled={a.busy}>
              Create
            </button>
            <button type="button" className={btn2} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {a.error ? (
        <div className="mt-2">
          <Banner tone="error">{a.error}</Banner>
        </div>
      ) : null}
    </section>
  );
}

function StudentDetail({ id, d, onClose }: { id: string; d: SchoolData; onClose: () => void }) {
  const { data, error, loading, reload } = useLoad(
    () =>
      get<{ student: StudentRow & { created_at: string }; reading: StudentReadingRow[] }>(
        `school/students/${id}`,
      ),
    [id],
  );
  const a = useAction();
  const [verified, setVerified] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newId, setNewId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [award, setAward] = useState("");
  const [edit, setEdit] = useState<{ name: string; age: string; classId: string } | null>(null);
  const act = (fn: () => Promise<unknown>, ok: string) =>
    a.run(async () => {
      await fn();
      reload();
    }, ok);
  if (loading) return <section className={card}>Loading…</section>;
  if (error || !data)
    return (
      <section className={card}>
        <Banner tone="error">{msgOf(error)}</Banner>
        <button className={`${btn2} mt-2`} onClick={onClose}>
          Close
        </button>
      </section>
    );
  const s = data.student;
  const sel = (k: string) => `school/students/${id}/${k}`;
  return (
    <section className={`${card} border-brand-400`} aria-label={`Student ${s.display_name}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold" dir="auto">
            {s.display_name}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {s.class_name ?? "No class"} · age {s.age} · {s.language.toUpperCase()} · {s.status} ·
            ID ends …{s.id_hint} · {s.has_pin ? "has a PIN" : "no PIN"}
          </p>
        </div>
        <button className={`${btn2} ms-auto`} onClick={onClose}>
          Close
        </button>
      </div>
      {a.error ? (
        <div className="mt-3">
          <Banner tone="error">{a.error}</Banner>
        </div>
      ) : null}
      {a.ok ? (
        <div className="mt-3">
          <Banner tone="ok">{a.ok}</Banner>
        </div>
      ) : null}
      {newId ? (
        <div className="mt-3">
          <Secret
            label="New Ghadi Student ID"
            value={newId}
            note="Shown once. The old ID and all sessions stopped working."
          />
        </div>
      ) : null}

      {s.status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <button
            className={btn}
            onClick={() => act(() => post(sel("approve"), { approve: true }), "Approved")}
          >
            Approve
          </button>
          <button
            className={btnDanger}
            onClick={() => act(() => post(sel("approve"), { approve: false }), "Rejected")}
          >
            Reject
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] p-3">
          <h3 className="mb-2 font-semibold">Account help</h3>
          <label className="mb-2 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-600"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            I have checked who this student is (in person or by the school&apos;s own records).
          </label>
          <input
            className={`${input} mb-2`}
            inputMode="numeric"
            maxLength={6}
            placeholder="New PIN (optional)"
            aria-label="New PIN"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className={btn}
              disabled={!verified || a.busy}
              onClick={async () => {
                const r = await a.run(() =>
                  post<{ studentId: string }>(sel("reissue"), {
                    identityVerified: true,
                    newPin: newPin || undefined,
                  }),
                );
                if (r) setNewId(r.studentId);
              }}
            >
              Issue a new ID
            </button>
            <button
              className={btn2}
              disabled={!verified || a.busy}
              onClick={() =>
                act(
                  () =>
                    post(sel("reset-pin"), { identityVerified: true, newPin: newPin || undefined }),
                  newPin ? "PIN changed" : "PIN removed",
                )
              }
            >
              Reset PIN
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            A new ID ends every session and the old ID. The action is recorded in the activity log.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] p-3">
          <h3 className="mb-2 font-semibold">Profile and status</h3>
          {edit ? (
            <form
              className="grid gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                await act(
                  () =>
                    patch(sel(""), {
                      name: edit.name,
                      age: Number(edit.age),
                      classId: edit.classId || null,
                    }),
                  "Saved",
                );
                setEdit(null);
              }}
            >
              <input
                className={input}
                aria-label="Name"
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={input}
                  type="number"
                  min={3}
                  max={18}
                  aria-label="Age"
                  value={edit.age}
                  onChange={(e) => setEdit({ ...edit, age: e.target.value })}
                />
                <select
                  className={input}
                  aria-label="Class"
                  value={edit.classId}
                  onChange={(e) => setEdit({ ...edit, classId: e.target.value })}
                >
                  <option value="">No class</option>
                  {d.classes
                    .filter((c) => !c.archived_at)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button className={btn}>Save</button>
                <button type="button" className={btn2} onClick={() => setEdit(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                className={btn2}
                onClick={() =>
                  setEdit({ name: s.display_name, age: String(s.age), classId: s.class_id ?? "" })
                }
              >
                Edit name, age or class
              </button>
              {s.status === "active" ? (
                <button
                  className={btn2}
                  onClick={() => act(() => post(sel("status"), { status: "disabled" }), "Disabled")}
                >
                  Disable
                </button>
              ) : null}
              {s.status === "disabled" ? (
                <button
                  className={btn2}
                  onClick={() => act(() => post(sel("status"), { status: "active" }), "Enabled")}
                >
                  Enable
                </button>
              ) : null}
              {s.status !== "archived" && s.status !== "pending" ? (
                <button
                  className={btn2}
                  onClick={() => act(() => post(sel("status"), { status: "archived" }), "Archived")}
                >
                  Archive
                </button>
              ) : null}
              {s.status === "archived" ? (
                <button
                  className={btn2}
                  onClick={() => act(() => post(sel("status"), { status: "active" }), "Restored")}
                >
                  Restore
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <h3 className="mb-2 mt-5 font-semibold">Reading record</h3>
      <input
        className={`${input} mb-2`}
        placeholder="Reason for a correction (required for void or award)"
        aria-label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
              <th className="py-2 text-start">Book</th>
              <th className="text-start">Read</th>
              <th className="text-start">Time</th>
              <th className="text-start">Completion</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.reading.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-[var(--muted)]">
                  Nothing opened yet.
                </td>
              </tr>
            ) : (
              data.reading.map((r) => (
                <tr key={r.slug} className="border-b border-[var(--border)]">
                  <td className="py-2" dir="auto">
                    {r.title}
                  </td>
                  <td>{Math.round(r.furthest_percent)}%</td>
                  <td>{Math.round(r.active_seconds / 60)} min</td>
                  <td>
                    {r.completed_at
                      ? r.voided_at
                        ? `voided: ${r.void_reason}`
                        : `${r.method}${r.score !== null && r.score !== undefined ? ` (${r.score})` : ""}`
                      : "—"}
                  </td>
                  <td className="text-end">
                    {r.completed_at && !r.voided_at ? (
                      <button
                        className={btnDanger}
                        disabled={reason.trim().length < 3 || a.busy}
                        onClick={() =>
                          act(
                            () => post(sel(`completions/${r.slug}/void`), { reason }),
                            "Record voided",
                          )
                        }
                      >
                        Void
                      </button>
                    ) : null}
                    {r.voided_at ? (
                      <button
                        className={btn2}
                        onClick={() =>
                          act(
                            () => post(sel(`completions/${r.slug}/restore`), {}),
                            "Record restored",
                          )
                        }
                      >
                        Restore
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act(
            () => post(sel("award"), { book: award, reason }),
            "Completion recorded as a teacher award",
          );
        }}
      >
        <input
          className={`${input} max-w-xs`}
          placeholder="Book slug to award (from the book's address)"
          aria-label="Book slug"
          value={award}
          onChange={(e) => setAward(e.target.value)}
        />
        <button className={btn2} disabled={!award || reason.trim().length < 3 || a.busy}>
          Award completion
        </button>
      </form>
    </section>
  );
}

function BoardAdmin({
  d,
  actor,
  reload,
}: {
  d: SchoolData;
  actor: StaffActor;
  reload: () => void;
}) {
  const [classId, setClassId] = useState(actor.classIds?.[0] ?? "");
  const [period, setPeriod] = useState("");
  const lb = useLoad(
    () =>
      get<{ leaderboard: BoardData }>(
        `school/leaderboard?${new URLSearchParams({ ...(classId ? { classId } : {}), ...(period ? { period } : {}) })}`,
      ),
    [classId, period],
  );
  const [edit, setEdit] = useState<Partial<Challenge> | null>(null);
  const a = useAction();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={card} aria-label="Top 5 readers">
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            className={`${input} w-auto`}
            aria-label="View"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            {actor.classIds ? null : <option value="">Whole school</option>}
            {d.classes
              .filter((c) => !c.archived_at)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <select
            className={`${input} w-auto`}
            aria-label="Period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="">Default (running challenge or this month)</option>
            <option value="month">This month</option>
            <option value="year">This school year</option>
            <option value="all">All time</option>
            {d.challenges
              .filter((c) => !c.archived_at)
              .map((c) => (
                <option key={c.id} value={`challenge:${c.id}`}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
        {lb.loading ? (
          <p>Loading…</p>
        ) : lb.error || !lb.data ? (
          <Banner tone="error">{msgOf(lb.error)}</Banner>
        ) : (
          <>
            <p className="mb-2 text-sm text-[var(--muted)]">
              {lb.data.leaderboard.period.label} · {lb.data.leaderboard.participants} reader
              {lb.data.leaderboard.participants === 1 ? "" : "s"} with finished books
            </p>
            <BoardList board={lb.data.leaderboard} showYou={false} />
          </>
        )}
      </section>
      <section className={card} aria-label="Challenges and prizes">
        <h2 className="mb-1 font-bold">Challenges and prizes</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Prizes are whatever your school decides. If a rank has no prize, students see a neutral
          Ghadi reading badge. Ghadi never invents prizes.
        </p>
        {d.challenges.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No challenges yet.</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-2">
            {d.challenges.map((c) => (
              <li key={c.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
                <p className="font-semibold" dir="auto">
                  {c.name}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {c.starts_on.slice(0, 10)} → {c.ends_on.slice(0, 10)}
                </p>
                <p className="mt-1 text-xs">
                  {[1, 2, 3, 4, 5]
                    .map((r) => `#${r}: ${c.prizes?.[String(r)] ?? "badge"}`)
                    .join(" · ")}
                </p>
                {d.canAdminister ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      className={btn2}
                      onClick={() =>
                        setEdit({
                          ...c,
                          starts_on: c.starts_on.slice(0, 10),
                          ends_on: c.ends_on.slice(0, 10),
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      className={btn2}
                      onClick={() =>
                        a.run(async () => {
                          await del(`school/challenges/${c.id}`);
                          reload();
                        }, "Archived")
                      }
                    >
                      Archive
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {d.canAdminister && !edit ? (
          <button
            className={btn}
            onClick={() =>
              setEdit({
                name: "",
                starts_on: new Date().toISOString().slice(0, 10),
                ends_on: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
                prizes: {},
              })
            }
          >
            New challenge
          </button>
        ) : null}
        {edit ? (
          <form
            className="grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await a.run(
                () =>
                  post("school/challenges", {
                    id: edit.id,
                    name: edit.name,
                    startsOn: edit.starts_on,
                    endsOn: edit.ends_on,
                    prizes: edit.prizes,
                  }),
                "Saved",
              );
              if (r) {
                setEdit(null);
                reload();
              }
            }}
          >
            <input
              className={input}
              required
              placeholder="Challenge name"
              aria-label="Challenge name"
              value={edit.name ?? ""}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className={input}
                type="date"
                required
                aria-label="Start"
                value={edit.starts_on ?? ""}
                onChange={(e) => setEdit({ ...edit, starts_on: e.target.value })}
              />
              <input
                className={input}
                type="date"
                required
                aria-label="End"
                value={edit.ends_on ?? ""}
                onChange={(e) => setEdit({ ...edit, ends_on: e.target.value })}
              />
            </div>
            {[1, 2, 3, 4, 5].map((r) => (
              <input
                key={r}
                className={input}
                maxLength={120}
                placeholder={`Prize for rank ${r} (optional)`}
                aria-label={`Prize for rank ${r}`}
                value={edit.prizes?.[String(r)] ?? ""}
                onChange={(e) =>
                  setEdit({ ...edit, prizes: { ...edit.prizes, [String(r)]: e.target.value } })
                }
              />
            ))}
            <div className="flex gap-2">
              <button className={btn} disabled={a.busy}>
                Save
              </button>
              <button type="button" className={btn2} onClick={() => setEdit(null)}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}
        {a.error ? (
          <div className="mt-2">
            <Banner tone="error">{a.error}</Banner>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Classes({ d, reload }: { d: SchoolData; reload: () => void }) {
  const a = useAction();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={card}>
        <h2 className="mb-2 font-bold">Add a class</h2>
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await a.run(() => post("school/classes", { name, grade }), "Class added");
            if (r) {
              setName("");
              setGrade("");
              reload();
            }
          }}
        >
          <input
            className={input}
            required
            placeholder="Class name, e.g. 5A"
            aria-label="Class name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className={input}
            placeholder="Grade or year, e.g. Grade 5"
            aria-label="Grade"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          />
          <button className={btn} disabled={a.busy}>
            Add class
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
        <h2 className="mb-2 font-bold">Classes</h2>
        <ul className="flex flex-col gap-2">
          {d.classes.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-3 text-sm"
            >
              <span className="min-w-0 flex-1">
                <strong dir="auto">{c.name}</strong>{" "}
                <span className="text-[var(--muted)]">
                  {c.grade} · {c.students} active
                </span>
                {c.archived_at ? <em className="ms-2 text-xs">archived</em> : null}
              </span>
              <button
                className={btn2}
                onClick={() =>
                  a.run(async () => {
                    await patch(`school/classes/${c.id}`, { archived: !c.archived_at });
                    reload();
                  })
                }
              >
                {c.archived_at ? "Restore" : "Archive"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Settings({ d, reload }: { d: SchoolData; reload: () => void }) {
  const a = useAction();
  const [code, setCode] = useState(d.school.joinCode);
  const set = (p: Record<string, unknown>) =>
    a.run(async () => {
      await patch("school/settings", p);
      reload();
    }, "Saved");
  const s = d.school;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={card}>
        <h2 className="mb-2 font-bold">School code</h2>
        <p className="mb-2 text-sm text-[var(--muted)]">
          Students enter this code on the Join page. Anyone with the code can ask to join, so share
          it only with your students. Rotate it if it leaks.
        </p>
        <Secret label="School code" value={code} note="Rotating makes the old code stop working." />
        <button
          className={`${btn2} mt-2`}
          onClick={async () => {
            const r = await a.run(() => post<{ joinCode: string }>("school/join-code"));
            if (r) setCode(r.joinCode);
          }}
        >
          Rotate code
        </button>
      </section>
      <section className={`${card} flex flex-col gap-3 text-sm`}>
        <h2 className="font-bold">Rules for this school</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={s.requireApproval}
            onChange={(e) => set({ requireApproval: e.target.checked })}
          />
          Teachers must approve new students before they can read
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={s.leaderboardEnabled}
            onChange={(e) => set({ leaderboardEnabled: e.target.checked })}
          />
          Show the Top 5 leaderboard to students of this school
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={s.classLeaderboardEnabled}
            onChange={(e) => set({ classLeaderboardEnabled: e.target.checked })}
          />
          Also show class leaderboards
        </label>
        <label className="flex flex-col gap-1">
          Name shown on the leaderboard
          <select
            className={input}
            value={s.nameFormat}
            onChange={(e) => set({ nameFormat: e.target.value })}
          >
            <option value="first_name">First name (Maya)</option>
            <option value="first_initial">First name and initial (Maya K.)</option>
            <option value="initials">Initials only (M.K.)</option>
            <option value="nickname">Nickname chosen by the student</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          PIN policy
          <select
            className={input}
            value={s.pinPolicy}
            onChange={(e) => set({ pinPolicy: e.target.value })}
          >
            <option value="optional">PIN optional</option>
            <option value="required">PIN required for every student</option>
            <option value="off">No PINs</option>
          </select>
        </label>
        {a.error ? <Banner tone="error">{a.error}</Banner> : null}
        {a.ok ? <Banner tone="ok">{a.ok}</Banner> : null}
      </section>
    </div>
  );
}

function StaffTab({ d }: { d: SchoolData }) {
  const list = useLoad(
    () =>
      get<{
        staff: {
          id: string;
          name: string;
          email: string;
          role: string;
          disabled_at: string | null;
          class_ids: string[] | null;
        }[];
      }>("school/staff"),
    [],
  );
  const a = useAction();
  const [inv, setInv] = useState({ email: "", name: "" });
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={card}>
        <h2 className="mb-2 font-bold">Invite a teacher</h2>
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await a.run(() =>
              post<{ invitePath: string }>("school/staff/invite", { ...inv, role: "teacher" }),
            );
            if (r) {
              setLink(`${window.location.origin}${r.invitePath}`);
              list.reload();
            }
          }}
        >
          <input
            className={input}
            type="email"
            required
            placeholder="Teacher's email"
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
          <button className={btn} disabled={a.busy}>
            Create invitation link
          </button>
        </form>
        {link ? (
          <div className="mt-3">
            <Secret
              label="Invitation link"
              value={link}
              note="Valid for 7 days, one use. Send it to the teacher yourself: Ghadi does not send email."
            />
          </div>
        ) : null}
        {a.error ? (
          <div className="mt-2">
            <Banner tone="error">{a.error}</Banner>
          </div>
        ) : null}
      </section>
      <section className={card}>
        <h2 className="mb-2 font-bold">Staff</h2>
        <ul className="flex flex-col gap-3">
          {list.data?.staff.map((s) => (
            <li key={s.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
              <p>
                <strong dir="auto">{s.name}</strong>{" "}
                <span className="text-[var(--muted)]">
                  {s.email} · {s.role === "school_admin" ? "administrator" : "teacher"}
                  {s.disabled_at ? " · disabled" : ""}
                </span>
              </p>
              {s.role === "teacher" ? (
                <fieldset className="mt-2">
                  <legend className="text-xs text-[var(--muted)]">
                    Classes this teacher can see (none selected = no students)
                  </legend>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {d.classes
                      .filter((c) => !c.archived_at)
                      .map((c) => {
                        const on = s.class_ids?.includes(c.id) ?? false;
                        return (
                          <label key={c.id} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-brand-600"
                              checked={on}
                              onChange={(e) =>
                                a.run(async () => {
                                  await put(`school/staff/${s.id}/classes`, {
                                    classIds: e.target.checked
                                      ? [...(s.class_ids ?? []), c.id]
                                      : (s.class_ids ?? []).filter((x) => x !== c.id),
                                  });
                                  list.reload();
                                })
                              }
                            />
                            {c.name}
                          </label>
                        );
                      })}
                  </div>
                </fieldset>
              ) : null}
              <button
                className={`${btn2} mt-2`}
                onClick={() =>
                  a.run(async () => {
                    await post(`school/staff/${s.id}/disabled`, { disabled: !s.disabled_at });
                    list.reload();
                  })
                }
              >
                {s.disabled_at ? "Enable" : "Disable"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Audit() {
  const { data, error, loading } = useLoad(() => get<{ events: AuditEvent[] }>("school/audit"), []);
  return (
    <section className={card}>
      <h2 className="mb-2 font-bold">Activity log</h2>
      <p className="mb-3 text-sm text-[var(--muted)]">
        Every sensitive action (new IDs, PIN resets, corrections, setting changes) is recorded here.
        Student IDs and PINs are never logged.
      </p>
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
