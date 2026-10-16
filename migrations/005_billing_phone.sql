-- Mobile-number sign-in (Better Auth phone-number plugin columns) and subscription entitlements.
ALTER TABLE "user" ADD COLUMN "phoneNumber" text UNIQUE;
ALTER TABLE "user" ADD COLUMN "phoneNumberVerified" boolean NOT NULL DEFAULT false;

CREATE TABLE plans (
  code         text PRIMARY KEY,
  name         text NOT NULL,
  price_cents  integer NOT NULL CHECK (price_cents >= 0),
  currency     text NOT NULL DEFAULT 'USD',
  interval     text NOT NULL CHECK (interval IN ('month','year')),
  trial_days   integer NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  active       boolean NOT NULL DEFAULT true
);
-- Product decision: 7-day free trial, then US$5 per month.
INSERT INTO plans (code, name, price_cents, currency, interval, trial_days) VALUES ('monthly', 'GHADI Monthly', 500, 'USD', 'month', 7);

-- One subscription row per parent account. Status here is what we last recorded; the effective access decision
-- is computed from the dates (src/lib/billing/entitlement.ts), so an expired trial blocks access without a cron job.
CREATE TABLE subscriptions (
  id                        text PRIMARY KEY,
  user_id                   text NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  plan_code                 text NOT NULL REFERENCES plans(code),
  status                    text NOT NULL CHECK (status IN ('trialing','active','past_due','canceled')),
  trial_started_at          timestamptz,
  trial_ends_at             timestamptz,
  current_period_end        timestamptz,
  provider                  text,            -- null until a payment provider is connected
  provider_customer_ref     text,
  provider_subscription_ref text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
