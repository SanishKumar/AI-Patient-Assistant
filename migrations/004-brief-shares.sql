CREATE TABLE IF NOT EXISTS brief_share (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  payload TEXT,
  record_ids TEXT NOT NULL,
  question_ids TEXT NOT NULL,
  past_visit_ids TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  opens INTEGER NOT NULL DEFAULT 0,
  last_opened_at INTEGER,
  read_window_start INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, request_id)
);
CREATE INDEX IF NOT EXISTS brief_share_owner ON brief_share(user_id, created_at);
CREATE INDEX IF NOT EXISTS brief_share_expiry ON brief_share(expires_at);
CREATE TABLE IF NOT EXISTS brief_share_rate_limit (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
