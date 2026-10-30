import { randomUUID } from 'node:crypto'
import { seal, unseal } from './vault.mjs'

export function mailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_FROM &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD,
  )
}
export function enqueueMail(db, to, subject, text) {
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    'INSERT INTO mail_outbox(id, payload, available_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(id, seal(JSON.stringify({ to, subject, text }), `mail:${id}`), now, now + 60 * 60 * 1000)
}
export async function deliverNext(db, transport, now = Date.now()) {
  const job = db
    .transaction(() => {
      db.prepare('DELETE FROM mail_outbox WHERE expires_at <= ?').run(now)
      const row = db
        .prepare(
          'SELECT * FROM mail_outbox WHERE available_at <= ? AND lease_until <= ? AND attempts < 8 ORDER BY available_at LIMIT 1',
        )
        .get(now, now)
      if (row)
        db.prepare('UPDATE mail_outbox SET lease_until = ? WHERE id = ?').run(now + 120000, row.id)
      return row
    })
    .immediate()
  if (!job) return false
  try {
    const message = JSON.parse(unseal(job.payload, `mail:${job.id}`))
    await transport.sendMail({ ...message, from: process.env.SMTP_FROM })
    db.prepare('DELETE FROM mail_outbox WHERE id = ?').run(job.id)
  } catch {
    const attempts = job.attempts + 1
    db.prepare(
      'UPDATE mail_outbox SET attempts = ?, available_at = ?, lease_until = 0 WHERE id = ?',
    ).run(attempts, now + Math.min(300000, 10000 * 2 ** attempts), job.id)
    // Never log recipients, links, tokens, provider responses, or message contents.
    console.error('Account email delivery failed; queued for retry.')
  }
  return true
}
