CREATE TABLE learning_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id           uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  lesson_version_id  uuid NOT NULL REFERENCES lesson_versions(id),
  state              text NOT NULL CHECK (state IN
                       ('introduction','explanation','guided_practice','independent_attempt','correction','recap','completion')),
  activity_index     integer NOT NULL DEFAULT 0,
  teacher_mode       text NOT NULL CHECK (teacher_mode IN ('demo','llm')),
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz
);
CREATE INDEX learning_sessions_child_idx ON learning_sessions (child_id, started_at DESC);

CREATE TABLE session_events (
  id          bigserial PRIMARY KEY,
  session_id  uuid NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
  type        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_events_session_idx ON session_events (session_id, id);

CREATE TABLE attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
  child_id      uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  activity_id   uuid NOT NULL REFERENCES activities(id),
  answer        jsonb NOT NULL,
  is_correct    boolean NOT NULL,
  hints_used    integer NOT NULL DEFAULT 0,
  phase         text NOT NULL CHECK (phase IN ('guided_practice','independent_attempt','correction')),
  graded_by     text NOT NULL DEFAULT 'deterministic',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attempts_child_idx ON attempts (child_id, created_at DESC);

-- Evidence is append-only; a mastery estimate is derived from it, never set by "session ended".
CREATE TABLE skill_evidence (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  skill_id    text NOT NULL REFERENCES skills(id),
  attempt_id  uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  success     boolean NOT NULL,
  independent boolean NOT NULL,       -- true only for attempts made without hints in the independent phase
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX skill_evidence_child_skill_idx ON skill_evidence (child_id, skill_id);

CREATE TABLE mastery_estimates (
  child_id        uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  skill_id        text NOT NULL REFERENCES skills(id),
  estimate        numeric(4,3) NOT NULL CHECK (estimate BETWEEN 0 AND 1),
  evidence_count  integer NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Parents can correct an inaccurate record; the override is shown alongside the computed value.
  parent_note     text CHECK (parent_note IS NULL OR char_length(parent_note) <= 500),
  PRIMARY KEY (child_id, skill_id)
);
