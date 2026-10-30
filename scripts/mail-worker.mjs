import Database from 'better-sqlite3'
import nodemailer from 'nodemailer'
import { resolve } from 'node:path'
import { deliverNext, mailConfigured } from '../lib/server/mail.mjs'
import { vaultKey } from '../lib/server/vault.mjs'

if (process.env.AETHER_LOAD_LOCAL_ENV === '1') process.loadEnvFile('.env.local')
vaultKey()
if (!mailConfigured()) throw new Error('SMTP configuration is required for the mail worker')
const db = new Database(resolve(process.env.AETHER_DATABASE_PATH || '.data/aether.sqlite'))
db.pragma('busy_timeout = 5000')
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_PORT === '465',
  requireTLS: process.env.SMTP_PORT !== '465',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  connectionTimeout: 15000,
  socketTimeout: 30000,
})
let stopped = false
process.on('SIGTERM', () => {
  stopped = true
})
process.on('SIGINT', () => {
  stopped = true
})
console.log('Account email worker started.')
while (!stopped) {
  const handled = await deliverNext(db, transport)
  if (!handled) await new Promise((done) => setTimeout(done, 3000))
}
transport.close()
db.close()
