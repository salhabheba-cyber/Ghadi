-- Dictation and reading practice. Texts are original, license-tracked content; attempts belong to a child and cascade on deletion.
CREATE TABLE practice_texts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  kind        text NOT NULL CHECK (kind IN ('dictation','reading')),
  language    text NOT NULL CHECK (language IN ('en','fr','ar')),
  title       text NOT NULL,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 600),
  age_min     integer NOT NULL DEFAULT 3,
  age_max     integer NOT NULL DEFAULT 5,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','retired')),
  source_id   uuid NOT NULL REFERENCES content_sources(id),
  license_id  text NOT NULL REFERENCES licenses(id)
);

CREATE TABLE dictation_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  text_id     uuid NOT NULL REFERENCES practice_texts(id),
  typed_text  text NOT NULL CHECK (length(typed_text) <= 1000),
  accuracy    numeric(4,3) NOT NULL CHECK (accuracy BETWEEN 0 AND 1),
  result      jsonb NOT NULL,
  input_kind  text NOT NULL DEFAULT 'typed' CHECK (input_kind IN ('typed')), -- handwriting recognition is not implemented
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dictation_attempts_child_idx ON dictation_attempts (child_id, created_at DESC);

-- No speech recognition is connected, so reading attempts are marked by the grown-up listening. word_marks = [{i, status}]
CREATE TABLE reading_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  text_id     uuid NOT NULL REFERENCES practice_texts(id),
  word_marks  jsonb NOT NULL,
  assessed_by text NOT NULL DEFAULT 'guardian' CHECK (assessed_by IN ('guardian')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reading_attempts_child_idx ON reading_attempts (child_id, created_at DESC);
