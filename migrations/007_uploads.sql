-- Private lesson uploads, OCR results, and family-owned practice texts created from confirmed uploads.
CREATE TABLE uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  child_id      uuid REFERENCES child_profiles(id) ON DELETE CASCADE,
  original_name text NOT NULL,
  mime          text NOT NULL CHECK (mime IN ('image/png','image/jpeg','application/pdf')),
  size_bytes    integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256        text NOT NULL,
  language      text NOT NULL CHECK (language IN ('en','fr','ar')),
  status        text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','needs_review','failed','confirmed')),
  ocr_provider  text,
  error_code    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uploads_owner_idx ON uploads (owner_id, created_at DESC);

-- File bytes live in the database (private, covered by backups) and are only served through an authenticated route.
CREATE TABLE upload_blobs (
  upload_id uuid PRIMARY KEY REFERENCES uploads(id) ON DELETE CASCADE,
  data      bytea NOT NULL
);

CREATE TABLE extracted_documents (
  upload_id        uuid PRIMARY KEY REFERENCES uploads(id) ON DELETE CASCADE,
  provider         text NOT NULL,
  text_original    text NOT NULL,
  uncertain_words  jsonb NOT NULL DEFAULT '[]'::jsonb,
  mean_confidence  numeric(5,2),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE family_texts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  child_id   uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  upload_id  uuid REFERENCES uploads(id) ON DELETE SET NULL,
  title      text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 600),
  language   text NOT NULL CHECK (language IN ('en','fr','ar')),
  rights_confirmed boolean NOT NULL CHECK (rights_confirmed),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX family_texts_child_idx ON family_texts (child_id);

-- Attempts may now point at a library text OR a family text.
ALTER TABLE dictation_attempts ALTER COLUMN text_id DROP NOT NULL;
ALTER TABLE dictation_attempts ADD COLUMN family_text_id uuid REFERENCES family_texts(id) ON DELETE SET NULL;
ALTER TABLE reading_attempts ALTER COLUMN text_id DROP NOT NULL;
ALTER TABLE reading_attempts ADD COLUMN family_text_id uuid REFERENCES family_texts(id) ON DELETE SET NULL;
