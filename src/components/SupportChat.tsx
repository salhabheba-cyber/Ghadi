"use client";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Loc = "en" | "fr" | "ar";
const EN = { help: "Help", title: "Help for grown-ups", note: "Automated helper, not a person. Chat messages are not saved.", hello: "Hi! Ask me how GHADI works: the free trial, paying, adding a child, privacy…", ph: "Type your question", send: "Send", talk: "Talk to the team", unknown: "I'm not sure about that one. I can send your question to the team.", helpful: "Anything else? You can also talk to the team.", email: "Your email", msg: "Your message", submit: "Send to the team", sent: "Thank you. The team has your message and will reply by email.", saveNote: "If you send a message to the team, we save it with your email so we can reply.", close: "Close", err: "Something went wrong. Please try again.", wait: "Too many messages. Please wait a little." };
type Dict = typeof EN;
const T: Record<Loc, Dict> = {
  en: EN,
  fr: { help: "Aide", title: "Aide pour les adultes", note: "Assistant automatique, pas une personne. Les messages du chat ne sont pas enregistrés.", hello: "Bonjour ! Demandez-moi comment fonctionne GHADI : essai gratuit, paiement, ajouter un enfant, confidentialité…", ph: "Écrivez votre question", send: "Envoyer", talk: "Parler à l'équipe", unknown: "Je ne suis pas sûr. Je peux transmettre votre question à l'équipe.", helpful: "Autre chose ? Vous pouvez aussi parler à l'équipe.", email: "Votre e-mail", msg: "Votre message", submit: "Envoyer à l'équipe", sent: "Merci. L'équipe a votre message et répondra par e-mail.", saveNote: "Si vous écrivez à l'équipe, nous enregistrons le message avec votre e-mail pour vous répondre.", close: "Fermer", err: "Une erreur est survenue. Réessayez.", wait: "Trop de messages. Patientez un peu." },
  ar: { help: "مساعدة", title: "مساعدة للكبار", note: "مساعد آلي وليس شخصًا. رسائل المحادثة غير محفوظة.", hello: "مرحبًا! اسألني عن غادي: التجربة المجانية، الدفع، إضافة طفل، الخصوصية…", ph: "اكتب سؤالك", send: "إرسال", talk: "تحدث مع الفريق", unknown: "لست متأكدًا من ذلك. يمكنني إرسال سؤالك إلى الفريق.", helpful: "هل من شيء آخر؟ يمكنك أيضًا التحدث مع الفريق.", email: "بريدك الإلكتروني", msg: "رسالتك", submit: "أرسل إلى الفريق", sent: "شكرًا. وصلت رسالتك إلى الفريق وسيردّ عبر البريد.", saveNote: "إذا راسلت الفريق فسنحفظ الرسالة مع بريدك لنتمكن من الرد.", close: "إغلاق", err: "حدث خطأ. حاول مرة أخرى.", wait: "رسائل كثيرة. انتظر قليلًا." },
};

export function SupportChat({ locale, email }: { locale: Loc; email: string | null }) {
  const path = usePathname();
  const t = T[locale];
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<{ from: "me" | "bot"; text: string }[]>([{ from: "bot", text: t.hello }]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  // Never shown inside the child's learning screens.
  if (path?.includes("/learn/")) return null;

  const scroll = () => setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 0);
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text || busy) return;
    setQ(""); setBusy(true); setErr("");
    setMsgs((m) => [...m, { from: "me", text }]);
    try {
      const r = await fetch("/api/support/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, locale }) });
      if (r.status === 429) { setErr(t.wait); return; }
      const d = (await r.json()) as { answer: string | null };
      setMsgs((m) => [...m, { from: "bot", text: d.answer ?? t.unknown }]);
      if (!d.answer) setContact(true);
    } catch { setErr(t.err); } finally { setBusy(false); scroll(); }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/support/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: f.get("email"), message: f.get("message"), website: f.get("website"), locale }) });
      if (r.status === 429) setErr(t.wait); else if (!r.ok) setErr(t.err); else { setSent(true); setContact(false); }
    } catch { setErr(t.err); } finally { setBusy(false); }
  }
  const lastUser = [...msgs].reverse().find((m) => m.from === "me")?.text ?? "";

  return (
    <div className="support">
      {open ? (
        <section className="support-panel" role="dialog" aria-label={t.title}>
          <header className="support-head"><strong>{t.title}</strong><button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>{t.close}</button></header>
          <p className="small muted" style={{ margin: "0.4rem 0.8rem" }}>{t.note}</p>
          <div className="support-log" aria-live="polite">
            {msgs.map((m, i) => <p key={i} className={`bubble ${m.from}`}>{m.text}</p>)}
            {sent && <p className="bubble bot">{t.sent}</p>}
            <div ref={endRef} />
          </div>
          {err && <p className="alert warn small" role="alert" style={{ margin: "0 0.8rem" }}>{err}</p>}
          {contact ? (
            <form onSubmit={submit} className="stack-sm" style={{ padding: "0.6rem 0.8rem" }}>
              <label className="small" htmlFor="sc-email">{t.email}</label>
              <input id="sc-email" name="email" type="email" required className="input" defaultValue={email ?? ""} />
              <label className="small" htmlFor="sc-msg">{t.msg}</label>
              <textarea id="sc-msg" name="message" required minLength={5} maxLength={2000} className="input" rows={3} defaultValue={lastUser} />
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px" }} />
              <p className="small muted">{t.saveNote}</p>
              <button className="btn btn-primary btn-sm" disabled={busy}>{t.submit}</button>
            </form>
          ) : (
            <form onSubmit={ask} className="support-form">
              <label className="sr-only" htmlFor="sc-q">{t.ph}</label>
              <input id="sc-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.ph} maxLength={500} autoComplete="off" />
              <button className="btn btn-primary btn-sm" disabled={busy}>{t.send}</button>
            </form>
          )}
          {!contact && <button type="button" className="btn btn-quiet btn-sm" style={{ margin: "0 0.8rem 0.6rem" }} onClick={() => setContact(true)}>{t.talk}</button>}
        </section>
      ) : (
        <button type="button" className="btn btn-primary support-fab" onClick={() => setOpen(true)}>{t.help}</button>
      )}
    </div>
  );
}
