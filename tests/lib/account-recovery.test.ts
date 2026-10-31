import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { getMigrations } from 'better-auth/db/migration'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createAuth } from '../../lib/server/auth'
import { deliverNext, enqueueMail } from '../../lib/server/mail.mjs'
import { unseal } from '../../lib/server/vault.mjs'

let db: Database.Database
beforeEach(async () => {
  vi.stubEnv('BETTER_AUTH_URL', 'https://aether.example.test')
  vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(48).toString('base64url'))
  vi.stubEnv('AETHER_DATA_KEY', randomBytes(32).toString('base64'))
  vi.stubEnv('AETHER_LOCAL_ACCOUNTS', '0')
  vi.stubEnv('AETHER_PUBLIC_ACCOUNTS', '1')
  for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'])
    vi.stubEnv(name, 'test-only')
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  const migration = await getMigrations({ database: db, rateLimit: { storage: 'database' } })
  await migration.runMigrations()
  for (const file of [
    '001-workspaces.sql',
    '002-personal-workspaces.sql',
    '003-record-documents.sql',
  ])
    db.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'))
})
afterEach(() => {
  db.close()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
const origin = 'https://aether.example.test'
function emailLink() {
  const row = db
    .prepare('SELECT id, payload FROM mail_outbox ORDER BY rowid DESC LIMIT 1')
    .get() as { id: string; payload: string }
  return JSON.parse(unseal(row.payload, `mail:${row.id}`)).text.match(/https:\/\/\S+/)[0] as string
}

describe('verified accounts and recovery', () => {
  it('blocks unverified sign-in, verifies ownership, resets once, and revokes old sessions', async () => {
    const auth = createAuth(db)
    const post = (path: string, body: object) =>
      auth.handler(
        new Request(`${origin}/api/auth/${path}`, {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    const credentials = { email: 'owner@example.test', password: 'Test-only-password-123' }
    const signup = await post('sign-up/email', {
      ...credentials,
      name: 'Test Owner',
      callbackURL: '/login',
    })
    expect(signup.status).toBe(200)
    expect((await signup.json()).token).toBeNull()
    expect(JSON.stringify(db.prepare('SELECT * FROM mail_outbox').all())).not.toContain(
      credentials.email,
    )
    expect((await post('sign-in/email', credentials)).status).toBe(403)
    expect((await auth.handler(new Request(emailLink()))).status).toBe(302)
    const signed = await post('sign-in/email', credentials)
    expect(signed.status).toBe(200)
    const cookies = signed.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    expect(await auth.api.getSession({ headers: new Headers({ cookie: cookies }) })).not.toBeNull()
    expect(
      (
        await post('request-password-reset', {
          email: credentials.email,
          redirectTo: '/reset-password',
        })
      ).status,
    ).toBe(200)
    const callback = await auth.handler(new Request(emailLink()))
    const token = new URL(callback.headers.get('location')!, origin).searchParams.get('token')
    expect(token).toBeTruthy()
    const replacement = 'Replacement-password-456'
    expect((await post('reset-password', { token, newPassword: replacement })).status).toBe(200)
    expect((await post('reset-password', { token, newPassword: replacement })).status).not.toBe(200)
    expect(await auth.api.getSession({ headers: new Headers({ cookie: cookies }) })).toBeNull()
    expect((await post('sign-in/email', credentials)).status).toBe(401)
    expect((await post('sign-in/email', { ...credentials, password: replacement })).status).toBe(
      200,
    )
    const before = db.prepare('SELECT COUNT(*) AS n FROM mail_outbox').get()
    expect(
      (
        await post('request-password-reset', {
          email: 'unknown@example.test',
          redirectTo: '/reset-password',
        })
      ).status,
    ).toBe(200)
    expect(db.prepare('SELECT COUNT(*) AS n FROM mail_outbox').get()).toEqual(before)
  }, 20000)

  it('refuses public signup configuration without mail or with loopback bypass', () => {
    vi.stubEnv('SMTP_HOST', '')
    expect(() => createAuth(db)).toThrow('SMTP')
    vi.stubEnv('SMTP_HOST', 'test-only')
    vi.stubEnv('BETTER_AUTH_URL', 'http://127.0.0.1:3000')
    expect(() => createAuth(db)).toThrow('public HTTPS')
  })

  it('retries queued mail, deletes delivered payloads, and discards expired links', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    enqueueMail(db, 'test@example.test', 'Verify', 'A private token')
    const sendMail = vi
      .fn()
      .mockRejectedValueOnce(new Error('Provider failure'))
      .mockResolvedValue({})
    const now = Date.now()
    expect(await deliverNext(db, { sendMail }, now)).toBe(true)
    expect(db.prepare('SELECT attempts FROM mail_outbox').get()).toEqual({ attempts: 1 })
    expect(await deliverNext(db, { sendMail }, now + 1000)).toBe(false)
    expect(await deliverNext(db, { sendMail }, now + 30000)).toBe(true)
    expect(db.prepare('SELECT * FROM mail_outbox').all()).toEqual([])
    expect(sendMail.mock.calls[1][0].text).toBe('A private token')
    enqueueMail(db, 'test@example.test', 'Expired', 'Old token')
    expect(await deliverNext(db, { sendMail }, now + 2 * 60 * 60 * 1000)).toBe(false)
    expect(sendMail).toHaveBeenCalledTimes(2)
  })
})
