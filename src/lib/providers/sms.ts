/**
 * SMS one-time-code delivery behind an interface.
 *  - none     (default): phone sign-in is reported as unavailable. Nothing is sent.
 *  - console  (development/tests only): prints the code to the server log. Refused when NODE_ENV=production.
 *  - twilio   : Twilio Programmable SMS REST API. Written to the documented API but NOT tested against a real account.
 */
export interface SmsProvider { readonly name: string; send(to: string, body: string): Promise<void> }

/** Test/development outbox for the console provider. Never populated in production. */
export const devOutbox: { to: string; body: string }[] = [];

const consoleProvider: SmsProvider = {
  name: "console",
  async send(to, body) {
    if (process.env.NODE_ENV === "production") throw new Error("console SMS provider is disabled in production");
    devOutbox.push({ to, body });
    console.log(JSON.stringify({ level: "info", msg: "dev sms", to: to.slice(0, 4) + "…", body }));
  },
};

const twilioProvider: SmsProvider = {
  name: "twilio",
  async send(to, body) {
    const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM;
    if (!sid || !token || !from) throw new Error("twilio_not_configured");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: { authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`twilio_http_${res.status}`);
  },
};

export function getSmsProvider(): SmsProvider | null {
  switch (process.env.SMS_PROVIDER) {
    case "console": return process.env.NODE_ENV === "production" ? null : consoleProvider;
    case "twilio": return process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM ? twilioProvider : null;
    default: return null;
  }
}

export const phoneSignInAvailable = () => getSmsProvider() !== null;

/** E.164: + then 8–15 digits, no leading zero after the plus. Rejects anything else before it reaches the SMS provider. */
export const E164 = /^\+[1-9]\d{7,14}$/;
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.trim().replace(/[\s().-]/g, "");
  return E164.test(cleaned) ? cleaned : null;
}
