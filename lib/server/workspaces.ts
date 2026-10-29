import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import {
  emptySession,
  restoreSession,
  sessionReducer,
  workspaceRecords,
  type DemoSession,
} from '../records/demo-session'
import { importLabCsv, MAX_IMPORTED_RECORDS } from '../records/import-csv'

const sourceId = z.string().min(1).max(100)
export const commandSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
    command: z.discriminatedUnion('type', [
      z.object({ type: z.literal('import') }).strict(),
      z.object({ type: z.literal('reset') }).strict(),
      z.object({ type: z.literal('erase'), confirmation: z.literal('DELETE') }).strict(),
      z
        .object({
          type: z.literal('import-file'),
          name: z.string().min(1).max(120),
          content: z
            .string()
            .min(1)
            .max(16 * 1024),
          fictional: z.literal(true),
        })
        .strict(),
      z
        .object({
          type: z.literal('question'),
          text: z.string().trim().min(1).max(240),
          sourceIds: z.array(sourceId).max(7),
        })
        .strict(),
      z.object({ type: z.literal('remove-question'), id: z.string().uuid() }).strict(),
      z
        .object({
          type: z.literal('review'),
          action: z.enum(['flagged-for-visit', 'evidence-reviewed']),
        })
        .strict(),
    ]),
  })
  .strict()

type WorkspaceRow = { state: string; revision: number }
export type SavedWorkspace = { state: DemoSession; revision: number }
export class RevisionConflict extends Error {}
export class WorkspaceInputError extends Error {}

export function readWorkspace(db: Database.Database, userId: string): SavedWorkspace {
  const row = db.prepare('SELECT state, revision FROM workspace WHERE user_id = ?').get(userId) as
    WorkspaceRow | undefined
  return row
    ? {
        state: restoreSession(JSON.stringify({ ...JSON.parse(row.state), version: 1 })),
        revision: row.revision,
      }
    : { state: emptySession, revision: 0 }
}

export function applyWorkspaceCommand(
  db: Database.Database,
  userId: string,
  input: z.infer<typeof commandSchema>,
): SavedWorkspace {
  return db
    .transaction(() => {
      const previous = readWorkspace(db, userId)
      // A response lost in transit can be retried without duplicating the committed mutation.
      const applied = db
        .prepare('SELECT 1 FROM workspace_event WHERE user_id = ? AND request_id = ?')
        .get(userId, input.requestId)
      if (applied) return previous
      if (input.revision !== previous.revision)
        throw new RevisionConflict('The workspace changed in another tab.')
      const now = new Date().toISOString()
      const command = input.command
      if (command.type === 'question') {
        const known = new Set(workspaceRecords(previous.state).map((record) => record.id))
        if (command.sourceIds.some((id) => !known.has(id)))
          throw new WorkspaceInputError('A linked source is not in this workspace.')
      }
      const record =
        command.type === 'import-file'
          ? importLabCsv(command.name, command.content, now)
          : undefined
      if (
        record &&
        (previous.state.records?.length ?? 0) >= MAX_IMPORTED_RECORDS &&
        !previous.state.records?.some((item) => item.id === record.id)
      )
        throw new WorkspaceInputError(
          'This preview supports up to 12 imported reports. Export or clear the workspace before adding more.',
        )
      const action = record
        ? { type: 'import-file' as const, record }
        : command.type === 'question'
          ? {
              type: 'question' as const,
              question: { id: randomUUID(), text: command.text, sourceIds: command.sourceIds },
            }
          : command.type === 'review'
            ? {
                type: 'review' as const,
                event: {
                  id: randomUUID(),
                  conflictId: 'allergy-history',
                  action: command.action,
                  at: now,
                },
              }
            : (command as Exclude<typeof command, { type: 'import-file' }>)
      const state = sessionReducer(previous.state, action)
      const revision = previous.revision + 1
      // Keep the revision moving after erasure so an old tab cannot resurrect a stale save.
      if (command.type === 'erase')
        db.prepare('DELETE FROM workspace_event WHERE user_id = ?').run(userId)
      db.prepare(
        `INSERT INTO workspace(user_id, state, revision, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET state=excluded.state, revision=excluded.revision, updated_at=excluded.updated_at`,
      ).run(userId, JSON.stringify(state), revision, now)
      // Store action metadata, never question text, in the activity ledger.
      db.prepare(
        'INSERT INTO workspace_event(id, user_id, request_id, kind, revision, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(randomUUID(), userId, input.requestId, command.type, revision, now)
      return { state, revision }
    })
    .immediate()
}

export function exportWorkspace(db: Database.Database, userId: string) {
  return db.transaction(() => {
    const saved = readWorkspace(db, userId)
    const activity = db
      .prepare(
        'SELECT kind, revision, occurred_at AS occurredAt FROM workspace_event WHERE user_id = ? ORDER BY revision',
      )
      .all(userId)
    return {
      format: 'aether.workspace-export.v1',
      exportedAt: new Date().toISOString(),
      synthetic: true,
      ...saved,
      records: workspaceRecords(saved.state),
      activity,
    }
  })()
}
