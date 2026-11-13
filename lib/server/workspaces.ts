import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { importLabCsv, MAX_IMPORTED_RECORDS } from '../records/import-csv'
import {
  commandSchema,
  emptyVisit,
  MAX_VISIT_HISTORY,
  newWorkspace,
  type CompletedVisit,
  type PersonalWorkspace,
  type VisitOutcome,
} from '../records/workspace'
import { displayedMethod, metricLabels, type HealthRecord } from '../records/types'
import { seal, unseal } from './vault.mjs'
import type { z } from 'zod'
import { briefShareMetadata, revokeAllBriefShares, revokeBriefSharesForItem } from './brief-shares'
import { MAX_MEDICATIONS, MAX_ALLERGIES } from '../records/health-list'

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
  if (state.visitHistory === undefined) state.visitHistory = []
  if (state.medications === undefined) state.medications = []
  if (state.allergies === undefined) state.allergies = []
  if (!Array.isArray(state.medications) || !Array.isArray(state.allergies))
    throw new Error('Unsupported health list format')
  if (state.visitCalendarId === undefined)
    state.visitCalendarId = createHash('sha256')
      .update(`legacy-visit-calendar:${userId}`)
      .digest('hex')
  if (
    typeof state.visitCalendarId !== 'string' ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(state.visitCalendarId)
  )
    throw new Error('Unsupported visit calendar identifier')
  if (!Array.isArray(state.visitHistory)) throw new Error('Unsupported visit history format')
  return { state, revision: row.revision }
}

