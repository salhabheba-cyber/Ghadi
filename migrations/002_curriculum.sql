CREATE TABLE licenses (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  url         text,
  notes       text
);

CREATE TABLE content_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  author       text NOT NULL,
  license_id   text NOT NULL REFERENCES licenses(id),
  jurisdiction text NOT NULL,           -- where the license/rights position applies, e.g. 'international'
  origin_url   text,
  notes        text
);

CREATE TABLE curricula (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  region       text NOT NULL,
  language     text NOT NULL CHECK (language IN ('en','fr','ar')),
  source_id    uuid NOT NULL REFERENCES content_sources(id),
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  -- Honesty flag: an original sample is NOT aligned to any national curriculum unless reviewed.
  alignment_note text NOT NULL
);

CREATE TABLE skills (
  id      text PRIMARY KEY,
  domain  text NOT NULL,
  name_en text NOT NULL
);
CREATE TABLE skill_prerequisites (
  skill_id         text NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  prerequisite_id  text NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (skill_id, prerequisite_id),
  CHECK (skill_id <> prerequisite_id)
);

CREATE TABLE books (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id uuid NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  slug          text NOT NULL,
  title         text NOT NULL,
  grade         text NOT NULL,
  subject       text NOT NULL,
  language      text NOT NULL,
  age_min       integer NOT NULL,
  age_max       integer NOT NULL,
  UNIQUE (curriculum_id, slug)
);
CREATE TABLE units (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id  uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title    text NOT NULL,
  position integer NOT NULL,
  UNIQUE (book_id, position)
);
CREATE TABLE lessons (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id  uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  slug     text NOT NULL UNIQUE,
  position integer NOT NULL,
  UNIQUE (unit_id, position)
);

-- Content is immutable once approved: edits create a new version.
CREATE TABLE lesson_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id    uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  title        text NOT NULL,
  language     text NOT NULL CHECK (language IN ('en','fr','ar')),
  age_min      integer NOT NULL,
  age_max      integer NOT NULL,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','retired')),
  source_id    uuid NOT NULL REFERENCES content_sources(id),
  license_id   text NOT NULL REFERENCES licenses(id),
  content      jsonb NOT NULL,        -- validated by zod (LessonContent) on write and read
  approved_by  text,
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, version),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX lesson_versions_status_idx ON lesson_versions (status, language);

CREATE TABLE learning_objectives (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_version_id uuid NOT NULL REFERENCES lesson_versions(id) ON DELETE CASCADE,
  code              text NOT NULL,
  description       text NOT NULL,
  skill_id          text NOT NULL REFERENCES skills(id),
  UNIQUE (lesson_version_id, code)
);

-- Answers live ONLY in this table's `spec` and are stripped server-side before sending to a client.
CREATE TABLE activities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_version_id uuid NOT NULL REFERENCES lesson_versions(id) ON DELETE CASCADE,
  position          integer NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('choice','count','match')),
  objective_id      uuid NOT NULL REFERENCES learning_objectives(id),
  skill_id          text NOT NULL REFERENCES skills(id),
  spec              jsonb NOT NULL,
  UNIQUE (lesson_version_id, position)
);
