import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { applyWorkspaceCommand, readWorkspace } from '../../lib/server/workspaces'
import { initialBriefSelection, buildPersonalBrief } from '../../lib/records/personal-brief'
import { newWorkspace } from '../../lib/records/workspace'
import {
  createBriefShare,
  listBriefShares,
  readSharedBrief,
  revokeBriefShare,
  revokeAllBriefShares,
  revokeBriefSharesForItem,
  briefShareMetadata,
  allowSharedBriefRead,
  MAX_SHARED_BRIEF_BYTES,
} from '../../lib/server/brief-shares'
import { createBriefShareSchema } from '../../lib/records/brief-sharing'
import { seal } from '../../lib/server/vault.mjs'

let db: Database.Database
const now = Date.parse('2026-11-12T12:00:00Z')
const user = { id: 'owner-a', name: 'Private Owner' }
beforeEach(() => {
  process.env.AETHER_DATA_KEY = randomBytes(32).toString('base64')
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(
    "CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES ('owner-a'), ('owner-b');",
  )
  for (const file of [
    '001-workspaces.sql',
    '002-personal-workspaces.sql',
    '003-record-documents.sql',
    '004-brief-shares.sql',
    '005-health-list-shares.sql',
  ])
    db.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'))
  applyWorkspaceCommand(db, user.id, {
    revision: 0,
    requestId: randomUUID(),
    command: { type: 'question', text: 'Private question to discuss', sourceIds: [] },
  })
})
afterEach(() => db.close())

function input(overrides: Partial<ReturnType<typeof initialBriefSelection>> = {}) {
  const { state, revision } = readWorkspace(db, user.id)
  const selection = { ...initialBriefSelection(state), ...overrides }
  const preparedOn = '2026-11-12'
  const previewHash = createHash('sha256')
    .update(JSON.stringify(buildPersonalBrief(state, user.name, selection, preparedOn)))
    .digest('hex')
  return {
    type: 'create' as const,
    requestId: randomUUID(),
    revision,
    selection,
    preparedOn,
    previewHash,
    expiresInHours: 1 as const,
    reviewed: true as const,
  }
}

