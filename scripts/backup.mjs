import Database from 'better-sqlite3'
import { existsSync, chmodSync } from 'node:fs'
import { resolve } from 'node:path'

const destination = process.argv[2]
if (!destination) throw new Error('Usage: npm run backup -- /absolute/path/backup.sqlite')
const source = resolve(process.env.AETHER_DATABASE_PATH || '.data/aether.sqlite')
const target = resolve(destination)
if (source === target || existsSync(target))
  throw new Error('Choose a new backup path; existing files are never overwritten')
const db = new Database(source, { readonly: true, fileMustExist: true })
try {
  await db.backup(target)
  chmodSync(target, 0o600)
  const backup = new Database(target, { readonly: true, fileMustExist: true })
  try {
    if (backup.pragma('integrity_check', { simple: true }) !== 'ok')
      throw new Error('Backup integrity check failed')
  } finally {
    backup.close()
  }
  console.log(
    'Consistent SQLite backup created and integrity-checked. Protect it and retain the matching data key separately.',
  )
} finally {
  db.close()
}