function visitOutcome(outcome: VisitOutcome, now: string, previous?: CompletedVisit) {
  // The same instant can fall on the next calendar day at the visit location.
  const latestLocalDate = new Date(Date.parse(now) + 14 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (outcome.date > latestLocalDate)
    throw new WorkspaceInputError('Enter the date the visit took place.')
  const supplied = new Set<string>()
  const steps = outcome.steps.map((step) => {
    if (!step.id) return { ...step, id: randomUUID(), completedAt: null }
    const existing = previous?.steps.find((s) => s.id === step.id)
    if (!existing || supplied.has(step.id))
      throw new WorkspaceInputError('A follow-up step no longer matches this visit.')
    supplied.add(step.id)
    return { ...step, id: step.id, completedAt: existing.completedAt }
  })
  return { ...outcome, steps }
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
        case 'save-medication': {
          const existing = command.id
            ? state.medications.find((entry) => entry.id === command.id)
            : undefined
          if (command.id && !existing)
            throw new WorkspaceInputError('This medication is no longer in your workspace.')
          if (
            command.medication.sourceId &&
            !state.records.some((record) => record.id === command.medication.sourceId)
          )
            throw new WorkspaceInputError('The linked source is not in this workspace.')
          if (!existing && state.medications.length >= MAX_MEDICATIONS)
            throw new WorkspaceInputError(
              'Keep up to 50 medication entries. Remove an entry before adding another.',
            )
          const entry = {
            ...command.medication,
            id: existing?.id ?? randomUUID(),
            recordedAt: existing?.recordedAt ?? now,
            updatedAt: now,
          }
          state = {
            ...state,
            medications: existing
              ? state.medications.map((item) => (item.id === entry.id ? entry : item))
              : [...state.medications, entry],
          }
          break
        }
        case 'save-allergy': {
          const existing = command.id
            ? state.allergies.find((entry) => entry.id === command.id)
            : undefined
          if (command.id && !existing)
            throw new WorkspaceInputError('This allergy concern is no longer in your workspace.')
          if (
            command.allergy.sourceId &&
            !state.records.some((record) => record.id === command.allergy.sourceId)
          )
            throw new WorkspaceInputError('The linked source is not in this workspace.')
          if (!existing && state.allergies.length >= MAX_ALLERGIES)
            throw new WorkspaceInputError(
              'Keep up to 50 allergy concerns. Remove an entry before adding another.',
            )
          const entry = {
            ...command.allergy,
            id: existing?.id ?? randomUUID(),
            recordedAt: existing?.recordedAt ?? now,
            updatedAt: now,
          }
          state = {
            ...state,
            allergies: existing
              ? state.allergies.map((item) => (item.id === entry.id ? entry : item))
              : [...state.allergies, entry],
          }
          break
        }
        case 'remove-medication':
          if (!state.medications.some((entry) => entry.id === command.id))
            throw new WorkspaceInputError('This medication is no longer in your workspace.')
          revokeBriefSharesForItem(db, userId, 'medication', command.id)
          state = {
            ...state,
            medications: state.medications.filter((entry) => entry.id !== command.id),
          }
          break
        case 'remove-allergy':
          if (!state.allergies.some((entry) => entry.id === command.id))
            throw new WorkspaceInputError('This allergy concern is no longer in your workspace.')
          revokeBriefSharesForItem(db, userId, 'allergy', command.id)
          state = {
            ...state,
            allergies: state.allergies.filter((entry) => entry.id !== command.id),
          }
          break
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
            origin: reading.recognizedLine
              ? ('ocr-assisted' as const)
              : ('user-transcribed' as const),
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
                  `Page ${r.page} · ${r.recognizedLine ? 'You checked' : 'You entered'} ${r.label}: ${r.value} ${r.unit} · Method: ${displayedMethod(r)}`,
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
        case 'record-visit': {
          if (state.visitHistory.length >= MAX_VISIT_HISTORY)
            throw new WorkspaceInputError(
              `Visit history holds up to ${MAX_VISIT_HISTORY} visits. Remove a past visit to add another.`,
            )
          const questions = command.usePlan ? state.questions : []
          if (command.carryQuestionIds.some((id) => !questions.some((q) => q.id === id)))
            throw new WorkspaceInputError('A question is no longer in the selected plan.')
          const visit: CompletedVisit = {
            ...visitOutcome(command.outcome, now),
            id: randomUUID(),
            recordedAt: now,
            plan: command.usePlan ? state.visit : null,
            questions,
          }
          state = {
            ...state,
            visitHistory: [...state.visitHistory, visit],
            ...(command.usePlan
              ? {
                  visit: { ...emptyVisit },
                  visitCalendarId: randomUUID(),
                  questions: questions.filter((q) => command.carryQuestionIds.includes(q.id)),
                }
              : {}),
          }
          break
        }
        case 'edit-visit-outcome':
        case 'set-visit-step':
        case 'remove-visit': {
          const visit = state.visitHistory.find((v) => v.id === command.id)
          if (!visit) throw new WorkspaceInputError('This visit is no longer in your workspace.')
          if (command.type === 'remove-visit') {
            revokeBriefSharesForItem(db, userId, 'pastVisit', visit.id)
            state = { ...state, visitHistory: state.visitHistory.filter((v) => v.id !== visit.id) }
            break
          }
          let updated: CompletedVisit
          if (command.type === 'edit-visit-outcome') {
            updated = { ...visit, ...visitOutcome(command.outcome, now, visit) }
          } else {
            if (!visit.steps.some((s) => s.id === command.stepId))
              throw new WorkspaceInputError('This follow-up step is no longer in this visit.')
            updated = {
              ...visit,
              steps: visit.steps.map((s) =>
                s.id === command.stepId
                  ? { ...s, completedAt: command.done ? (s.completedAt ?? now) : null }
                  : s,
              ),
            }
          }
          state = {
            ...state,
            visitHistory: state.visitHistory.map((v) => (v.id === visit.id ? updated : v)),
          }
          break
        }
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
          revokeBriefSharesForItem(db, userId, 'question', command.id)
          state = { ...state, questions: state.questions.filter((q) => q.id !== command.id) }
          break
        case 'remove-record': {
          if (!state.records.some((r) => r.id === command.id))
            throw new WorkspaceInputError('This record is no longer in your workspace.')
          revokeBriefSharesForItem(db, userId, 'record', command.id)
          const detachSource = (questions: PersonalWorkspace['questions']) =>
            questions.map((q) => ({
              ...q,
              sourceIds: q.sourceIds.filter((id) => id !== command.id),
            }))
          state = {
            ...state,
            records: state.records.filter((r) => r.id !== command.id),
            questions: detachSource(state.questions),
            medications: state.medications.map((entry) =>
              entry.sourceId === command.id ? { ...entry, sourceId: null, updatedAt: now } : entry,
            ),
            allergies: state.allergies.map((entry) =>
              entry.sourceId === command.id ? { ...entry, sourceId: null, updatedAt: now } : entry,
            ),
            visitHistory: state.visitHistory.map((v) => ({
              ...v,
              questions: detachSource(v.questions),
            })),
          }
          db.prepare('DELETE FROM record_document WHERE user_id = ? AND id = ?').run(
            userId,
            command.id,
          )
          break
        }
        case 'erase':
          revokeAllBriefShares(db, userId)
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
      sharedBriefs: briefShareMetadata(db, userId),
      ...(legacy ? { retiredSyntheticPreview: JSON.parse(legacy.state) } : {}),
    }
  })()
}
