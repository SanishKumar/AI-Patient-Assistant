import Database from 'better-sqlite3'
import { resolve } from 'node:path'

const db = new Database(resolve(process.env.AETHER_DATABASE_PATH || '.data/aether.sqlite'), {
  fileMustExist: true,
})
try {
  db.pragma('busy_timeout = 5000')
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'brief_share'")
    .get()
  if (exists) {
    db.prepare('UPDATE brief_share SET payload = NULL, revoked_at = coalesce(revoked_at, ?)').run(
      Date.now(),
    )
  }
  console.log('All shared brief links in this database have been invalidated.')
} finally {
  db.close()
}
