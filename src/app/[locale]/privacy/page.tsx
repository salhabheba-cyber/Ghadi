import { LegalDraftBanner } from "@/components/LegalDraft";

export const metadata = { title: "Privacy (draft)" };

export default function Page() {
  return (
    <article className="stack" style={{ maxWidth: "44rem" }}>
      <h1>Privacy notice (draft)</h1>
      <LegalDraftBanner />
      <h2>Who uses GHADI</h2>
      <p>GHADI is managed by a parent or guardian. Children do not create accounts; a grown-up creates the account and a child profile and gives the consents shown during setup.</p>
      <h2>What we store</h2>
      <ul>
        <li>Parent: name, email address and/or mobile number, and sign-in data.</li>
        <li>Child profile: a display name (a first name or nickname is enough), age band, language preferences and session length. No photos, no exact birth date, no school name.</li>
        <li>Learning records: answers to activities, dictation text the child typed, reading words the grown-up marked, and skill estimates with the evidence behind them.</li>
        <li>Uploads you choose to add (images or PDFs) and the text read from them. They are private to your account.</li>
        <li>Study-planner tasks you confirm.</li>
        <li>An audit log of account actions such as deleting data. It holds no child answers.</li>
      </ul>
      <h2>What we do not do</h2>
      <ul>
        <li>No advertising and no advertising profiles.</li>
        <li>No sale of data.</li>
        <li>Raw audio is not recorded or stored.</li>
        <li>Children&apos;s data is not used to train AI models.</li>
      </ul>
      <h2>AI</h2>
      <p>The teacher is an AI (or, in demo mode, a fixed script) and says so on screen. If an AI model provider is configured by the operator, only short, non-identifying event descriptions (such as the child&apos;s first name or nickname, whether an answer was correct, and a lesson title) are sent to it. Uploaded documents are not sent to the teacher model.</p>
      <h2>Your controls</h2>
      <p>From each child&apos;s page a parent can export all of that child&apos;s data, delete the learning data, or delete the profile entirely. Uploads can be deleted individually, and from the grown-ups page you can delete your whole account and all family data. Deleted data is removed from the database; backups made by the hosting provider may take additional time to expire.</p>
      <h2>Retention</h2>
      <p>There is no automatic expiry yet: data is kept until a parent deletes it. An automatic retention schedule is planned and must be set with legal advice.</p>
      <h2>Where data is stored</h2>
      <p>Data is stored in the operator&apos;s database and hosting region. <em>To be completed by the operator: hosting provider, region, and sub-processors (SMS, email, AI).</em></p>
      <h2>Contact</h2>
      <p>{process.env.CONTACT_EMAIL ? <>Questions or requests about your data: <a href={`mailto:${process.env.CONTACT_EMAIL}`}>{process.env.CONTACT_EMAIL}</a></> : <em>Contact address not set by the operator yet.</em>}</p>
      <h2>Legal basis and children&apos;s rules</h2>
      <p><em>To be completed with legal advice for each launch country (for example parental-consent and age rules). GHADI makes no statement of compliance with any specific law until that review is done.</em></p>
    </article>
  );
}
