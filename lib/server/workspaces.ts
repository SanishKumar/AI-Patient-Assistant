import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { importLabCsv, MAX_IMPORTED_RECORDS } from '../records/import-csv'
import { commandSchema, newWorkspace, type PersonalWorkspace } from '../records/workspace'
import { metricLabels, type HealthRecord } from '../records/types'
import { seal, unseal } from './vault.mjs'
import type { z } from 'zod'

export { commandSchema }
export type SavedWorkspace = { state: PersonalWorkspace; revision: number }
export class RevisionConflict extends Error {}
export class WorkspaceInputError extends Error {}

export function allowWorkspaceWrite(db: Database.Database, userId: string, now = Date.now()) {
  return db
    .transaction(() => {
      const row = db
        .prepare('SELECT window_start, count FROM workspace_rate_limit WHERE user_id = ?')
        .get(userId) as { window_start: number; count: number } | undefined
      if (row && now - row.window_start < 60000 && row.count >= 120) return false
      if (!row || now - row.window_start >= 60000)
        db.prepare(
          'INSERT INTO workspace_rate_limit VALUES (?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET window_start=excluded.window_start, count=1',
        ).run(userId, now)
      else
        db.prepare('UPDATE workspace_rate_limit SET count = count + 1 WHERE user_id = ?').run(
          userId,
        )
      return true
    })
    .immediate()
}

export function readWorkspace(db: Database.Database, userId: string): SavedWorkspace {
  const row = db
    .prepare('SELECT state, revision FROM personal_workspace WHERE user_id = ?')
    .get(userId) as { state: string; revision: number } | undefined
  if (!row) return { state: newWorkspace(), revision: 0 }
  // An unreadable vault must never become an empty writable one.
  const state = JSON.parse(unseal(row.state, `workspace:${userId}`)) as PersonalWorkspace
  if (state.version !== 2 || !Array.isArray(state.records) || !Array.isArray(state.questions))
    throw new Error('Unsupported workspace format')
  return { state, revision: row.revision }
}

