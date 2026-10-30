import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import Database from 'better-sqlite3'
import { getMigrations } from 'better-auth/db/migration'
import { vaultKey } from '../lib/server/vault.mjs'

vaultKey()
const filename = resolve(process.env.AETHER_DATABASE_PATH || '.data/aether.sqlite')
mkdirSync(dirname(filename), { recursive: true })
const db = new Database(filename)
db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')
try {
  const migration = await getMigrations({ database: db, rateLimit: { storage: 'database' } })
  await migration.runMigrations()
  const folder = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(folder)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    db.exec(readFileSync(new URL(file, folder), 'utf8'))
} finally {
  db.close()
}
console.log('Database migrations completed.')
