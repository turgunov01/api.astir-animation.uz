CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE series
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS series_category_id_idx ON series(category_id);
