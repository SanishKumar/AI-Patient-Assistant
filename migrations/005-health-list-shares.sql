CREATE TABLE IF NOT EXISTS brief_share_item (
  share_id TEXT NOT NULL REFERENCES brief_share(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('medication', 'allergy')),
  item_id TEXT NOT NULL,
  PRIMARY KEY(share_id, kind, item_id)
);
CREATE INDEX IF NOT EXISTS brief_share_item_lookup ON brief_share_item(kind, item_id);
