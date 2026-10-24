-- V4.0.0: optional "glass" look for dashboard widgets (off by default; purely visual). Additive.
ALTER TABLE dashboard_settings ADD COLUMN IF NOT EXISTS glass text NOT NULL DEFAULT 'off' CHECK (glass IN ('off', 'soft', 'strong'));
