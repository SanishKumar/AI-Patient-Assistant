import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  applyWorkspaceCommand,
  readWorkspace,
  RevisionConflict,
  exportWorkspace,
} from '../../lib/server/workspaces'
import { newWorkspace, commandSchema, type WorkspaceCommand } from '../../lib/records/workspace'
import {
  medicationSchema,
  allergySchema,
  MAX_MEDICATIONS,
  MAX_ALLERGIES,
} from '../../lib/records/health-list'
import { createBriefShare, readSharedBrief } from '../../lib/server/brief-shares'
import { initialBriefSelection, buildPersonalBrief } from '../../lib/records/personal-brief'
import { sampleLabCsv } from '../../lib/records/import-csv'
import { seal } from '../../lib/server/vault.mjs'

let db: Database.Database
const medication = {
  name: 'Private supplement',
  directions: 'As written on my package',
  usage: 'unsure' as const,
  sourceId: null,
}
const allergy = {
  substance: 'Private substance',
  reaction: 'A reaction I want to discuss',
  sourceId: null,
}
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
})
afterEach(() => db.close())
const input = (command: WorkspaceCommand, revision: number) => ({
  command,
  revision,
  requestId: randomUUID(),
})
const save = (command: WorkspaceCommand) =>
  applyWorkspaceCommand(db, 'owner-a', input(command, readWorkspace(db, 'owner-a').revision))
function share(medicationIds: string[] = [], allergyIds: string[] = []) {
  const saved = readWorkspace(db, 'owner-a')
  const selection = { ...initialBriefSelection(saved.state), medicationIds, allergyIds }
  const preparedOn = '2026-11-14'
  const brief = buildPersonalBrief(saved.state, 'Owner', selection, preparedOn)
  return createBriefShare(
    db,
    { id: 'owner-a', name: 'Owner' },
    {
      type: 'create',
      revision: saved.revision,
      requestId: randomUUID(),
      selection,
      preparedOn,
      expiresInHours: 24,
      reviewed: true,
      previewHash: createHash('sha256').update(JSON.stringify(brief)).digest('hex'),
    },
  )
}

