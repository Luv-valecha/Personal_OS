-- V3.1 — split tracker (friends are plain names; nothing is connected to other accounts). Additive only.
CREATE TABLE IF NOT EXISTS friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS friends_user_name_uq ON friends(user_id, lower(name));

-- Ledger. kind decides the sign of the balance (positive = the friend owes ME):
--   lent          +  I paid / lent, they owe me          borrowed       −  they paid / lent, I owe them
--   they_paid_me  −  they paid me back (reduces debt)    i_paid_them    +  I paid them back (reduces what I owe)
CREATE TABLE IF NOT EXISTS split_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lent','borrowed','they_paid_me','i_paid_them')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL DEFAULT '',
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  group_ref uuid,                      -- entries created by one "split equally" action share this id
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS split_entries_user_idx ON split_entries(user_id, friend_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS split_entries_reason_trgm ON split_entries USING gin (reason gin_trgm_ops);
