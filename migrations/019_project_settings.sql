-- Project-wide settings edited in the admin "Настройки" page and served to
-- the mobile apps (API address, versions, maintenance, features, contacts).
CREATE TABLE IF NOT EXISTS project_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