describe('patient-reported health lists', () => {
  it('normalizes older workspaces without inventing medications or allergy assertions', () => {
    const legacy = {
      version: 2,
      records: [],
      questions: [],
      visit: { date: '', time: '', clinician: '', location: '', reason: '' },
      visitHistory: [],
      visitCalendarId: randomUUID(),
    }
    db.prepare('INSERT INTO personal_workspace VALUES (?, ?, ?, ?)').run(
      'owner-a',
      seal(JSON.stringify(legacy), 'workspace:owner-a'),
      7,
      '2026-01-01',
    )
    expect(readWorkspace(db, 'owner-a')).toEqual({
      revision: 7,
      state: { ...legacy, medications: [], allergies: [] },
    })
    db.prepare('UPDATE personal_workspace SET state = ?').run(
      seal(JSON.stringify({ ...legacy, allergies: null }), 'workspace:owner-a'),
    )
    expect(() => readWorkspace(db, 'owner-a')).toThrow('Unsupported health list format')
  })

  it('encrypts entries, scopes owners, and retries saves once', () => {
    const command = input({ type: 'save-medication', medication }, 0)
    const saved = applyWorkspaceCommand(db, 'owner-a', command)
    expect(applyWorkspaceCommand(db, 'owner-a', command)).toEqual(saved)
    save({ type: 'save-allergy', allergy })
    expect(saved.state.medications[0]).toMatchObject({
      ...medication,
      id: expect.any(String),
      recordedAt: expect.any(String),
      updatedAt: expect.any(String),
    })
    expect(readWorkspace(db, 'owner-b').state.medications).toEqual([])
    expect(readWorkspace(db, 'owner-b').state.allergies).toEqual([])
    expect(JSON.stringify(db.prepare('SELECT state FROM personal_workspace').all())).not.toContain(
      'Private',
    )
    expect(JSON.stringify(exportWorkspace(db, 'owner-a').activity)).not.toMatch(
      /Private|written|reaction/,
    )
    expect(exportWorkspace(db, 'owner-a').state.allergies[0]).toMatchObject(allergy)
    expect(() =>
      applyWorkspaceCommand(db, 'owner-a', input({ type: 'save-allergy', allergy }, 0)),
    ).toThrow(RevisionConflict)
  })

  it('edits existing entries while retaining their identity and original recorded time', () => {
    const original = save({ type: 'save-medication', medication }).state.medications[0]
    const updated = save({
      type: 'save-medication',
      id: original.id,
      medication: { ...medication, usage: 'not-taking', directions: '' },
    }).state.medications[0]
    expect(updated).toMatchObject({
      id: original.id,
      recordedAt: original.recordedAt,
      usage: 'not-taking',
      directions: '',
    })
    const concern = save({ type: 'save-allergy', allergy }).state.allergies[0]
    expect(
      save({ type: 'save-allergy', id: concern.id, allergy: { ...allergy, reaction: '' } }).state
        .allergies[0],
    ).toMatchObject({ id: concern.id, recordedAt: concern.recordedAt, reaction: '' })
    expect(() =>
      applyWorkspaceCommand(
        db,
        'owner-b',
        input({ type: 'save-medication', id: original.id, medication }, 0),
      ),
    ).toThrow('no longer')
    expect(() => save({ type: 'save-allergy', id: randomUUID(), allergy })).toThrow('no longer')
    expect(medicationSchema.safeParse({ ...medication, usage: 'prescribed' }).success).toBe(false)
    expect(allergySchema.safeParse({ ...allergy, verified: true }).success).toBe(false)
    expect(
      commandSchema.safeParse({
        ...input({ type: 'save-medication', medication }, 0),
        command: { type: 'save-medication', medication, recordedAt: '2020-01-01' },
      }).success,
    ).toBe(false)
  })

  it('requires owned source records and detaches deletion without changing the reported text', () => {
    const record = save({
      type: 'import-file',
      name: 'my-report.csv',
      content: sampleLabCsv,
      belongsToMe: true,
    }).state.records[0]
    const sourceId = record.id
    save({ type: 'save-medication', medication: { ...medication, sourceId } })
    save({ type: 'save-allergy', allergy: { ...allergy, sourceId } })
    expect(() =>
      applyWorkspaceCommand(
        db,
        'owner-b',
        input({ type: 'save-medication', medication: { ...medication, sourceId } }, 0),
      ),
    ).toThrow('linked source')
    const detached = save({ type: 'remove-record', id: sourceId, confirmation: 'DELETE' }).state
    expect(detached.medications[0]).toMatchObject(medication)
    expect(detached.allergies[0]).toMatchObject(allergy)
  })

  it.each(['medication', 'allergy'] as const)(
    'removes %s snapshots atomically and preserves other lists',
    (kind) => {
      const med = save({ type: 'save-medication', medication }).state.medications[0]
      const concern = save({ type: 'save-allergy', allergy }).state.allergies[0]
      const id = kind === 'medication' ? med.id : concern.id
      const shared = share(kind === 'medication' ? [id] : [], kind === 'allergy' ? [id] : [])
      const remove = {
        type: kind === 'medication' ? ('remove-medication' as const) : ('remove-allergy' as const),
        id,
        confirmation: 'DELETE' as const,
      }
      expect(() => applyWorkspaceCommand(db, 'owner-b', input(remove, 0))).toThrow('no longer')
      db.exec(
        "CREATE TRIGGER fail_health_event BEFORE INSERT ON personal_workspace_event BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
      )
      expect(() => save(remove)).toThrow('test failure')
      expect(readSharedBrief(db, shared.token)).not.toBeNull()
      expect(readWorkspace(db, 'owner-a').state.medications).toHaveLength(1)
      db.exec('DROP TRIGGER fail_health_event')
      save(remove)
      expect(readSharedBrief(db, shared.token)).toBeNull()
      const state = readWorkspace(db, 'owner-a').state
      expect(kind === 'medication' ? state.medications : state.allergies).toEqual([])
      expect(kind === 'medication' ? state.allergies : state.medications).toHaveLength(1)
    },
  )

  it('limits each list while permitting edits and erases entries and their shares together', () => {
    const state = newWorkspace()
    state.medications = Array.from({ length: MAX_MEDICATIONS }, () => ({
      ...medication,
      id: randomUUID(),
      recordedAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }))
    state.allergies = Array.from({ length: MAX_ALLERGIES }, () => ({
      ...allergy,
      id: randomUUID(),
      recordedAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }))
    db.prepare('INSERT INTO personal_workspace VALUES (?, ?, ?, ?)').run(
      'owner-a',
      seal(JSON.stringify(state), 'workspace:owner-a'),
      1,
      '2026-01-01',
    )
    expect(() => save({ type: 'save-medication', medication })).toThrow('50 medication')
    expect(() => save({ type: 'save-allergy', allergy })).toThrow('50 allergy')
    save({ type: 'save-medication', id: state.medications[0].id, medication })
    const shared = share([state.medications[0].id], [state.allergies[0].id])
    const erased = save({ type: 'erase', confirmation: 'DELETE' }).state
    expect(erased.medications).toEqual([])
    expect(erased.allergies).toEqual([])
    expect(readSharedBrief(db, shared.token)).toBeNull()
  })

  it('cascades account removal through stored entries and share dependencies', () => {
    const medicationId = save({ type: 'save-medication', medication }).state.medications[0].id
    share([medicationId, medicationId])
    expect(db.prepare('SELECT count(*) AS count FROM brief_share_item').get()).toEqual({ count: 1 })
    db.prepare('DELETE FROM user WHERE id = ?').run('owner-a')
    expect(db.prepare('SELECT count(*) AS count FROM brief_share_item').get()).toEqual({ count: 0 })
    expect(readWorkspace(db, 'owner-a').state.medications).toEqual([])
  })

  it('rejects shared brief selections that reference health entries outside the owner workspace', () => {
    save({ type: 'save-medication', medication })
    save({ type: 'save-allergy', allergy })
    expect(() => share([randomUUID()])).toThrow('selected information changed')
    expect(() => share([], [randomUUID()])).toThrow('selected information changed')
    expect(db.prepare('SELECT count(*) AS count FROM brief_share').get()).toEqual({ count: 0 })
  })
})
