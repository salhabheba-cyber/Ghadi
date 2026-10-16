-- Manual (hand-confirmed) payments, e.g. a transfer received by Whish Money. Recorded only by an admin, never by a browser request from the payer.
CREATE TABLE payment_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency     text NOT NULL DEFAULT 'USD',
  method       text NOT NULL DEFAULT 'manual',
  reference    text NOT NULL DEFAULT '' CHECK (length(reference) <= 200),
  period_end   timestamptz NOT NULL,
  recorded_by  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_records_user_idx ON payment_records (user_id, created_at DESC);
