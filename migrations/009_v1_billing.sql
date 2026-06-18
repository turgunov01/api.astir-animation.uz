CREATE TABLE IF NOT EXISTS v1_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tariff_id text NOT NULL,
  provider text NOT NULL,
  provider_subscription_id text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'grace_period', 'expired', 'cancelled', 'canceled')),
  started_at timestamptz,
  expires_at timestamptz NOT NULL,
  provider_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subscription_id)
);

CREATE INDEX IF NOT EXISTS v1_subscriptions_parent_id_idx
  ON v1_subscriptions(parent_id);

CREATE INDEX IF NOT EXISTS v1_subscriptions_tariff_id_idx
  ON v1_subscriptions(tariff_id);

CREATE INDEX IF NOT EXISTS v1_subscriptions_status_idx
  ON v1_subscriptions(status);

CREATE TABLE IF NOT EXISTS v1_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES users(id) ON DELETE SET NULL,
  tariff_id text,
  subscription_id uuid REFERENCES v1_subscriptions(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'click',
  provider_ref text,
  kind text NOT NULL DEFAULT 'subscription'
    CHECK (kind IN ('subscription', 'topup', 'refund')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),
  amount text,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UZS',
  description text,
  checkout_url text,
  click_trans_id text,
  click_paydoc_id text,
  merchant_prepare_id bigint,
  merchant_confirm_id bigint,
  expires_at timestamptz,
  processed_at timestamptz,
  provider_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS v1_transactions_parent_id_idx
  ON v1_transactions(parent_id);

CREATE INDEX IF NOT EXISTS v1_transactions_subscription_id_idx
  ON v1_transactions(subscription_id);

CREATE INDEX IF NOT EXISTS v1_transactions_status_idx
  ON v1_transactions(status);

CREATE INDEX IF NOT EXISTS v1_transactions_provider_ref_idx
  ON v1_transactions(provider, provider_ref)
  WHERE provider_ref IS NOT NULL;
