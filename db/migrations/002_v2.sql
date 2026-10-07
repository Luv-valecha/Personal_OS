-- V2.0 — additive only: no existing table/column is dropped or rewritten, so V1 data is preserved.

-- Quick Links widget
CREATE TABLE IF NOT EXISTS quick_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  icon text NOT NULL DEFAULT 'auto',
  category text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  favorite boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quick_links_user_idx ON quick_links(user_id, favorite DESC, position);
CREATE INDEX IF NOT EXISTS quick_links_title_trgm ON quick_links USING gin (title gin_trgm_ops);

-- Theme slideshow (per-user settings live in the existing dashboard_settings row)
ALTER TABLE dashboard_settings ADD COLUMN IF NOT EXISTS slideshow_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE dashboard_settings ADD COLUMN IF NOT EXISTS slideshow_paused boolean NOT NULL DEFAULT false;
ALTER TABLE dashboard_settings ADD COLUMN IF NOT EXISTS slideshow_themes jsonb NOT NULL DEFAULT '[]';
ALTER TABLE dashboard_settings ADD COLUMN IF NOT EXISTS slideshow_interval_min integer NOT NULL DEFAULT 30 CHECK (slideshow_interval_min BETWEEN 5 AND 10080);
ALTER TABLE dashboard_settings ADD COLUMN IF NOT EXISTS slideshow_next_at timestamptz;

-- Priority Now: optional time estimate; Focus ↔ task association (reuses the existing focus_sessions table)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimate_minutes integer CHECK (estimate_minutes IS NULL OR (estimate_minutes BETWEEN 1 AND 1440));
ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS focus_task_idx ON focus_sessions(task_id);
CREATE INDEX IF NOT EXISTS activities_label_trgm ON activities USING gin (label gin_trgm_ops);
