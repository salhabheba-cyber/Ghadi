-- Better Auth core tables (names/columns follow its default schema).
CREATE TABLE "user" (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  email           text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image           text,
  role            text NOT NULL DEFAULT 'parent' CHECK (role IN ('parent','content_editor','admin')),
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session (
  id          text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token       text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId"    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX session_user_idx ON session ("userId");

CREATE TABLE account (
  id                      text PRIMARY KEY,
  "accountId"             text NOT NULL,
  "providerId"            text NOT NULL,
  "userId"                text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope                   text,
  password                text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_user_idx ON account ("userId");

CREATE TABLE verification (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- Child profiles hold the minimum needed: a nickname and an age band (no surname, no birth date, no photo).
CREATE TABLE child_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name         text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  age_band             text NOT NULL CHECK (age_band IN ('3-5','6-8','9-12','13-18')),
  ui_locale            text NOT NULL DEFAULT 'en' CHECK (ui_locale IN ('en','fr','ar')),
  lesson_language      text NOT NULL DEFAULT 'en' CHECK (lesson_language IN ('en','fr','ar')),
  explanation_language text NOT NULL DEFAULT 'en' CHECK (explanation_language IN ('en','fr','ar')),
  session_minutes      integer NOT NULL DEFAULT 10 CHECK (session_minutes BETWEEN 3 AND 60),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Authorization lives here: a guardian can only touch children they are linked to.
CREATE TABLE child_guardians (
  child_id           uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  guardian_id        text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  relationship       text NOT NULL DEFAULT 'parent',
  can_manage         boolean NOT NULL DEFAULT true,
  can_view_progress  boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, guardian_id)
);
CREATE INDEX child_guardians_guardian_idx ON child_guardians (guardian_id);

CREATE TABLE consent_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id       uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  guardian_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  consent_type   text NOT NULL CHECK (consent_type IN ('learning_data','microphone','ai_teacher_disclosure')),
  granted        boolean NOT NULL,
  policy_version text NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_child_idx ON consent_records (child_id, consent_type, recorded_at DESC);

-- Audit trail deliberately has NO foreign key to children so a deletion remains auditable
-- without retaining the child's data. Metadata must never contain free text from the child.
CREATE TABLE audit_events (
  id          bigserial PRIMARY KEY,
  actor_id    text,
  child_id    uuid,
  action      text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_actor_idx ON audit_events (actor_id, created_at DESC);

CREATE TABLE deletion_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id   text NOT NULL,
  child_id      uuid NOT NULL,
  status        text NOT NULL CHECK (status IN ('completed','failed')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
