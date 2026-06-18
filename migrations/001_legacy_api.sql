CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text,
  name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone text,
  role text NOT NULL DEFAULT 'parent' CHECK (role IN ('super_admin', 'admin', 'parent')),
  active boolean NOT NULL DEFAULT true,
  avatar_path text,
  avatar_url text,
  auth_provider text,
  auth_subject text,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_provider_subject_idx
  ON users(auth_provider, auth_subject)
  WHERE auth_provider IS NOT NULL AND auth_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'login',
  verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_codes_email_idx ON otp_codes(email);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name jsonb NOT NULL DEFAULT '{}'::jsonb,
  description jsonb NOT NULL DEFAULT '{}'::jsonb,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('film', 'series', 'cartoon', 'other')),
  parent_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  poster_path text,
  poster_url text,
  slug text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS categories_parent_category_id_idx ON categories(parent_category_id);
CREATE INDEX IF NOT EXISTS categories_kind_idx ON categories(kind);

CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name jsonb NOT NULL DEFAULT '{}'::jsonb,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title jsonb NOT NULL DEFAULT '{}'::jsonb,
  description jsonb NOT NULL DEFAULT '{}'::jsonb,
  kind text NOT NULL DEFAULT 'seasons' CHECK (kind IN ('seasons', 'episodes')),
  poster_path text,
  poster_url text,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title jsonb NOT NULL DEFAULT '{}'::jsonb,
  description jsonb NOT NULL DEFAULT '{}'::jsonb,
  slug text NOT NULL UNIQUE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  series_id uuid REFERENCES series(id) ON DELETE SET NULL,
  source_path text,
  poster_path text,
  poster_url text,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'transcoding', 'ready', 'failed')),
  age_rating integer NOT NULL DEFAULT 0,
  duration_sec integer NOT NULL DEFAULT 0,
  season_number integer,
  episode_number integer,
  year integer,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  views_count integer NOT NULL DEFAULT 0,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_category_id_idx ON content(category_id);
CREATE INDEX IF NOT EXISTS content_series_id_idx ON content(series_id);
CREATE INDEX IF NOT EXISTS content_published_idx ON content(published);
CREATE INDEX IF NOT EXISTS content_status_idx ON content(status);

CREATE TABLE IF NOT EXISTS content_tags (
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, tag_id)
);

CREATE TABLE IF NOT EXISTS children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  age integer NOT NULL DEFAULT 0,
  avatar_path text,
  avatar_url text,
  pin_hash text,
  active boolean NOT NULL DEFAULT true,
  extended_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS children_parent_id_idx ON children(parent_id);

CREATE TABLE IF NOT EXISTS child_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('allow', 'deny')),
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  content_id uuid REFERENCES content(id) ON DELETE CASCADE,
  series_id uuid REFERENCES series(id) ON DELETE CASCADE,
  watch_from_min integer,
  watch_until_min integer,
  weekday_mask integer,
  daily_limit_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS child_permissions_child_id_idx ON child_permissions(child_id);
CREATE INDEX IF NOT EXISTS child_permissions_series_id_idx ON child_permissions(series_id);

CREATE TABLE IF NOT EXISTS child_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  device_name text NOT NULL,
  code text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  pairing_expires_at timestamptz,
  paired_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS child_devices_child_id_idx ON child_devices(child_id);
CREATE INDEX IF NOT EXISTS child_devices_fingerprint_idx ON child_devices(device_fingerprint);

CREATE TABLE IF NOT EXISTS child_extension_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  extended_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tv_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES users(id) ON DELETE CASCADE,
  current_child_id uuid REFERENCES children(id) ON DELETE SET NULL,
  device_fingerprint text NOT NULL,
  device_name text NOT NULL,
  code text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  pairing_expires_at timestamptz,
  confirmed_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tv_devices_parent_id_idx ON tv_devices(parent_id);
CREATE INDEX IF NOT EXISTS tv_devices_fingerprint_idx ON tv_devices(device_fingerprint);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name jsonb NOT NULL DEFAULT '{}'::jsonb,
  description jsonb NOT NULL DEFAULT '{}'::jsonb,
  slug text NOT NULL UNIQUE,
  package_code text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UZS',
  duration_days integer NOT NULL DEFAULT 30,
  max_children integer NOT NULL DEFAULT 1,
  spic text,
  vat_percent integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'expired', 'canceled')),
  starts_at timestamptz,
  ends_at timestamptz,
  auto_renew boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);

CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'click' CHECK (provider IN ('click', 'payme', 'stripe', 'manual')),
  provider_token_hash text,
  masked_pan text NOT NULL,
  brand text,
  holder_name text,
  expiry_month integer,
  expiry_year integer,
  is_default boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cards_user_id_idx ON cards(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'click' CHECK (provider IN ('click', 'payme', 'stripe', 'manual')),
  provider_ref text,
  kind text NOT NULL DEFAULT 'subscription' CHECK (kind IN ('subscription', 'topup', 'refund')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UZS',
  description text,
  processed_at timestamptz,
  fiscal_sent_at timestamptz,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions(user_id);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status);
CREATE INDEX IF NOT EXISTS transactions_provider_ref_idx ON transactions(provider_ref);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_content_id_idx ON comments(content_id);

CREATE TABLE IF NOT EXISTS likes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);

CREATE TABLE IF NOT EXISTS blocks (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);

CREATE TABLE IF NOT EXISTS ratings (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);

CREATE TABLE IF NOT EXISTS watch_progress (
  viewer_id uuid NOT NULL,
  viewer_kind text NOT NULL,
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  position_sec integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_id, viewer_kind, content_id)
);

CREATE TABLE IF NOT EXISTS watch_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id uuid NOT NULL,
  viewer_kind text NOT NULL,
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  position_sec integer NOT NULL DEFAULT 0,
  watched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watch_history_viewer_idx ON watch_history(viewer_id, viewer_kind);

CREATE TABLE IF NOT EXISTS recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('category', 'content', 'series')),
  reference_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question jsonb NOT NULL DEFAULT '{}'::jsonb,
  answer jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  last_message_preview text,
  user_unread_count integer NOT NULL DEFAULT 0,
  admin_unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES support_chats(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('user', 'admin')),
  body text,
  attachment_path text,
  attachment_url text,
  attachment_name text,
  attachment_type text,
  attachment_size integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_chat_id_idx ON support_messages(chat_id);

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_table text,
  owner_id uuid,
  kind text NOT NULL,
  path text NOT NULL,
  original_name text,
  mime_type text,
  size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS renditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  label text NOT NULL,
  width integer,
  height integer,
  bitrate integer,
  playlist_path text,
  playlist_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transcoding_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users','categories','tags','series','content','children','child_permissions',
    'child_devices','child_extension_tickets','tv_devices','plans','subscriptions',
    'cards','transactions','comments','ratings','recommendations','faqs',
    'support_chats','support_messages','transcoding_jobs'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', table_name || '_set_updated_at', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name || '_set_updated_at', table_name);
  END LOOP;
END $$;
