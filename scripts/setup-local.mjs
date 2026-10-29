import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import Database from 'better-sqlite3'
import { getMigrations } from 'better-auth/db/migration'

const envPath = resolve('.env.local')
if (!existsSync(envPath)) {
  writeFileSync(
    envPath,
    [
      'BETTER_AUTH_URL=http://127.0.0.1:3000',
      `BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}`,
      'AETHER_DATABASE_PATH=.data/aether.sqlite',
      'AETHER_LOCAL_ACCOUNTS=1',
      '',
    ].join('\n'),
    { flag: 'wx', mode: 0o600 },
  )
}
process.loadEnvFile(envPath)
const filename = resolve(process.env.AETHER_DATABASE_PATH || '.data/aether.sqlite')
mkdirSync(dirname(filename), { recursive: true })
const db = new Database(filename)
db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')
const migration = await getMigrations({ database: db, rateLimit: { storage: 'database' } })
await migration.runMigrations()
const sql = readFileSync(new URL('../migrations/001-workspaces.sql', import.meta.url), 'utf8')
db.exec(sql)
db.close()
console.log(
  'Local account storage is ready. Use http://127.0.0.1:3000. Keep all workspace content fictional.',
)
