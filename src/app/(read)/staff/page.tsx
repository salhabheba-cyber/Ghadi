"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ErrorLine,
  FieldBox,
  PublicFrame,
  inputCls,
  primaryBtn,
} from "@/components/read/public-frame";
import { msgOf } from "@/components/read/staff/ui";
import { get, post } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";

export default function StaffEntry() {
  const { t } = useReadLang();
  const router = useRouter();
  const [status, setStatus] = useState<{ setupNeeded: boolean; setupEnabled: boolean } | null>(
    null,
  );
  const [form, setForm] = useState({ email: "", password: "", name: "", setupToken: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<{ setupNeeded: boolean; setupEnabled: boolean }>("status").then(setStatus, (e) =>
      setError(e?.code === "not-configured" ? t("notConfigured") : msgOf(e)),
    );
    get<{ actor: { role: string } }>("staff/me").then(
      (r) => router.replace(r.actor.role === "platform_admin" ? "/admin" : "/school"),
      () => undefined,
    );
  }, [router, t]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (status?.setupNeeded) await post("staff/setup", form);
      else await post("staff/login", { email: form.email, password: form.password });
      const me = await get<{ actor: { role: string } }>("staff/me");
      router.replace(me.actor.role === "platform_admin" ? "/admin" : "/school");
    } catch (err) {
      setError(msgOf(err));
      setBusy(false);
    }
  }
  const setup = status?.setupNeeded === true;
  return (
    <PublicFrame
      title={setup ? t("firstRunTitle") : t("staffTitle")}
      intro={setup ? t("firstRunBody") : undefined}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {setup && !status?.setupEnabled ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            GHADI_SETUP_TOKEN is not set on the server (it must be at least 16 characters). Set it
            in the server settings, restart, and come back.
          </p>
        ) : null}
        {setup ? (
          <>
            <FieldBox label={t("setupToken")} htmlFor="tok">
              <input
                id="tok"
                type="password"
                dir="ltr"
                value={form.setupToken}
                onChange={(e) => setForm({ ...form, setupToken: e.target.value })}
                required
                autoComplete="off"
                className={inputCls}
              />
            </FieldBox>
            <FieldBox label={t("yourFullName")} htmlFor="nm">
              <input
                id="nm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className={inputCls}
              />
            </FieldBox>
          </>
        ) : null}
        <FieldBox label={t("email")} htmlFor="em">
          <input
            id="em"
            type="email"
            dir="ltr"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            autoComplete="username"
            className={inputCls}
          />
        </FieldBox>
        <FieldBox label={t("password")} htmlFor="pw">
          <input
            id="pw"
            type="password"
            dir="ltr"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={10}
            autoComplete={setup ? "new-password" : "current-password"}
            className={inputCls}
          />
        </FieldBox>
        <ErrorLine text={error} />
        <button disabled={busy || status === null} className={primaryBtn}>
          {setup ? t("save") : t("signIn")}
        </button>
      </form>
    </PublicFrame>
  );
}
