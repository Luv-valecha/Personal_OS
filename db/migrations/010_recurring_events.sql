-- V4.0.0: custom recurring events. Additive; existing events (incl. their none/daily/weekly/monthly values) are untouched.
--  • events.recurrence_rule : structured rule (jsonb) — ONE row per series; occurrences are generated on demand, never stored.
--  • events.recurrence      : now also allows 'custom' (= "see recurrence_rule").
--  • event_exceptions       : per-occurrence "skip" (delete this one) / "override" (edit this one), keyed by the occurrence's original local date.
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_rule jsonb;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_recurrence_check' AND conrelid = 'events'::regclass) THEN
    ALTER TABLE events DROP CONSTRAINT events_recurrence_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_recurrence_check' AND conrelid = 'events'::regclass) THEN
    ALTER TABLE events ADD CONSTRAINT events_recurrence_check CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly', 'custom'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_custom_has_rule' AND conrelid = 'events'::regclass) THEN
    ALTER TABLE events ADD CONSTRAINT events_custom_has_rule CHECK (recurrence <> 'custom' OR recurrence_rule IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_id_user_uniq' AND conrelid = 'events'::regclass) THEN
    ALTER TABLE events ADD CONSTRAINT events_id_user_uniq UNIQUE (id, user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS event_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,                         -- the occurrence's ORIGINAL local date in the series' timezone
  kind text NOT NULL CHECK (kind IN ('skip', 'override')),
  data jsonb,                                            -- for 'override': title/description/location/all_day/starts_at/ends_at
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, occurrence_date),                    -- an occurrence can only be altered once → no duplicates
  CHECK (kind = 'skip' OR data IS NOT NULL),
  FOREIGN KEY (event_id, user_id) REFERENCES events(id, user_id) ON DELETE CASCADE   -- deleting the series deletes its exceptions; ownership enforced by the DB
);
CREATE INDEX IF NOT EXISTS event_exceptions_user_idx ON event_exceptions(user_id, event_id, occurrence_date);
