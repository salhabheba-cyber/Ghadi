"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ErrorLine,
  FieldBox,
  PublicFrame,
  inputCls,
  primaryBtn,
} from "@/components/read/public-frame";
import { errorText } from "@/components/read/common";
import { post } from "@/lib/read/api";
import { useReadLang } from "@/lib/read/lang";

export default function LoginPage() {
  const { t } = useReadLang();
  const router = useRouter();
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("login", { id, pin: pin || undefined });
      router.replace("/read");
    } catch (err) {
      setError(errorText(err, t));
      setBusy(false);
    }
  }
  return (
    <PublicFrame title={t("loginTitle")}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FieldBox label={t("studentId")} htmlFor="id">
          <input
            id="id"
            dir="ltr"
            value={id}
            onChange={(e) => setId(e.target.value.toUpperCase())}
            placeholder="GH-XXXX-XXXX-XXXX"
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            required
            className={`${inputCls} font-mono tracking-wider`}
          />
        </FieldBox>
        <FieldBox label={`${t("pin")}`} htmlFor="pin">
          <input
            id="pin"
            dir="ltr"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            autoComplete="current-password"
            className={`${inputCls} tracking-widest`}
          />
        </FieldBox>
        <ErrorLine text={error} />
        <button disabled={busy || id.length < 8} className={primaryBtn}>
          {t("signIn")}
        </button>
        <p className="text-xs text-[var(--muted)]">{t("lostId")}</p>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <Link href="/join" className="text-brand-700 underline dark:text-brand-300">
            {t("newHere")}
          </Link>
          <Link href="/staff" className="text-brand-700 underline dark:text-brand-300">
            {t("staffLogin")}
          </Link>
        </div>
      </form>
    </PublicFrame>
  );
}
