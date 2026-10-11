-- Payment provider credentials entered in the admin panel. They override the
-- .env values at runtime; secrets are stored AES-256-GCM encrypted.
CREATE TABLE IF NOT EXISTS payment_provider_settings (
  provider text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  secret boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (provider, key)
);
