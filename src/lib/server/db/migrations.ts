import type { Db } from "./client";

/**
 * Forward-only, additive migrations. Each runs once, inside a transaction, in order.
 * Never edit a migration that has shipped: add a new one. (No destructive statements.)
 */
export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: "001_school_reading_platform",
    sql: `
CREATE TABLE schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE,
  join_code text NOT NULL UNIQUE,
  name_format text NOT NULL DEFAULT 'first_initial'
    CHECK (name_format IN ('first_name','first_initial','initials','nickname')),
  leaderboard_enabled boolean NOT NULL DEFAULT true,
  class_leaderboard_enabled boolean NOT NULL DEFAULT true,
  require_approval boolean NOT NULL DEFAULT false,
  pin_policy text NOT NULL DEFAULT 'optional' CHECK (pin_policy IN ('off','optional','required')),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  grade text NOT NULL DEFAULT '' CHECK (char_length(grade) <= 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (school_id, name)
);
CREATE INDEX classes_school_idx ON classes (school_id) WHERE archived_at IS NULL;

CREATE TABLE staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  role text NOT NULL CHECK (role IN ('platform_admin','school_admin','teacher')),
  password_hash text NOT NULL,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'platform_admin' AND school_id IS NULL) OR (role <> 'platform_admin' AND school_id IS NOT NULL))
);
CREATE INDEX staff_school_idx ON staff (school_id);

CREATE TABLE staff_classes (
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, class_id)
);

CREATE TABLE staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('school_admin','teacher')),
  class_ids uuid[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  id_hash text NOT NULL UNIQUE,
  id_hint text NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  nickname text CHECK (nickname IS NULL OR char_length(nickname) BETWEEN 1 AND 30),
  name_key text NOT NULL,
  age smallint NOT NULL CHECK (age BETWEEN 3 AND 19),
  language text NOT NULL CHECK (language IN ('ar','fr','en')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','disabled','archived')),
  pin_hash text,
  show_on_leaderboard boolean NOT NULL DEFAULT true,
  ai_consent boolean NOT NULL DEFAULT false,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE INDEX students_school_idx ON students (school_id, status);
CREATE INDEX students_class_idx ON students (class_id);
CREATE INDEX students_dupe_idx ON students (school_id, name_key);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('student','staff')),
  subject_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_subject_idx ON sessions (kind, subject_id);

CREATE TABLE rate_events (
  key text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_events_key_idx ON rate_events (key, at);

CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('globalstorybooks','gutenberg','standardebooks','school')),
  source_id text NOT NULL,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  author text NOT NULL,
  language text NOT NULL CHECK (language IN ('ar','fr','en')),
  synopsis text NOT NULL DEFAULT '',
  age_min smallint NOT NULL,
  age_max smallint NOT NULL,
  reading_level text,
  level_basis text,
  genres text[] NOT NULL DEFAULT '{}',
  subjects text[] NOT NULL DEFAULT '{}',
  est_minutes int,
  word_count int,
  page_count int,
  source_url text NOT NULL,
  license text NOT NULL,
  license_url text NOT NULL,
  attribution text NOT NULL,
  cover_path text,
  content_path text NOT NULL,
  formats text[] NOT NULL DEFAULT '{reader}',
  layout text NOT NULL DEFAULT 'scroll' CHECK (layout IN ('pages','scroll')),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  verified_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id, language)
);
CREATE INDEX books_filter_idx ON books (language, age_min, age_max) WHERE status = 'published';

CREATE TABLE reading_progress (
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  locator jsonb NOT NULL DEFAULT '{}',
  percent real NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  furthest_percent real NOT NULL DEFAULT 0 CHECK (furthest_percent BETWEEN 0 AND 100),
  active_seconds int NOT NULL DEFAULT 0,
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, book_id)
);
CREATE INDEX reading_progress_recent_idx ON reading_progress (student_id, last_read_at DESC);

CREATE TABLE reading_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_beat_at timestamptz NOT NULL DEFAULT now(),
  active_seconds int NOT NULL DEFAULT 0
);
CREATE INDEX reading_sessions_student_idx ON reading_sessions (student_id, started_at);

CREATE TABLE bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  locator jsonb NOT NULL,
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookmarks_idx ON bookmarks (student_id, book_id);

CREATE TABLE completion_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  questions jsonb NOT NULL,
  origin text NOT NULL CHECK (origin IN ('openai','text')),
  attempts int NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX completion_checks_idx ON completion_checks (student_id, book_id, created_at DESC);

CREATE TABLE completions (
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  percent real NOT NULL,
  active_seconds int NOT NULL,
  score smallint,
  method text NOT NULL DEFAULT 'verified' CHECK (method IN ('verified','teacher')),
  awarded_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  PRIMARY KEY (student_id, book_id)
);
CREATE INDEX completions_recent_idx ON completions (completed_at) WHERE voided_at IS NULL;

CREATE TABLE challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  prizes jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK (ends_on >= starts_on)
);
CREATE INDEX challenges_school_idx ON challenges (school_id, starts_on);

CREATE TABLE achievements (
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  code text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, code)
);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_kind text NOT NULL,
  actor_id uuid,
  school_id uuid,
  action text NOT NULL,
  target_kind text,
  target_id text,
  detail jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_school_idx ON audit_events (school_id, at DESC);
`,
  },
  {
    id: "002_catalog_state",
    sql: `
CREATE TABLE catalog_state (
  id int PRIMARY KEY CHECK (id = 1),
  manifest_hash text NOT NULL,
  seeded_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
];

export async function migrate(db: Db): Promise<void> {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const m of MIGRATIONS) {
    const done = await db.query("SELECT 1 FROM schema_migrations WHERE id = $1", [m.id]);
    if (done.rowCount > 0) continue;
    await db.tx(async (t) => {
      await t.query("SELECT pg_advisory_xact_lock(74610001)");
      const again = await t.query("SELECT 1 FROM schema_migrations WHERE id = $1", [m.id]);
      if (again.rowCount > 0) return;
      await t.query(m.sql);
      await t.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
    });
  }
}
