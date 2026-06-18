ALTER TABLE child_permissions
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES series(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS child_permissions_series_id_idx
  ON child_permissions(series_id);
