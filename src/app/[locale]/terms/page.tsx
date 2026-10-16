import { LegalDraftBanner } from "@/components/LegalDraft";

export const metadata = { title: "Terms (draft)" };

export default function Page() {
  return (
    <article className="stack" style={{ maxWidth: "44rem" }}>
      <h1>Terms of use (draft)</h1>
      <LegalDraftBanner />
      <h2>Using GHADI</h2>
      <p>GHADI is for children with a parent or guardian who sets up and supervises the account. Please stay nearby during sessions, especially for young children.</p>
      <h2>Free week and subscription</h2>
      <p>New accounts get a 7-day free trial. After that, access to lessons needs a subscription (planned price: US$5 per month). Online card payment is <strong>not connected</strong>. If the operator offers it, you pay by sending US$5 by Whish Money and we extend your access by 30 days once we see the payment. Nothing is ever charged automatically, and you may simply stop paying at any time. Viewing, exporting and deleting your data is always available, even without a subscription.</p>
      <h2>What GHADI is not</h2>
      <ul>
        <li>The teacher is an AI, not a person, and does not replace parents or teachers.</li>
        <li>GHADI does not diagnose learning or developmental conditions. Progress notes are observations from activities, not assessments of ability.</li>
        <li>Sample lessons are original and are not aligned to any national curriculum unless a lesson says so.</li>
      </ul>
      <h2>Your uploads</h2>
      <p>Upload only material you are allowed to use. Do not upload other people&apos;s private information. Uploaded text is treated as material to read, never as instructions to the teacher.</p>
      <h2>Changes and contact</h2>
      <p>{process.env.CONTACT_EMAIL ? <>Contact: <a href={`mailto:${process.env.CONTACT_EMAIL}`}>{process.env.CONTACT_EMAIL}</a>.</> : <em>Contact address not set by the operator yet.</em>}</p>
      <p><em>To be completed by the operator after legal review: company details, governing law, liability, and refund terms.</em></p>
    </article>
  );
}
