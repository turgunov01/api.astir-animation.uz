-- Sign in with Apple: keep Apple's refresh token so it can be revoked when the
-- user deletes the account (App Store Review Guideline 5.1.1(v)).
-- Runs inside a single transaction via scripts/db-migrate.js.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS apple_refresh_token text,
  ADD COLUMN IF NOT EXISTS apple_client_id text;