export function applyWorkspaceCommand(
  db: Database.Database,
  userId: string,
  input: z.infer<typeof commandSchema>,
): SavedWorkspace {
  input = commandSchema.parse(input)
  return db
    .transaction(() => {
      const previous = readWorkspace(db, userId)
      const applied = db
        .prepare('SELECT 1 FROM personal_workspace_event WHERE user_id = ? AND request_id = ?')
        .get(userId, input.requestId)
      if (applied) return previous
      if (input.revision !== previous.revision)
        throw new RevisionConflict('The workspace changed in another tab.')
      const now = new Date().toISOString()
      const today = now.slice(0, 10)
      const command = input.command
      let state = previous.state
      switch (command.type) {
        case 'document-review': {
          const record = state.records.find((r) => r.id === command.id)
          if (!record?.source.document)
            throw new WorkspaceInputError('This document is no longer in your workspace.')
          if (command.readings.some((r) => r.page > record.source.document!.pages))
            throw new WorkspaceInputError('A reading refers to a page outside this document.')
          const observations = command.readings.map((reading, i) => ({
            ...reading,
            label: metricLabels[reading.metric],
            line: i + 1,
            origin: 'user-transcribed' as const,
          }))
          const updated: HealthRecord = {
            ...record,
            observations,
            status: 'unreviewed',
            summary: observations.length
              ? observations
                  .map((r) => `${r.label}: ${r.value} ${r.unit} (page ${r.page})`)
                  .join(' · ')
              : 'Original document · no readings transcribed.',
            source: {
              ...record.source,
              lines: observations.map(
                (r) =>
                  `Page ${r.page} · You entered ${r.label}: ${r.value} ${r.unit} · Method: ${r.method}`,
              ),
              document: { ...record.source.document, reviewedAt: now },
            },
          }
          state = {
            ...state,
            records: state.records.map((r) => (r.id === record.id ? updated : r)),
          }
          break
        }
        case 'import-file': {
          const record = importLabCsv(command.name, command.content, now)
          if (state.records.some((item) => item.id === record.id)) break
          if (state.records.length >= MAX_IMPORTED_RECORDS)
            throw new WorkspaceInputError(
              `Keep up to ${MAX_IMPORTED_RECORDS} records per workspace. Remove a record before adding another.`,
            )
          state = { ...state, records: [...state.records, record] }
          break
        }
        case 'note': {
          if (command.note.date > today)
            throw new WorkspaceInputError('A journal entry cannot be dated in the future.')
          if (state.records.length >= MAX_IMPORTED_RECORDS)
            throw new WorkspaceInputError('The record limit has been reached.')
          const record: HealthRecord = {
            id: randomUUID(),
            title: command.note.title,
            kind: 'visit',
            occurredAt: command.note.date,
            recordedAt: today,
            provider: 'Personal journal',
            author: 'You',
            status: 'unreviewed',
            summary: command.note.text.slice(0, 180),
            observations: [],
            source: {
              label: command.note.title,
              lines: command.note.text.split('\n'),
              personalNote: true,
            },
          }
          state = { ...state, records: [...state.records, record] }
          break
        }
        case 'visit':
          state = { ...state, visit: command.visit }
          break
        case 'question': {
          const known = new Set(state.records.map((record) => record.id))
          if (command.sourceIds.some((id) => !known.has(id)))
            throw new WorkspaceInputError('A linked source is not in this workspace.')
          if (state.questions.some((q) => q.text === command.text)) break
          if (state.questions.length >= 20)
            throw new WorkspaceInputError('Remove a question before adding more than 20.')
          state = {
            ...state,
            questions: [
              ...state.questions,
              { id: randomUUID(), text: command.text, sourceIds: [...new Set(command.sourceIds)] },
            ],
          }
          break
        }
        case 'remove-question':
          state = { ...state, questions: state.questions.filter((q) => q.id !== command.id) }
          break
        case 'remove-record':
          if (!state.records.some((r) => r.id === command.id))
            throw new WorkspaceInputError('This record is no longer in your workspace.')
          state = {
            ...state,
            records: state.records.filter((r) => r.id !== command.id),
            questions: state.questions.map((q) => ({
              ...q,
              sourceIds: q.sourceIds.filter((id) => id !== command.id),
            })),
          }
          db.prepare('DELETE FROM record_document WHERE user_id = ? AND id = ?').run(
            userId,
            command.id,
          )
          break
        case 'erase':
          state = newWorkspace()
          db.prepare('DELETE FROM record_document WHERE user_id = ?').run(userId)
          db.prepare('DELETE FROM personal_workspace_event WHERE user_id = ?').run(userId)
          db.prepare('DELETE FROM workspace_event WHERE user_id = ?').run(userId)
          db.prepare('DELETE FROM workspace WHERE user_id = ?').run(userId)
          break
      }
      return writeWorkspace(
        db,
        userId,
        state,
        previous.revision + 1,
        input.requestId,
        command.type,
        now,
      )
    })
    .immediate()
}

// The caller owns the transaction, including any original-document changes.
export function writeWorkspace(
  db: Database.Database,
  userId: string,
  state: PersonalWorkspace,
  revision: number,
  requestId: string,
  kind: string,
  now: string,
): SavedWorkspace {
  db.prepare(
    `INSERT INTO personal_workspace(user_id, state, revision, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET state=excluded.state, revision=excluded.revision, updated_at=excluded.updated_at`,
  ).run(userId, seal(JSON.stringify(state), `workspace:${userId}`), revision, now)
  db.prepare(
    'INSERT INTO personal_workspace_event(id, user_id, request_id, kind, revision, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(randomUUID(), userId, requestId, kind, revision, now)
  return { state, revision }
}

export function exportWorkspace(db: Database.Database, userId: string) {
  return db.transaction(() => {
    const saved = readWorkspace(db, userId)
    const activity = db
      .prepare(
        'SELECT kind, revision, occurred_at AS occurredAt FROM personal_workspace_event WHERE user_id = ? ORDER BY revision',
      )
      .all(userId)
    const legacy = db.prepare('SELECT state FROM workspace WHERE user_id = ?').get(userId) as
      { state: string } | undefined
    return {
      format: 'aether.workspace-export.v2',
      exportedAt: new Date().toISOString(),
      ...saved,
      records: saved.state.records,
      activity,
      ...(legacy ? { retiredSyntheticPreview: JSON.parse(legacy.state) } : {}),
    }
  })()
}
