/**
 * Payment-provider boundary. No provider is connected, so `billingConfigured()` is false and the UI says so.
 * A provider adapter must: create a hosted checkout session for the signed-in parent, and expose a webhook route that
 * verifies the provider's signature and then calls recordPayment / recordCancellation in src/lib/repo/billing.ts.
 * Do not enable until credentials, supported regions for the merchant, taxes and compliance are confirmed.
 */
export const billingConfigured = (): boolean => false;

/** Hand-confirmed payment instructions (e.g. Whish Money). Shown only when the operator sets WHISH_NUMBER; nothing is automatic. */
export const manualPayment = (): { whishNumber: string } | null => {
  const n = process.env.WHISH_NUMBER?.trim();
  return n ? { whishNumber: n } : null;
};
