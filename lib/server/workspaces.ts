import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { emptySession, sessionReducer, type DemoSession } from '../records/demo-session'

const sourceId = z.enum([
  'lab-jan',
  'visit-jan',
  'lab-apr',
  'rx-apr',
  'visit-aug',
  'lab-oct',
  'visit-oct',
])
export const commandSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
    command: z.discriminatedUnion('type', [
      z.object({ type: z.literal('import') }).strict(),
      z.object({ type: z.literal('reset') }).strict(),
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

export function readWorkspace(db: Database.Database, userId: string): SavedWorkspace {
  const row = db.prepare('SELECT state, revision FROM workspace WHERE user_id = ?').get(userId) as
    WorkspaceRow | undefined
  return row
    ? { state: JSON.parse(row.state) as DemoSession, revision: row.revision }
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
      const action =
        command.type === 'question'
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
            : command
      const state = sessionReducer(previous.state, action)
      const revision = previous.revision + 1
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
