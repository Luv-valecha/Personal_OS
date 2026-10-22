-- JARVIS memory: short facts the user asked JARVIS to remember. Viewable/editable in Settings → JARVIS memory.
CREATE TABLE IF NOT EXISTS jarvis_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 500),
  source text NOT NULL DEFAULT 'jarvis' CHECK (source IN ('jarvis', 'user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_memories_user_idx ON jarvis_memories(user_id, updated_at DESC);
