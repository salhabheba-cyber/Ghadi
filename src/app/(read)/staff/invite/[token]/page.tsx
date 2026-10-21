"use client";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
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

export default function AcceptInvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t } = useReadLang();
  const router = useRouter();
  const [info, setInfo] = useState<{
    email: string;
    name: string;
    role: string;
    schoolName: string | null;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<{ invite: NonNullable<typeof info> }>(`staff/invite/${encodeURIComponent(token)}`).then(
      (r) => setInfo(r.invite),
      (e) => setError(msgOf(e)),
    );
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(`staff/invite/${encodeURIComponent(token)}/accept`, { password });
      const me = await get<{ actor: { role: string } }>("staff/me");
      router.replace(me.actor.role === "platform_admin" ? "/admin" : "/school");
    } catch (err) {
      setError(msgOf(err));
      setBusy(false);
    }
  }
  return (
    <PublicFrame
      title={info ? `${info.schoolName ?? "Ghadi"}` : t("staffTitle")}
      intro={
        info
          ? `${info.name} · ${info.email} · ${info.role === "school_admin" ? "School administrator" : "Teacher"}`
          : undefined
      }
    >
      {info ? (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldBox label={`${t("password")} (10+)`} htmlFor="pw">
            <input
              id="pw"
              type="password"
              dir="ltr"
              minLength={10}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className={inputCls}
            />
          </FieldBox>
          <ErrorLine text={error} />
          <button disabled={busy} className={primaryBtn}>
            {t("save")}
          </button>
        </form>
      ) : (
        <ErrorLine text={error ?? t("loading")} />
      )}
    </PublicFrame>
  );
}
