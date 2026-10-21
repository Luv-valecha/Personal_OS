-- V4.0.0 core (additive; nothing is dropped).
-- 1) Optional scheduled date for tasks (the day you intend to work on it). due_date (the deadline) is untouched.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_date date;
CREATE INDEX IF NOT EXISTS tasks_user_sched_idx ON tasks(user_id, scheduled_date) WHERE scheduled_date IS NOT NULL;

-- 2) Project deletion policy: everything owned by a project is deleted WITH it, atomically (one DELETE statement).
--    Previously these FKs were ON DELETE SET NULL, which silently orphaned tasks/ideas/notes/deadlines/files.
--    NOTE: tasks.source_idea_id stays ON DELETE SET NULL (deleting an idea never deletes an unrelated task).
DO $$
DECLARE t text; c text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tasks','ideas','notes','deadlines','files'] LOOP
    FOR c IN
      SELECT con.conname FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
      WHERE con.contype = 'f' AND rel.relname = t AND att.attname = 'project_id'
        AND con.confrelid = 'projects'::regclass
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, c);
    END LOOP;
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE', t, t || '_project_id_fkey');
  END LOOP;
END $$;
