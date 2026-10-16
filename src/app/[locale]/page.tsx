import { Avatar } from "@/components/Avatar";
import { getMessages } from "@/lib/i18n/messages";
import { Locale } from "@/lib/schemas";
import { getViewer } from "@/lib/session";
import { demoEntryAction } from "./actions";

export default async function Landing({ params }: { params: Promise<{ locale: string }> }) {
  const locale = Locale.parse((await params).locale);
  const m = getMessages(locale);
  const viewer = await getViewer();
  const demo = process.env.NODE_ENV !== "production" && process.env.GHADI_ENABLE_DEMO_ENTRY === "true";
  return (
    <div className="stack">
      <section className="hero">
        <div className="stack">
          <span className="badge peach">{m.landing.badge}</span>
          <h1>{m.landing.title}</h1>
          <p className="lead">{m.landing.body}</p>
          <div className="row">
            {viewer ? (
              <a className="btn btn-primary" href={`/${locale}/parent`}>{m.header.parentArea}</a>
            ) : (
              <>
                <a className="btn btn-primary" href={`/${locale}/sign-up`}>{m.landing.create}</a>
                {demo && (
                  <form action={demoEntryAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <button className="btn btn-accent">{m.landing.tryDemo}</button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
        <div className="teacher-panel">
          <Avatar label={m.session.ai} />
          <p className="avatar-label badge">{m.session.ai}</p>
        </div>
      </section>
      <section className="card peach" aria-labelledby="honest">
        <h2 id="honest">{m.landing.honestyTitle}</h2>
        <ul className="clean ticks">{m.landing.honesty.map((h) => <li key={h}>{h}</li>)}</ul>
      </section>
      <p className="muted">{m.landing.privacy}</p>
    </div>
  );
}
