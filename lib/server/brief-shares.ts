import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { buildPersonalBrief } from '../records/personal-brief'
import {
  createBriefShareSchema,
  type CreateBriefShare,
  type OwnedBriefShare,
  type SharedBrief,
} from '../records/brief-sharing'
import { readWorkspace } from './workspaces'
import { seal, unseal } from './vault.mjs'

export const MAX_ACTIVE_BRIEF_SHARES = 10
export const MAX_SHARED_BRIEF_BYTES = 256 * 1024
export class BriefShareError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
type Row = {
  id: string
  user_id: string
  request_id: string
  token_hash: string
  payload: string | null
  created_at: number
  expires_at: number
  revoked_at: number | null
  opens: number
  last_opened_at: number | null
}
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const iso = (time: number) => new Date(time).toISOString()

function expireShares(db: Database.Database, now: number) {
  db.prepare(
    'UPDATE brief_share SET payload = NULL WHERE expires_at <= ? AND payload IS NOT NULL',
  ).run(now)
}

function ownedShare(row: Row): OwnedBriefShare {
  const saved = JSON.parse(unseal(row.payload!, `brief-share:${row.user_id}:${row.id}`)) as {
    token: string
    brief: SharedBrief
  }
  return {
    id: row.id,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    opens: row.opens,
    lastOpenedAt: row.last_opened_at === null ? null : iso(row.last_opened_at),
    ...saved,
  }
}

export function listBriefShares(db: Database.Database, userId: string, now = Date.now()) {
  return db
    .transaction(() => {
      expireShares(db, now)
      const rows = db
        .prepare(
          'SELECT * FROM brief_share WHERE user_id = ? AND payload IS NOT NULL AND revoked_at IS NULL ORDER BY created_at DESC',
        )
        .all(userId) as Row[]
      return rows.map(ownedShare)
    })
    .immediate()
}

