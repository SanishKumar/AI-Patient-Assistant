-- Separate tables prevent synthetic preview records from becoming personal records.
CREATE TABLE IF NOT EXISTS personal_workspace (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS personal_workspace_event (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  revision INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE(user_id, request_id)
);
CREATE INDEX IF NOT EXISTS personal_workspace_event_user ON personal_workspace_event(user_id, revision);
CREATE TABLE IF NOT EXISTS workspace_rate_limit (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mail_outbox (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS mail_outbox_ready ON mail_outbox(available_at, lease_until);
