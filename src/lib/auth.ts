import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { getPool } from "@/lib/db";
import { E164, getSmsProvider } from "@/lib/providers/sms";
import { getMailProvider, mailAvailable } from "@/lib/providers/mail";

export const auth = betterAuth({
  database: getPool(),
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
    // Verification and reset need a mail provider. With none configured both are off (see README).
    requireEmailVerification: mailAvailable(),
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      const mail = getMailProvider();
      if (!mail) return;
      await mail.send({ to: user.email, subject: "Reset your GHADI password", text: `Hello,\n\nUse this link to choose a new password (valid for 1 hour):\n${url}\n\nIf you did not ask for this, ignore this email; your password stays the same.\n\nGHADI` });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const mail = getMailProvider();
      if (!mail) return;
      await mail.send({ to: user.email, subject: "Confirm your email for GHADI", text: `Hello,\n\nConfirm your email address to finish creating your GHADI parent account:\n${url}\n\nIf you did not create an account, ignore this email.\n\nGHADI` });
    },
  },
  user: {
    additionalFields: {
      // input:false → a client can never choose its own role.
      role: { type: "string", defaultValue: "parent", input: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },
  rateLimit: { enabled: true, window: 60, max: 20 },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      phoneNumberValidator: (n) => E164.test(n),
      sendOTP: async ({ phoneNumber: to, code }) => {
        const sms = getSmsProvider();
        if (!sms) throw new Error("sms_unavailable");
        await sms.send(to, `GHADI code: ${code}. It expires in 5 minutes. If you did not ask for it, ignore this message.`);
      },
      // A phone-only parent gets a placeholder address on a reserved domain; they can add a real email later.
      signUpOnVerification: {
        getTempEmail: (n) => `phone-${n.replace(/\D/g, "")}@phone.ghadi.invalid`,
        getTempName: () => "Parent",
      },
    }),
    nextCookies(),
  ],
});
