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
import {
  briefText,
  buildPersonalBrief,
  initialBriefSelection,
} from '../../lib/records/personal-brief'
import { emptyVisit, MAX_VISIT_STEPS, type WorkspaceCommand } from '../../lib/records/workspace'
import { seal, unseal } from '../../lib/server/vault.mjs'

let db: Database.Database
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
  ])
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
  const outcome = {
    date: '2026-01-20',
    clinic: 'My clinic',
    recap: 'Private discussion',
    steps: [{ text: 'Bring my earlier report', due: '2026-02-01' }],
  }
  const recordVisit = {
    type: 'record-visit' as const,
    outcome,
    usePlan: false,
    carryQuestionIds: [],
  }

  it('opens older encrypted workspaces without changing their contents or revision', () => {
    const legacy = { version: 2, records: [], questions: [], visit: { ...emptyVisit } }
    legacy.visit.reason = 'Saved before visit history'
    db.prepare('INSERT INTO personal_workspace VALUES (?, ?, ?, ?)').run(
      'owner-a',
      seal(JSON.stringify(legacy), 'workspace:owner-a'),
      9,
      '2026-01-01',
    )
    expect(readWorkspace(db, 'owner-a')).toEqual({
      revision: 9,
      state: { ...legacy, visitHistory: [], visitCalendarId: expect.any(String) },
    })
    expect(readWorkspace(db, 'owner-a').state.visitCalendarId).toBe(
      readWorkspace(db, 'owner-a').state.visitCalendarId,
    )
    const state = applyWorkspaceCommand(db, 'owner-a', input(recordVisit, 9)).state
    expect(state.visit).toEqual(legacy.visit)
    expect(state.visitHistory[0].plan).toBeNull()
    const corrupt = { ...legacy, visitHistory: null }
    db.prepare('UPDATE personal_workspace SET state = ? WHERE user_id = ?').run(
      seal(JSON.stringify(corrupt), 'workspace:owner-a'),
      'owner-a',
    )
    expect(() => readWorkspace(db, 'owner-a')).toThrow('Unsupported visit history')
  })
  it('keeps a calendar identity through plan edits and starts a new one after archiving or erasure', () => {
    const plan = { ...emptyVisit, date: '2026-02-01', clinician: 'One clinic' }
    const first = applyWorkspaceCommand(db, 'owner-a', input({ type: 'visit', visit: plan })).state
    const edited = applyWorkspaceCommand(
      db,
      'owner-a',
      input({ type: 'visit', visit: { ...plan, date: '2026-02-04' } }, 1),
    ).state
    expect(edited.visitCalendarId).toBe(first.visitCalendarId)
    const archived = applyWorkspaceCommand(
      db,
      'owner-a',
      input({ ...recordVisit, usePlan: true }, 2),
    ).state
    expect(archived.visitCalendarId).not.toBe(first.visitCalendarId)
    const erased = applyWorkspaceCommand(
      db,
      'owner-a',
      input({ type: 'erase', confirmation: 'DELETE' }, 3),
    ).state
    expect(erased.visitCalendarId).not.toBe(archived.visitCalendarId)
  })

  it('moves the selected plan atomically, carries open questions, and detaches removed sources in both places', () => {
    const report = applyWorkspaceCommand(db, 'owner-a', imported()).state.records[0]
    const plan = { ...emptyVisit, date: '2026-01-18', clinician: 'Planned clinic' }
    applyWorkspaceCommand(db, 'owner-a', input({ type: 'visit', visit: plan }, 1))
    const q = applyWorkspaceCommand(
      db,
      'owner-a',
      input({ ...question, sourceIds: [report.id] }, 2),
    ).state.questions[0]
    applyWorkspaceCommand(
      db,
      'owner-a',
      input({ type: 'question', text: 'Already discussed', sourceIds: [] }, 3),
    )
    const command = input({ ...recordVisit, usePlan: true, carryQuestionIds: [q.id] }, 4)
    const saved = applyWorkspaceCommand(db, 'owner-a', command)
    expect(applyWorkspaceCommand(db, 'owner-a', command)).toEqual(saved)
    expect(saved.state.visit).toEqual(emptyVisit)
    expect(saved.state.questions).toEqual([q])
    expect(saved.state.visitHistory[0]).toMatchObject({
      date: outcome.date,
      plan,
      recap: outcome.recap,
      questions: [q, { text: 'Already discussed' }],
    })
    const removed = applyWorkspaceCommand(
      db,
      'owner-a',
      input({ type: 'remove-record', id: report.id, confirmation: 'DELETE' }, 5),
    )
    expect(removed.state.visitHistory[0].questions[0]).toEqual({ ...q, sourceIds: [] })
    expect(removed.state.questions[0].sourceIds).toEqual([])
    expect(exportWorkspace(db, 'owner-a').state.visitHistory).toEqual(removed.state.visitHistory)
    expect(exportWorkspace(db, 'owner-b').state.visitHistory).toEqual([])
    expect(JSON.stringify(exportWorkspace(db, 'owner-a').activity)).not.toContain(outcome.recap)
    expect(JSON.stringify(db.prepare('SELECT state FROM personal_workspace').all())).not.toContain(
      outcome.recap,
    )
  })

  it('edits visit notes and dated steps, keeps completion times, and rejects stale or foreign updates', () => {
    const visit = applyWorkspaceCommand(db, 'owner-a', input(recordVisit)).state.visitHistory[0]
    const stepId = visit.steps[0].id
    const done = { type: 'set-visit-step' as const, id: visit.id, stepId, done: true }
    expect(() => applyWorkspaceCommand(db, 'owner-b', input(done))).toThrow('no longer')
    const checked = applyWorkspaceCommand(db, 'owner-a', input(done, 1)).state.visitHistory[0]
      .steps[0]
    expect(checked.completedAt).toEqual(expect.any(String))
    const edit = {
      type: 'edit-visit-outcome' as const,
      id: visit.id,
      outcome: {
        ...outcome,
        recap: 'Corrected notes',
        steps: [
          { ...outcome.steps[0], id: stepId, due: '' },
          { text: 'Another step', due: '' },
        ],
      },
    }
    expect(() => applyWorkspaceCommand(db, 'owner-a', input(edit, 1))).toThrow(RevisionConflict)
    const changes = applyWorkspaceCommand(db, 'owner-a', input(edit, 2)).state.visitHistory[0]
    expect(changes.steps[0]).toEqual({ ...checked, due: '' })
    expect(changes.steps[1].completedAt).toBeNull()
    const reopened = applyWorkspaceCommand(db, 'owner-a', input({ ...done, done: false }, 3))
    expect(reopened.state.visitHistory[0].steps[0].completedAt).toBeNull()
    const removed = applyWorkspaceCommand(
      db,
      'owner-a',
      input({ type: 'remove-visit', id: visit.id, confirmation: 'DELETE' }, 4),
    )
    expect(removed.state.visitHistory).toEqual([])
    expect(() => applyWorkspaceCommand(db, 'owner-a', input(done, 5))).toThrow('no longer')
  })

  it('rejects unknown questions, invented completion data, invalid dates and oversized follow-up lists', () => {
    expect(() =>
      applyWorkspaceCommand(
        db,
        'owner-a',
        input({ ...recordVisit, carryQuestionIds: [randomUUID()] }),
      ),
    ).toThrow('selected plan')
    expect(() =>
      applyWorkspaceCommand(
        db,
        'owner-a',
        input({ ...recordVisit, outcome: { ...outcome, date: '2999-01-01' } }),
      ),
    ).toThrow('date')
    expect(() =>
      applyWorkspaceCommand(
        db,
        'owner-a',
        input({
          ...recordVisit,
          outcome: { ...outcome, steps: [{ ...outcome.steps[0], id: randomUUID() }] },
        }),
      ),
    ).toThrow('matches this visit')
    for (const steps of [
      [{ ...outcome.steps[0], completedAt: '2026-01-01' }],
      [{ ...outcome.steps[0], due: '2026-02-30' }],
      Array(MAX_VISIT_STEPS + 1).fill(outcome.steps[0]),
    ]) {
      expect(
        commandSchema.safeParse({
          ...input(recordVisit),
          command: { ...recordVisit, outcome: { ...outcome, steps } },
        }).success,
      ).toBe(false)
    }
    expect(readWorkspace(db, 'owner-a').revision).toBe(0)
    applyWorkspaceCommand(db, 'owner-a', input(recordVisit))
    expect(
      applyWorkspaceCommand(db, 'owner-a', input({ type: 'erase', confirmation: 'DELETE' }, 1))
        .state.visitHistory,
    ).toEqual([])
  })
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
    const brief = briefText(
      buildPersonalBrief(
        saved.state,
        'Test Owner',
        {
          ...initialBriefSelection(saved.state),
          recordIds: [saved.state.records[0].id],
        },
        '2026-11-01',
      ),
    )
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