describe('selected brief links', () => {
  it.each(['record', 'question', 'pastVisit', 'erase'] as const)(
    'revokes copied contents through the normal %s deletion command',
    (scope) => {
      let revision = 1
      let selectedId = readWorkspace(db, user.id).state.questions[0].id
      if (scope === 'record') {
        const saved = applyWorkspaceCommand(db, user.id, {
          revision,
          requestId: randomUUID(),
          command: {
            type: 'note',
            note: { date: '2026-01-01', title: 'Private note', text: 'Private note contents' },
          },
        })
        revision = saved.revision
        selectedId = saved.state.records[0].id
      }
      if (scope === 'pastVisit') {
        const saved = applyWorkspaceCommand(db, user.id, {
          revision,
          requestId: randomUUID(),
          command: {
            type: 'record-visit',
            usePlan: false,
            carryQuestionIds: [],
            outcome: {
              date: '2026-01-01',
              clinic: 'Private clinic',
              recap: 'Private recap',
              steps: [],
            },
          },
        })
        revision = saved.revision
        selectedId = saved.state.visitHistory[0].id
      }
      const original = input(
        scope === 'record'
          ? { recordIds: [selectedId] }
          : scope === 'pastVisit'
            ? { pastVisitIds: [selectedId] }
            : {},
      )
      const shared = createBriefShare(db, user, original, now)
      const command =
        scope === 'record'
          ? { type: 'remove-record' as const, id: selectedId, confirmation: 'DELETE' as const }
          : scope === 'pastVisit'
            ? { type: 'remove-visit' as const, id: selectedId, confirmation: 'DELETE' as const }
            : scope === 'question'
              ? { type: 'remove-question' as const, id: selectedId }
              : { type: 'erase' as const, confirmation: 'DELETE' as const }
      applyWorkspaceCommand(db, user.id, { revision, requestId: randomUUID(), command })
      expect(readSharedBrief(db, shared.token, now)).toBeNull()
      expect(() => createBriefShare(db, user, original, now)).toThrow('expired or was revoked')
      expect(db.prepare('SELECT payload FROM brief_share WHERE id = ?').get(shared.id)).toEqual({
        payload: null,
      })
    },
  )

  it('rolls back share revocation with a failed workspace deletion transaction', () => {
    const shared = createBriefShare(db, user, input(), now)
    db.exec(
      "CREATE TRIGGER fail_event BEFORE INSERT ON personal_workspace_event BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    )
    expect(() =>
      applyWorkspaceCommand(db, user.id, {
        revision: 1,
        requestId: randomUUID(),
        command: { type: 'erase', confirmation: 'DELETE' },
      }),
    ).toThrow('test failure')
    expect(readWorkspace(db, user.id).revision).toBe(1)
    expect(readWorkspace(db, user.id).state.questions).toHaveLength(1)
    expect(readSharedBrief(db, shared.token, now)?.brief).toEqual(shared.brief)
  })
  it('stores an immutable encrypted copy, scopes ownership, and returns only the selected brief publicly', () => {
    const command = input()
    const shared = createBriefShare(db, user, command, now)
    expect(shared.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(shared.brief.sections[0].entries).toEqual(['1. Private question to discuss'])
    expect(listBriefShares(db, 'owner-b', now)).toEqual([])
    expect(() => createBriefShare(db, { ...user, id: 'owner-b' }, command, now)).toThrow(
      'workspace changed',
    )
    const raw = JSON.stringify(db.prepare('SELECT * FROM brief_share').all())
    expect(raw).not.toContain(shared.token)
    expect(raw).not.toContain('Private')
    applyWorkspaceCommand(db, user.id, {
      revision: 1,
      requestId: randomUUID(),
      command: { type: 'question', text: 'Added later', sourceIds: [] },
    })
    expect(createBriefShare(db, user, command, now).id).toBe(shared.id)
    expect(listBriefShares(db, user.id, now)).toHaveLength(1)
    expect(readSharedBrief(db, shared.token, now)).toEqual({
      brief: shared.brief,
      expiresAt: shared.expiresAt,
    })
    expect(JSON.stringify(readSharedBrief(db, shared.token, now))).not.toMatch(
      /Added later|owner-a|token|requestId/,
    )
    expect(listBriefShares(db, user.id, now)[0].lastOpenedAt).toBe(new Date(now).toISOString())
    expect(JSON.stringify(briefShareMetadata(db, user.id, now))).not.toMatch(
      /Private|token|question|payload/,
    )
  })

  it('stops expired and revoked links, scrubs the snapshot, and keeps creation retries from recreating them', () => {
    const command = input()
    const shared = createBriefShare(db, user, command, now)
    revokeBriefShare(db, 'owner-b', shared.id, now)
    expect(readSharedBrief(db, shared.token, now)).not.toBeNull()
    revokeBriefShare(db, user.id, shared.id, now)
    revokeBriefShare(db, user.id, shared.id, now)
    expect(readSharedBrief(db, shared.token, now)).toBeNull()
    expect(() => createBriefShare(db, user, command, now)).toThrow('expired or was revoked')
    expect(db.prepare('SELECT payload FROM brief_share WHERE id = ?').get(shared.id)).toEqual({
      payload: null,
    })
    const second = input()
    const expiring = createBriefShare(db, user, second, now)
    expect(readSharedBrief(db, expiring.token, now + 3600000)).toBeNull()
    expect(() => createBriefShare(db, user, second, now + 3600000)).toThrow('expired')
    expect(listBriefShares(db, user.id, now + 3600000)).toEqual([])
    expect(
      db.prepare('SELECT count(*) AS count FROM brief_share WHERE payload IS NOT NULL').get(),
    ).toEqual({ count: 0 })
    expect(briefShareMetadata(db, user.id, now + 3600000)).toMatchObject([
      { status: 'revoked' },
      { status: 'expired' },
    ])
  })

  it('requires the exact reviewed preview, current revision, and owned identifiers', () => {
    const command = input()
    expect(() =>
      createBriefShare(db, user, { ...command, previewHash: '0'.repeat(64) }, now),
    ).toThrow('preview changed')
    expect(() => createBriefShare(db, user, { ...command, revision: 0 }, now)).toThrow(
      'workspace changed',
    )
    expect(() =>
      createBriefShare(
        db,
        user,
        { ...command, selection: { ...command.selection, recordIds: ['foreign'] } },
        now,
      ),
    ).toThrow('selected information changed')
    expect(createBriefShareSchema.safeParse({ ...command, reviewed: false }).success).toBe(false)
    expect(createBriefShareSchema.safeParse({ ...command, expiresInHours: 1000 }).success).toBe(
      false,
    )
    expect(db.prepare('SELECT count(*) AS count FROM brief_share').get()).toEqual({ count: 0 })
  })

  it('revokes all shares that include a removed item and cascades account removal', () => {
    const shared = createBriefShare(db, user, input(), now)
    const q = readWorkspace(db, user.id).state.questions[0]
    revokeBriefSharesForItem(db, 'owner-b', 'question', q.id, now)
    expect(readSharedBrief(db, shared.token, now)).not.toBeNull()
    revokeBriefSharesForItem(db, user.id, 'question', q.id, now)
    expect(readSharedBrief(db, shared.token, now)).toBeNull()
    const second = createBriefShare(db, user, input(), now)
    revokeAllBriefShares(db, user.id, now)
    expect(readSharedBrief(db, second.token, now)).toBeNull()
    createBriefShare(db, user, input(), now)
    db.prepare('DELETE FROM user WHERE id = ?').run(user.id)
    expect(db.prepare('SELECT count(*) AS count FROM brief_share').get()).toEqual({ count: 0 })
  })

  it('bounds active link count and snapshot size', () => {
    for (let i = 0; i < 10; i++) createBriefShare(db, user, input(), now + i)
    expect(() => createBriefShare(db, user, input(), now + 10)).toThrow('10 active links')
    revokeAllBriefShares(db, user.id, now + 10)
    const state = newWorkspace()
    state.questions = [
      { id: randomUUID(), text: 'x'.repeat(MAX_SHARED_BRIEF_BYTES), sourceIds: [] },
    ]
    db.prepare('UPDATE personal_workspace SET state = ? WHERE user_id = ?').run(
      seal(JSON.stringify(state), 'workspace:owner-a'),
      user.id,
    )
    expect(() => createBriefShare(db, user, input(), now + 11)).toThrow('too large')
  })

  it('bounds random misses without sharing another valid token’s allowance', () => {
    const first = createBriefShare(db, user, input(), now)
    const second = createBriefShare(db, user, input(), now)
    for (let i = 0; i < 120; i++) expect(allowSharedBriefRead(db, first.token, now)).toBe(true)
    expect(allowSharedBriefRead(db, first.token, now)).toBe(false)
    expect(allowSharedBriefRead(db, second.token, now)).toBe(true)
    for (let i = 0; i < 600; i++)
      expect(allowSharedBriefRead(db, randomBytes(32).toString('base64url'), now)).toBe(true)
    expect(allowSharedBriefRead(db, undefined, now)).toBe(false)
    expect(allowSharedBriefRead(db, second.token, now)).toBe(true)
    expect(allowSharedBriefRead(db, first.token, now + 60000)).toBe(true)
    expect(db.prepare('SELECT count(*) AS count FROM brief_share_rate_limit').get()).toEqual({
      count: 1,
    })
  })
})