export function createBriefShare(
  db: Database.Database,
  user: { id: string; name: string },
  input: CreateBriefShare,
  now = Date.now(),
): OwnedBriefShare {
  input = createBriefShareSchema.parse(input)
  expireShares(db, now)
  return db
    .transaction(() => {
      const previous = db
        .prepare('SELECT * FROM brief_share WHERE user_id = ? AND request_id = ?')
        .get(user.id, input.requestId) as Row | undefined
      if (previous) {
        if (!previous.payload || previous.revoked_at !== null)
          throw new BriefShareError(
            410,
            'This link has expired or was revoked. Review the brief to create another.',
          )
        return ownedShare(previous)
      }
      const saved = readWorkspace(db, user.id)
      if (saved.revision !== input.revision)
        throw new BriefShareError(
          409,
          'Your workspace changed. Close and reopen the brief before sharing.',
        )
      const selection = input.selection
      for (const [requested, available] of [
        [selection.recordIds, saved.state.records],
        [selection.questionIds, saved.state.questions],
        [selection.pastVisitIds, saved.state.visitHistory],
        [selection.medicationIds, saved.state.medications],
        [selection.allergyIds, saved.state.allergies],
      ] as const) {
        const known = new Set(available.map((item) => item.id))
        if (requested.some((id) => !known.has(id)))
          throw new BriefShareError(
            409,
            'Some selected information changed. Close and reopen the brief before sharing.',
          )
      }
      const brief = buildPersonalBrief(saved.state, user.name, selection, input.preparedOn)
      if (!brief.sections.length)
        throw new BriefShareError(422, 'Select something to include in the shared brief.')
      const contents = JSON.stringify(brief)
      if (digest(contents) !== input.previewHash)
        throw new BriefShareError(
          409,
          'The preview changed. Close and reopen the brief before sharing.',
        )
      if (Buffer.byteLength(contents, 'utf8') > MAX_SHARED_BRIEF_BYTES)
        throw new BriefShareError(
          422,
          'This brief is too large to share. Select fewer records or notes.',
        )
      const active = db
        .prepare(
          'SELECT count(*) AS count FROM brief_share WHERE user_id = ? AND payload IS NOT NULL AND revoked_at IS NULL',
        )
        .get(user.id) as { count: number }
      if (active.count >= MAX_ACTIVE_BRIEF_SHARES)
        throw new BriefShareError(
          422,
          'You have 10 active links. Revoke a link before creating another.',
        )
      const id = randomUUID()
      const token = randomBytes(32).toString('base64url')
      const payload = seal(JSON.stringify({ token, brief }), `brief-share:${user.id}:${id}`)
      db.prepare(
        `INSERT INTO brief_share(id, user_id, request_id, token_hash, payload, record_ids, question_ids, past_visit_ids, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        user.id,
        input.requestId,
        digest(token),
        payload,
        JSON.stringify(selection.recordIds),
        JSON.stringify(selection.questionIds),
        JSON.stringify(selection.pastVisitIds),
        now,
        now + input.expiresInHours * 60 * 60 * 1000,
      )
      const item = db.prepare(
        'INSERT OR IGNORE INTO brief_share_item(share_id, kind, item_id) VALUES (?, ?, ?)',
      )
      for (const medicationId of selection.medicationIds) item.run(id, 'medication', medicationId)
      for (const allergyId of selection.allergyIds) item.run(id, 'allergy', allergyId)
      return ownedShare(db.prepare('SELECT * FROM brief_share WHERE id = ?').get(id) as Row)
    })
    .immediate()
}

export function revokeBriefShare(
  db: Database.Database,
  userId: string,
  id: string,
  now = Date.now(),
) {
  // An absent or foreign identifier gets the same idempotent result.
  db.prepare(
    'UPDATE brief_share SET payload = NULL, revoked_at = coalesce(revoked_at, ?) WHERE user_id = ? AND id = ?',
  ).run(now, userId, id)
}

export function revokeAllBriefShares(db: Database.Database, userId: string, now = Date.now()) {
  db.prepare(
    'UPDATE brief_share SET payload = NULL, revoked_at = coalesce(revoked_at, ?) WHERE user_id = ?',
  ).run(now, userId)
}

export function revokeBriefSharesForItem(
  db: Database.Database,
  userId: string,
  kind: 'record' | 'question' | 'pastVisit' | 'medication' | 'allergy',
  id: string,
  now = Date.now(),
) {
  if (kind === 'medication' || kind === 'allergy') {
    db.prepare(
      'UPDATE brief_share SET payload = NULL, revoked_at = coalesce(revoked_at, ?) WHERE user_id = ? AND EXISTS (SELECT 1 FROM brief_share_item WHERE share_id = brief_share.id AND kind = ? AND item_id = ?)',
    ).run(now, userId, kind, id)
    return
  }
  const column = { record: 'record_ids', question: 'question_ids', pastVisit: 'past_visit_ids' }[
    kind
  ]
  db.prepare(
    `UPDATE brief_share SET payload = NULL, revoked_at = coalesce(revoked_at, ?) WHERE user_id = ? AND EXISTS (SELECT 1 FROM json_each(${column}) WHERE value = ?)`,
  ).run(now, userId, id)
}

export function briefShareMetadata(db: Database.Database, userId: string, now = Date.now()) {
  expireShares(db, now)
  const rows = db
    .prepare('SELECT * FROM brief_share WHERE user_id = ? ORDER BY created_at')
    .all(userId) as Row[]
  return rows.map((row) => ({
    id: row.id,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    revokedAt: row.revoked_at === null ? null : iso(row.revoked_at),
    lastOpenedAt: row.last_opened_at === null ? null : iso(row.last_opened_at),
    status: row.revoked_at !== null ? 'revoked' : row.expires_at <= now ? 'expired' : 'active',
  }))
}

export function allowSharedBriefRead(db: Database.Database, token?: string, now = Date.now()) {
  return db
    .transaction(() => {
      const shared =
        token && /^[A-Za-z0-9_-]{43}$/.test(token)
          ? (db
              .prepare(
                'SELECT id, read_window_start, read_count FROM brief_share WHERE token_hash = ? AND payload IS NOT NULL AND revoked_at IS NULL AND expires_at > ?',
              )
              .get(digest(token), now) as
              { id: string; read_window_start: number; read_count: number } | undefined)
          : undefined
      if (shared) {
        if (now - shared.read_window_start < 60000 && shared.read_count >= 120) return false
        if (now - shared.read_window_start >= 60000)
          db.prepare(
            'UPDATE brief_share SET read_window_start = ?, read_count = 1 WHERE id = ?',
          ).run(now, shared.id)
        else
          db.prepare('UPDATE brief_share SET read_count = read_count + 1 WHERE id = ?').run(
            shared.id,
          )
        return true
      }
      // A miss uses one fixed bucket. Random tokens cannot create unbounded state or
      // consume a recipient's valid-token allowance.
      const row = db
        .prepare('SELECT window_start, count FROM brief_share_rate_limit WHERE id = 1')
        .get() as { window_start: number; count: number } | undefined
      if (row && now - row.window_start < 60000 && row.count >= 600) return false
      if (!row || now - row.window_start >= 60000)
        db.prepare(
          'INSERT INTO brief_share_rate_limit VALUES (1, ?, 1) ON CONFLICT(id) DO UPDATE SET window_start=excluded.window_start, count=1',
        ).run(now)
      else db.prepare('UPDATE brief_share_rate_limit SET count = count + 1 WHERE id = 1').run()
      return true
    })
    .immediate()
}

export function readSharedBrief(db: Database.Database, token: string, now = Date.now()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  return db
    .transaction(() => {
      const row = db
        .prepare('SELECT * FROM brief_share WHERE token_hash = ?')
        .get(digest(token)) as Row | undefined
      if (!row || row.revoked_at !== null) return null
      if (row.expires_at <= now) {
        db.prepare('UPDATE brief_share SET payload = NULL WHERE id = ?').run(row.id)
        return null
      }
      if (!row.payload) return null
      const { brief } = ownedShare(row)
      db.prepare('UPDATE brief_share SET opens = opens + 1, last_opened_at = ? WHERE id = ?').run(
        now,
        row.id,
      )
      return { brief, expiresAt: iso(row.expires_at) }
    })
    .immediate()
}
