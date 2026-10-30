import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  applyWorkspaceCommand,
  commandSchema,
  readWorkspace,
  RevisionConflict,
  exportWorkspace,
} from '../../lib/server/workspaces'
import { sampleLabCsv } from '../../lib/records/import-csv'
import { personalBrief } from '../../lib/records/personal-brief'
import { emptyVisit, type WorkspaceCommand } from '../../lib/records/workspace'
import { seal, unseal } from '../../lib/server/vault.mjs'

let db: Database.Database
beforeEach(() => {
  process.env.AETHER_DATA_KEY = randomBytes(32).toString('base64')
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(
    "CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES ('owner-a'), ('owner-b');",
  )
  for (const file of ['001-workspaces.sql', '002-personal-workspaces.sql'])
    db.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'))
})
afterEach(() => db.close())
const input = (command: WorkspaceCommand, revision = 0) => ({
  revision,
  requestId: randomUUID(),
  command,
})
const question = { type: 'question', text: 'Private visit question', sourceIds: [] } as const
const imported = () =>
  input({ type: 'import-file', name: 'report.csv', content: sampleLabCsv, belongsToMe: true })

describe('personal workspaces', () => {
  it('starts empty even when a retired account preview exists', () => {
    db.prepare('INSERT INTO workspace VALUES (?, ?, ?, ?)').run(
      'owner-a',
      '{"imported":true}',
      10,
      '2026-10-01',
    )
    expect(readWorkspace(db, 'owner-a').state.records).toEqual([])
    expect(readWorkspace(db, 'owner-a').revision).toBe(0)
    expect(exportWorkspace(db, 'owner-a').retiredSyntheticPreview).toEqual({ imported: true })
    for (const type of ['import', 'reset', 'review'])
      expect(
        commandSchema.safeParse({ revision: 0, requestId: randomUUID(), command: { type } })
          .success,
      ).toBe(false)
  })
  it('revalidates source text, scopes access, and encrypts record contents', () => {
    const data = imported()
    const saved = applyWorkspaceCommand(db, 'owner-a', data)
    expect(saved.state.records[0].status).toBe('unreviewed')
    expect(saved.state.records[0].source.importedCsv?.text).toBe(sampleLabCsv)
    expect(exportWorkspace(db, 'owner-a').records).toHaveLength(1)
    expect(exportWorkspace(db, 'owner-b').records).toHaveLength(0)
    expect(JSON.stringify(db.prepare('SELECT * FROM personal_workspace').all())).not.toContain(
      'Northstar',
    )
    expect(
      JSON.stringify(db.prepare('SELECT * FROM personal_workspace_event').all()),
    ).not.toContain('Northstar')
    expect(() =>
      applyWorkspaceCommand(db, 'owner-a', {
        ...data,
        revision: 1,
        requestId: randomUUID(),
        command: {
          ...data.command,
          type: 'import-file',
          name: 'report.csv',
          belongsToMe: true,
          content: sampleLabCsv.replace('6.7', 'NaN'),
        },
      }),
    ).toThrow()
    expect(readWorkspace(db, 'owner-a').revision).toBe(1)
    expect(
      commandSchema.safeParse({ ...data, command: { ...data.command, status: 'verified' } })
        .success,
    ).toBe(false)
  })
  it('authenticates encrypted state against the owner and rejects tampering or a wrong key', () => {
    applyWorkspaceCommand(db, 'owner-a', imported())
    const row = db.prepare('SELECT state FROM personal_workspace').get() as { state: string }
    db.prepare('INSERT INTO personal_workspace VALUES (?, ?, ?, ?)').run(
      'owner-b',
      row.state,
      1,
      '2026-10-01',
    )
    expect(() => readWorkspace(db, 'owner-b')).toThrow()
    process.env.AETHER_DATA_KEY = randomBytes(32).toString('base64')
    expect(() => readWorkspace(db, 'owner-a')).toThrow()
    const sealed = seal('private content', 'context')
    expect(seal('private content', 'context')).not.toBe(sealed)
    expect(unseal(sealed, 'context')).toBe('private content')
    expect(() => unseal(sealed, 'wrong-context')).toThrow()
    expect(() => unseal(sealed.slice(0, -4) + 'AAAA', 'context')).toThrow()
  })
  it('erases contents and old preview data while preserving stale-write protection', () => {
    const command = input({ ...question, sourceIds: [] })
    applyWorkspaceCommand(db, 'owner-a', command)
    applyWorkspaceCommand(db, 'owner-b', command)
    const erase = input({ type: 'erase', confirmation: 'DELETE' }, 1)
    expect(applyWorkspaceCommand(db, 'owner-a', erase).state.questions).toEqual([])
    expect(exportWorkspace(db, 'owner-a').activity).toEqual([
      { kind: 'erase', revision: 2, occurredAt: expect.any(String) },
    ])
    expect(readWorkspace(db, 'owner-b').state.questions).toHaveLength(1)
    expect(() => applyWorkspaceCommand(db, 'owner-a', command)).toThrow(RevisionConflict)
    expect(applyWorkspaceCommand(db, 'owner-a', erase).revision).toBe(2)
    expect(commandSchema.safeParse({ ...erase, command: { type: 'erase' } }).success).toBe(false)
  })
  it('makes request retries idempotent and rejects stale commands', () => {
    const command = imported()
    expect(applyWorkspaceCommand(db, 'owner-a', command).revision).toBe(1)
    expect(applyWorkspaceCommand(db, 'owner-a', command).revision).toBe(1)
    expect(applyWorkspaceCommand(db, 'owner-b', command).revision).toBe(1)
    expect(() => applyWorkspaceCommand(db, 'owner-a', imported())).toThrow(RevisionConflict)
  })
  it('rolls back state when the activity write fails', () => {
    db.exec(
      "CREATE TRIGGER fail_event BEFORE INSERT ON personal_workspace_event BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    )
    expect(() => applyWorkspaceCommand(db, 'owner-a', imported())).toThrow('test failure')
    expect(readWorkspace(db, 'owner-a').revision).toBe(0)
  })
  it('requires owned sources and detaches deleted records without deleting questions', () => {
    const saved = applyWorkspaceCommand(db, 'owner-a', imported())
    const id = saved.state.records[0].id
    expect(() =>
      applyWorkspaceCommand(db, 'owner-b', input({ ...question, sourceIds: [id] })),
    ).toThrow('linked source')
    applyWorkspaceCommand(db, 'owner-a', input({ ...question, sourceIds: [id] }, 1))
    const removed = applyWorkspaceCommand(
      db,
      'owner-a',
      input({ type: 'remove-record', id, confirmation: 'DELETE' }, 2),
    )
    expect(removed.state.records).toEqual([])
    expect(removed.state.questions[0]).toMatchObject({ text: question.text, sourceIds: [] })
  })
  it('keeps journal entries self-reported and exports the actual visit without invented facts', () => {
    applyWorkspaceCommand(
      db,
      'owner-a',
      input({
        type: 'note',
        note: {
          date: '2026-10-01',
          title: 'Something to discuss',
          text: 'A personal observation\nA second line',
        },
      }),
    )
    const saved = applyWorkspaceCommand(
      db,
      'owner-a',
      input(
        {
          type: 'visit',
          visit: {
            ...emptyVisit,
            date: '2026-11-12',
            clinician: 'My clinic',
            reason: 'Discuss the report',
          },
        },
        1,
      ),
    )
    expect(saved.state.records[0].observations).toEqual([])
    expect(saved.state.records[0].source.personalNote).toBe(true)
    const brief = personalBrief(saved.state, 'Test Owner', '2026-01-01')
    expect(brief).toContain('Test Owner')
    expect(brief).toContain('My clinic')
    expect(brief).toContain('A second line')
    expect(brief).not.toMatch(/Ananya|penicillin|SYNTHETIC/)
    expect(commandSchema.safeParse({ ...imported(), command: { type: 'import' } }).success).toBe(
      false,
    )
    expect(
      commandSchema.safeParse(
        input({ type: 'visit', visit: { ...emptyVisit, date: '2026-02-30' } }),
      ).success,
    ).toBe(false)
  })
  it('deletes personal records and activity when the account is deleted', () => {
    applyWorkspaceCommand(db, 'owner-a', imported())
    db.prepare('DELETE FROM user WHERE id = ?').run('owner-a')
    expect(db.prepare('SELECT * FROM personal_workspace').all()).toEqual([])
    expect(db.prepare('SELECT * FROM personal_workspace_event').all()).toEqual([])
  })
})
