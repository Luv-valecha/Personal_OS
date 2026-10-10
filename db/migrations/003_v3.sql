-- V3.0 — additive only. Nothing is dropped; existing rows are preserved/backfilled.

-- ── Task ordering ───────────────────────────────────────────────────────────
-- manual_position: fractional ordering key (lower = higher in the list). Moving one task updates only that row.
-- New tasks default to "top of list" (very negative, time-based). Display order never touches priority/due date.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manual_position double precision NOT NULL DEFAULT (-extract(epoch from clock_timestamp()));
-- Backfill existing tasks so the initial manual order equals the V2 Tasks-page order (open first, due date, newest).
UPDATE tasks t SET manual_position = r.rn * 1024.0
FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY completed, due_date NULLS LAST, created_at DESC) AS rn FROM tasks) r
WHERE r.id = t.id AND t.manual_position < 0 AND NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '003_v3.sql');
CREATE INDEX IF NOT EXISTS tasks_manual_idx ON tasks(user_id, manual_position);
ALTER TABLE dashboard_settings ADD COLUMN IF NOT EXISTS task_sort text NOT NULL DEFAULT 'manual' CHECK (task_sort IN ('manual','priority','due','created','title'));

-- ── Project ideas / idea → task links ───────────────────────────────────────
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;   -- deleting a project keeps the idea
CREATE INDEX IF NOT EXISTS ideas_project_idx ON ideas(user_id, project_id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_idea_id uuid REFERENCES ideas(id) ON DELETE SET NULL;  -- deleting an idea keeps its tasks
CREATE INDEX IF NOT EXISTS tasks_source_idea_idx ON tasks(source_idea_id);

-- ── Lucifer Music: metadata only (audio bytes never leave the device) ───────
CREATE TABLE IF NOT EXISTS music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  artist text NOT NULL DEFAULT '',
  album text NOT NULL DEFAULT '',
  duration_sec integer,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  fingerprint text NOT NULL,           -- "name|size" — used to re-link the same file on another device/session
  favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS music_tracks_user_idx ON music_tracks(user_id, favorite);
CREATE TABLE IF NOT EXISTS music_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS music_playlists_user_idx ON music_playlists(user_id);
CREATE TABLE IF NOT EXISTS music_playlist_tracks (
  playlist_id uuid NOT NULL REFERENCES music_playlists(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES music_tracks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position double precision NOT NULL,
  PRIMARY KEY (playlist_id, track_id)
);
CREATE INDEX IF NOT EXISTS music_pt_idx ON music_playlist_tracks(playlist_id, position);
