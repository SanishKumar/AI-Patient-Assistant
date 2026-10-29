import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import {
  applyWorkspaceCommand,
  commandSchema,
  readWorkspace,
  RevisionConflict,
  exportWorkspace,
} from '../../lib/server/workspaces'
import { sampleLabCsv } from '../../lib/records/import-csv'

const schema = readFileSync(new URL('../../migrations/001-workspaces.sql', import.meta.url), 'utf8')
let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(
    "CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES ('owner-a'), ('owner-b');",
  )
  db.exec(schema)
})
afterEach(() => db.close())

describe('saved workspaces', () => {
  it('revalidates imports on the server and keeps their contents scoped to the owner', () => {
    const data = {
      revision: 0,
      requestId: randomUUID(),
      command: {
        type: 'import-file' as const,
        name: 'fictional.csv',
        content: sampleLabCsv,
        fictional: true as const,
      },
    }
    const saved = applyWorkspaceCommand(db, 'owner-a', data)
    expect(saved.state.records?.[0].status).toBe('unreviewed')
    expect(saved.state.records?.[0].source.importedCsv?.text).toBe(sampleLabCsv)
    expect(exportWorkspace(db, 'owner-a').records).toHaveLength(7)
    expect(exportWorkspace(db, 'owner-b').records).toHaveLength(6)
    expect(JSON.stringify(db.prepare('SELECT * FROM workspace_event').all())).not.toContain(
      'Northstar',
    )
    expect(() =>
      applyWorkspaceCommand(db, 'owner-a', {
        ...data,
        revision: 1,
        requestId: randomUUID(),
        command: { ...data.command, content: sampleLabCsv.replace('6.7', 'NaN') },
      }),
    ).toThrow()
    expect(readWorkspace(db, 'owner-a').revision).toBe(1)
    expect(
      commandSchema.safeParse({ ...data, command: { ...data.command, status: 'verified' } })
        .success,
    ).toBe(false)
  })

  it('erases owned contents and prior activity without letting a stale tab restore it', () => {
    const command = {
      revision: 0,
      requestId: randomUUID(),
      command: { type: 'question' as const, text: 'Private fictional question', sourceIds: [] },
    }
    applyWorkspaceCommand(db, 'owner-a', command)
    applyWorkspaceCommand(db, 'owner-b', command)
    const erase = {
      revision: 1,
      requestId: randomUUID(),
      command: { type: 'erase' as const, confirmation: 'DELETE' as const },
    }
    const erased = applyWorkspaceCommand(db, 'owner-a', erase)
    expect(erased.revision).toBe(2)
    expect(erased.state.questions).toEqual([])
    expect(exportWorkspace(db, 'owner-a').activity).toEqual([
      { kind: 'erase', revision: 2, occurredAt: expect.any(String) },
    ])
    expect(readWorkspace(db, 'owner-b').state.questions).toHaveLength(1)
    expect(() => applyWorkspaceCommand(db, 'owner-a', command)).toThrow(RevisionConflict)
    expect(applyWorkspaceCommand(db, 'owner-a', erase).revision).toBe(2)
    expect(commandSchema.safeParse({ ...erase, command: { type: 'erase' } }).success).toBe(false)
  })
  it('scopes reads, mutations, and replay protection to the authenticated owner', () => {
    const input = { revision: 0, requestId: randomUUID(), command: { type: 'import' as const } }
    const a = applyWorkspaceCommand(db, 'owner-a', input)
    expect(a.state.imported).toBe(true)
    expect(readWorkspace(db, 'owner-b').state.imported).toBe(false)
    expect(applyWorkspaceCommand(db, 'owner-a', input).revision).toBe(1)
    expect(applyWorkspaceCommand(db, 'owner-b', input).revision).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS count FROM workspace_event').get()).toEqual({ count: 2 })
  })

  it('rejects stale writes instead of overwriting another tab', () => {
    applyWorkspaceCommand(db, 'owner-a', {
      revision: 0,
      requestId: randomUUID(),
      command: { type: 'import' },
    })
    expect(() =>
      applyWorkspaceCommand(db, 'owner-a', {
        revision: 0,
        requestId: randomUUID(),
        command: { type: 'reset' },
      }),
    ).toThrow(RevisionConflict)
    expect(readWorkspace(db, 'owner-a').state.imported).toBe(true)
  })

  it('rolls back the state when the activity write fails', () => {
    db.exec(
      "CREATE TRIGGER fail_event BEFORE INSERT ON workspace_event BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    )
    expect(() =>
      applyWorkspaceCommand(db, 'owner-a', {
        revision: 0,
        requestId: randomUUID(),
        command: { type: 'import' },
      }),
    ).toThrow('test failure')
    expect(readWorkspace(db, 'owner-a').revision).toBe(0)
    expect(readWorkspace(db, 'owner-a').state.imported).toBe(false)
  })

  it('generates review identity and time on the server without accepting clinical sign-off', () => {
    const before = Date.now()
    const result = applyWorkspaceCommand(db, 'owner-a', {
      revision: 0,
      requestId: randomUUID(),
      command: { type: 'review', action: 'evidence-reviewed' },
    })
    expect(Date.parse(result.state.reviews[0].at)).toBeGreaterThanOrEqual(before)
    expect(result.state.reviews[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(
      commandSchema.safeParse({
        revision: 1,
        requestId: randomUUID(),
        command: { type: 'review', action: 'clinically-signed' },
      }).success,
    ).toBe(false)
    expect(
      commandSchema.safeParse({
        revision: 1,
        requestId: randomUUID(),
        userId: 'owner-b',
        command: { type: 'reset' },
      }).success,
    ).toBe(false)
  })

  it('keeps question content out of the activity ledger and persists after reopening', () => {
    const folder = mkdtempSync(join(tmpdir(), 'aether-workspace-'))
    const filename = join(folder, 'workspace.sqlite')
    let disk = new Database(filename)
    try {
      disk.exec("CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES ('owner-a');")
      disk.exec(schema)
      applyWorkspaceCommand(disk, 'owner-a', {
        revision: 0,
        requestId: randomUUID(),
        command: { type: 'question', text: 'Fictional visit question', sourceIds: ['lab-oct'] },
      })
      expect(JSON.stringify(disk.prepare('SELECT * FROM workspace_event').all())).not.toContain(
        'Fictional visit question',
      )
      disk.close()
      disk = new Database(filename)
      expect(readWorkspace(disk, 'owner-a').state.questions[0].text).toBe(
        'Fictional visit question',
      )
    } finally {
      disk.close()
      if (!resolve(folder).startsWith(`${resolve(tmpdir())}${sep}aether-workspace-`))
        throw new Error('Unexpected test directory')
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
