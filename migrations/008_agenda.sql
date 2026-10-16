-- Study planner. Items proposed from an agenda page are NOT tasks until a parent confirms them (confirmed = true).
CREATE TABLE agenda_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  child_id    uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  due_on      date,
  notes       text CHECK (notes IS NULL OR length(notes) <= 500),
  status      text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','skipped')),
  confirmed   boolean NOT NULL DEFAULT false,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','extracted')),
  source_line text CHECK (source_line IS NULL OR length(source_line) <= 300),
  date_ambiguous boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agenda_child_idx ON agenda_items (child_id, confirmed, due_on);
