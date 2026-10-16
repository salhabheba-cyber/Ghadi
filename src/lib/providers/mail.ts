/**
 * Transactional email behind an interface.
 *  - none (default): no email is sent; password reset and email verification are switched off and the UI says so.
 *  - console (dev/tests only): keeps messages in memory and logs them. Refused in production.
 *  - resend: Resend REST API (https://resend.com/docs/api-reference/emails/send-email). NOT tested with a real account.
 */
export interface MailMessage { to: string; subject: string; text: string }
export interface MailProvider { readonly name: string; send(m: MailMessage): Promise<void> }

export const devMailbox: MailMessage[] = [];

const consoleMail: MailProvider = {
  name: "console",
  async send(m) {
    if (process.env.NODE_ENV === "production") throw new Error("console mail provider is disabled in production");
    devMailbox.push(m);
    console.log(JSON.stringify({ level: "info", msg: "dev mail", to: m.to.replace(/^(.).*(@.*)$/, "$1***$2"), subject: m.subject }));
  },
};

const resendMail: MailProvider = {
  name: "resend",
  async send(m) {
    const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
    if (!key || !from) throw new Error("resend_not_configured");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`resend_http_${res.status}`);
  },
};

export function getMailProvider(): MailProvider | null {
  switch (process.env.MAIL_PROVIDER) {
    case "console": return process.env.NODE_ENV === "production" ? null : consoleMail;
    case "resend": return process.env.RESEND_API_KEY && process.env.MAIL_FROM ? resendMail : null;
    default: return null;
  }
}
export const mailAvailable = () => getMailProvider() !== null;
