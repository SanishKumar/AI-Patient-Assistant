CREATE TABLE IF NOT EXISTS record_document (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  byte_count INTEGER NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS record_document_owner ON record_document(user_id);
