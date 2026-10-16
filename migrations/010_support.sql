-- Messages a visitor chooses to send to the team. Chat with the help bot itself is NOT stored.
CREATE TABLE support_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text REFERENCES "user"(id) ON DELETE SET NULL,
  email       text NOT NULL CHECK (length(email) <= 254),
  message     text NOT NULL CHECK (length(message) BETWEEN 5 AND 2000),
  locale      text NOT NULL DEFAULT 'en',
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);
CREATE INDEX support_requests_status_idx ON support_requests (status, created_at DESC);
