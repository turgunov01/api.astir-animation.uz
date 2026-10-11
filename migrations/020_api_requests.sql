-- Every API request (app, admin, devices) for the admin "Отладка API": kept
-- 30 days for statistics; the masked request/response details for 7 days.
CREATE TABLE IF NOT EXISTS api_requests (
  id uuid PRIMARY KEY,
  at timestamptz NOT NULL,
  method text NOT NULL,
  route text NOT NULL,
  path text NOT NULL,
  status integer NOT NULL,
  duration_ms real NOT NULL,
  client text NOT NULL,
  user_id text,
  user_summary jsonb,
  request_id text,
  error text,
  query jsonb,
  detail jsonb
);
CREATE INDEX IF NOT EXISTS api_requests_at_idx ON api_requests (at DESC);
CREATE INDEX IF NOT EXISTS api_requests_status_at_idx ON api_requests (status, at DESC) WHERE status >= 400;
