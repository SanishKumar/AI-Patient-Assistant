CREATE TABLE IF NOT EXISTS workspace (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_event (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  revision INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE(user_id, request_id)
);

CREATE INDEX IF NOT EXISTS workspace_event_user ON workspace_event(user_id, revision);
