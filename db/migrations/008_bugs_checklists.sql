-- V4.0.0: project bugs + checklists. Additive only. Ownership is enforced by the DATABASE (composite FKs on (id, user_id)),
-- so a record can never point at another user's project/checklist even if application code had a bug.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_id_user_uniq' AND conrelid = 'projects'::regclass) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_id_user_uniq UNIQUE (id, user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date date,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, user_id) REFERENCES projects(id, user_id) ON DELETE CASCADE   -- bugs die with their project (same policy as tasks/ideas)
);
CREATE INDEX IF NOT EXISTS bugs_project_idx ON bugs(user_id, project_id, status);
CREATE INDEX IF NOT EXISTS bugs_status_idx ON bugs(user_id, status);

CREATE TABLE IF NOT EXISTS checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid,                                  -- optional link; a linked checklist is deleted with its project
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  FOREIGN KEY (project_id, user_id) REFERENCES projects(id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS checklists_user_idx ON checklists(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(btrim(text)) BETWEEN 1 AND 300),
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (checklist_id, user_id) REFERENCES checklists(id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS checklist_items_idx ON checklist_items(checklist_id, position);
