-- Admin on/off switch per payment provider; the app hides disabled ones and
-- the API refuses new payments through them.
CREATE TABLE IF NOT EXISTS payment_providers (
  provider text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
