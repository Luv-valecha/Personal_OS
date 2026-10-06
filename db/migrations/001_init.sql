-- Personal Dashboard schema (PostgreSQL). Every user-owned table has user_id with ON DELETE CASCADE.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT 'Lucifer',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('idea','planned','in_progress','paused','completed','archived')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  start_date date,
  deadline date,
  links jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id, status);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date date,
  tags text[] NOT NULL DEFAULT '{}',
  recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly','monthly')),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_user_due_idx ON tasks(user_id, completed, due_date);
CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks(project_id);
CREATE INDEX IF NOT EXISTS tasks_title_trgm ON tasks USING gin (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subtasks_task_idx ON subtasks(task_id);

CREATE TABLE IF NOT EXISTS deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_date date NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  course text NOT NULL DEFAULT '',
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deadlines_user_idx ON deadlines(user_id, completed, due_date);
CREATE INDEX IF NOT EXISTS deadlines_title_trgm ON deadlines USING gin (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_user_idx ON notes(user_id, archived, pinned, updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_title_trgm ON notes USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS notes_body_trgm ON notes USING gin (body gin_trgm_ops);

CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  domain text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('development','research','education','entertainment','shopping','ideas','other')),
  tags text[] NOT NULL DEFAULT '{}',
  favorite boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookmarks_user_idx ON bookmarks(user_id, archived, created_at DESC);
CREATE INDEX IF NOT EXISTS bookmarks_title_trgm ON bookmarks USING gin (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  reminder_minutes integer,
  recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly','monthly')),
  external_source text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_user_idx ON events(user_id, starts_at);

CREATE TABLE IF NOT EXISTS ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox','considering','building','completed','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ideas_user_idx ON ideas(user_id, status);
CREATE INDEX IF NOT EXISTS ideas_title_trgm ON ideas USING gin (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'focus' CHECK (kind IN ('focus','break')),
  seconds integer NOT NULL CHECK (seconds > 0),
  started_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS focus_user_idx ON focus_sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  category text NOT NULL DEFAULT 'other',
  description text NOT NULL DEFAULT '',
  spent_on date NOT NULL DEFAULT CURRENT_DATE,
  external_source text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_user_idx ON expenses(user_id, spent_on DESC);

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes integer NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  storage text NOT NULL DEFAULT 'postgres',
  data bytea,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS files_user_idx ON files(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS files_name_trgm ON files USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS dev_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  github_url text NOT NULL DEFAULT '',
  deploy_url text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  tech_stack text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','building','paused','archived')),
  notes text NOT NULL DEFAULT '',
  todos jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dev_projects_user_idx ON dev_projects(user_id);

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  action text NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activities_user_idx ON activities(user_id, created_at DESC);

-- One row per user: dashboard layout, theme choice, preferences
CREATE TABLE IF NOT EXISTS dashboard_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  layout jsonb NOT NULL DEFAULT '[]',
  theme text NOT NULL DEFAULT 'dark',
  motion text NOT NULL DEFAULT 'full' CHECK (motion IN ('full','reduced','off')),
  weather_city text NOT NULL DEFAULT '',
  monthly_budget numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT '₹',
  active_custom_theme uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  tokens jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS themes_user_idx ON themes(user_id);
