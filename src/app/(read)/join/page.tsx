"use client";
import { Check, Copy, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  ErrorLine,
  FieldBox,
  PublicFrame,
  inputCls,
  primaryBtn,
  secondaryBtn,
} from "@/components/read/public-frame";
import { errorText } from "@/components/read/common";
import { post } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";
import { LANGS, LANG_NAMES, type Lang } from "@/lib/read/strings";

interface SchoolInfo {
  name: string;
  requireApproval: boolean;
  pinPolicy: "off" | "optional" | "required";
  classes: { id: string; name: string; grade: string }[];
}
interface Created {
  studentId: string;
  status: "pending" | "active";
  schoolName: string;
}

export default function JoinPage() {
  const { t, lang } = useReadLang();
  const [code, setCode] = useState("");
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [form, setForm] = useState({
    name: "",
    classId: "",
    age: "8",
    language: "" as "" | Lang,
    pin: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ school: SchoolInfo }>("school-lookup", { code });
      setSchool(r.school);
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }
  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<Created>("register", {
        joinCode: code,
        name: form.name,
        classId: form.classId || undefined,
        age: Number(form.age),
        language: form.language || lang,
        pin: form.pin || undefined,
      });
      setCreated(r);
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.studentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the ID is still selectable on screen */
    }
  }

  if (created) {
    return (
      <PublicFrame title={t("yourIdIs")} intro={t("saveIdNow")}>
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border-2 border-dashed border-brand-400 bg-brand-50 p-4 text-center dark:bg-brand-900/30 print:border-solid print:bg-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-200">
              {t("idCard")}
            </p>
            <p
              dir="ltr"
              className="select-all py-3 font-mono text-3xl font-extrabold tracking-wider text-brand-800 dark:text-white"
              data-testid="student-id"
            >
              {created.studentId}
            </p>
            <p dir="auto" className="text-sm font-semibold">
              {form.name}
            </p>
            <p dir="auto" className="text-xs text-[var(--muted)]">
              {created.schoolName}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button onClick={copy} className={`${secondaryBtn} flex-1`}>
              {copied ? (
                <Check aria-hidden className="h-4 w-4" />
              ) : (
                <Copy aria-hidden className="h-4 w-4" />
              )}
              {copied ? t("copied") : t("copy")}
            </button>
            <button onClick={() => window.print()} className={`${secondaryBtn} flex-1`}>
              <Printer aria-hidden className="h-4 w-4" />
              {t("print")}
            </button>
          </div>
          {created.status === "pending" ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {t("pendingApproval")}
            </p>
          ) : null}
          <label className="flex items-start gap-2 text-sm print:hidden">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="mt-1 h-5 w-5 accent-brand-600"
            />
            {t("idSaved")}
          </label>
          <Link
            href="/login"
            aria-disabled={!saved}
            onClick={(e) => !saved && e.preventDefault()}
            className={`${primaryBtn} print:hidden ${saved ? "" : "pointer-events-none opacity-50"}`}
          >
            {t("signIn")}
          </Link>
        </div>
      </PublicFrame>
    );
  }

  if (!school) {
    return (
      <PublicFrame title={t("joinTitle")} intro={t("joinIntro")}>
        <form onSubmit={lookup} className="flex flex-col gap-4">
          <FieldBox label={t("schoolCode")} hint={t("schoolCodeHint")} htmlFor="code">
            <input
              id="code"
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={12}
              required
              className={`${inputCls} text-center font-mono text-xl tracking-widest`}
            />
          </FieldBox>
          <ErrorLine text={error} />
          <button disabled={busy || code.trim().length < 8} className={primaryBtn}>
            {t("findSchool")}
          </button>
          <p className="text-center text-sm">
            <Link href="/login" className="text-brand-700 underline dark:text-brand-300">
              {t("signIn")}
            </Link>
          </p>
        </form>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame title={school.name} intro={t("noEmail")}>
      <form onSubmit={register} className="flex flex-col gap-4">
        <FieldBox label={t("yourName")} htmlFor="name">
          <input
            id="name"
            dir="auto"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            maxLength={60}
            autoComplete="off"
            className={inputCls}
          />
        </FieldBox>
        {school.classes.length > 0 ? (
          <FieldBox label={t("yourClass")} htmlFor="class">
            <select
              id="class"
              value={form.classId}
              onChange={(e) => setForm({ ...form, classId: e.target.value })}
              required
              className={inputCls}
            >
              <option value="">{t("chooseClass")}</option>
              {school.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grade ? `${c.grade} · ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </FieldBox>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <FieldBox label={t("yourAge")} htmlFor="age">
            <input
              id="age"
              type="number"
              inputMode="numeric"
              min={3}
              max={18}
              value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
              required
              className={inputCls}
            />
          </FieldBox>
          <FieldBox label={t("readIn")} htmlFor="lang">
            <select
              id="lang"
              value={form.language || lang}
              onChange={(e) => setForm({ ...form, language: e.target.value as Lang })}
              className={inputCls}
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {LANG_NAMES[l]}
                </option>
              ))}
            </select>
          </FieldBox>
        </div>
        {school.pinPolicy !== "off" ? (
          <FieldBox
            label={school.pinPolicy === "required" ? t("pinRequired") : t("pinOptional")}
            hint={t("pinWhy")}
            htmlFor="pin"
          >
            <input
              id="pin"
              dir="ltr"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,6}"
              maxLength={6}
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
              required={school.pinPolicy === "required"}
              autoComplete="new-password"
              className={`${inputCls} tracking-widest`}
            />
          </FieldBox>
        ) : null}
        <ErrorLine text={error} />
        <button disabled={busy} className={primaryBtn}>
          {t("createAccount")}
        </button>
      </form>
    </PublicFrame>
  );
}
