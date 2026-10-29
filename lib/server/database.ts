import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

let connection: Database.Database | undefined

export function getDatabase() {
  if (!connection) {
    const filename = resolve(process.env.AETHER_DATABASE_PATH || '.data/aether.sqlite')
    mkdirSync(dirname(filename), { recursive: true })
    connection = new Database(filename)
    connection.pragma('journal_mode = WAL')
    connection.pragma('foreign_keys = ON')
    connection.pragma('busy_timeout = 5000')
  }
  return connection
}
