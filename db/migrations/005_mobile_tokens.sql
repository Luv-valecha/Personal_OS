-- Android companion (V3.5.0): per-device pairing tokens. Additive only — no existing table or column is touched.
-- The token itself is shown to the user ONCE and never stored; only its SHA-256 hash is kept (a database leak cannot be replayed).
CREATE TABLE IF NOT EXISTS api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,                                   -- e.g. "Pixel 8"
  token_hash text NOT NULL UNIQUE,                      -- sha256 hex of the token
  scope text NOT NULL DEFAULT 'jarvis' CHECK (scope IN ('jarvis')),   -- a token can ONLY call the JARVIS endpoint
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS api_tokens_user_idx ON api_tokens(user_id, revoked_at);
