import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { z } from 'zod'
import { documentUploadSchema, MAX_DOCUMENT_STORAGE_BYTES } from '../records/documents'
import { MAX_IMPORTED_RECORDS } from '../records/import-csv'
import type { HealthRecord } from '../records/types'
import { readWorkspace, RevisionConflict, WorkspaceInputError, writeWorkspace } from './workspaces'
import { inspectDocument } from './document-validation'
import { sealBytes, unsealBytes } from './vault.mjs'

export async function uploadDocument(
  db: Database.Database,
  userId: string,
  name: string,
  bytes: Uint8Array,
  input: z.infer<typeof documentUploadSchema>,
) {
  input = documentUploadSchema.parse(input)
  const replay = db
    .prepare('SELECT 1 FROM personal_workspace_event WHERE user_id = ? AND request_id = ?')
    .get(userId, input.requestId)
  if (replay) return readWorkspace(db, userId)
  if (readWorkspace(db, userId).revision !== input.revision)
    throw new RevisionConflict('The workspace changed in another tab.')
  const info = await inspectDocument(name, bytes)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return db
    .transaction(() => {
      const previous = readWorkspace(db, userId)
      if (
        db
          .prepare('SELECT 1 FROM personal_workspace_event WHERE user_id = ? AND request_id = ?')
          .get(userId, input.requestId)
      )
        return previous
      if (input.revision !== previous.revision)
        throw new RevisionConflict('The workspace changed in another tab.')
      const now = new Date().toISOString()
      if (input.metadata.date > now.slice(0, 10))
        throw new WorkspaceInputError('The document date cannot be in the future.')
      if (previous.state.records.some((r) => r.source.document?.sha256 === sha256))
        throw new WorkspaceInputError(
          'This exact document is already in your workspace, even if its filename changed.',
        )
      if (previous.state.records.length >= MAX_IMPORTED_RECORDS)
        throw new WorkspaceInputError('Remove a record before adding more than 100 records.')
      const usage = db
        .prepare(
          'SELECT COALESCE(SUM(byte_count), 0) AS bytes FROM record_document WHERE user_id = ?',
        )
        .get(userId) as { bytes: number }
      if (usage.bytes + bytes.length > MAX_DOCUMENT_STORAGE_BYTES)
        throw new WorkspaceInputError(
          'This workspace has reached its 50 MB document allowance. Download and remove a document before adding another.',
        )
      const id = randomUUID()
      const record: HealthRecord = {
        id,
        title: input.metadata.title,
        kind: input.metadata.kind,
        occurredAt: input.metadata.date,
        recordedAt: now.slice(0, 10),
        provider: input.metadata.provider,
        author: 'Uploaded by you',
        status: 'unreviewed',
        summary: `${info.pages} ${info.pages === 1 ? 'page' : 'pages'} · original document. No readings transcribed yet.`,
        source: { label: name, lines: [], document: { ...info, byteLength: bytes.length, sha256 } },
        observations: [],
      }
      db.prepare(
        'INSERT INTO record_document(id, user_id, byte_count, content) VALUES (?, ?, ?, ?)',
      ).run(id, userId, bytes.length, sealBytes(bytes, `document:${userId}:${id}`))
      return writeWorkspace(
        db,
        userId,
        { ...previous.state, records: [...previous.state.records, record] },
        previous.revision + 1,
        input.requestId,
        'document-upload',
        now,
      )
    })
    .immediate()
}

export function readDocument(db: Database.Database, userId: string, id: string) {
  const row = db
    .prepare('SELECT content FROM record_document WHERE user_id = ? AND id = ?')
    .get(userId, id) as { content: string } | undefined
  if (!row) return null
  const record = readWorkspace(db, userId).state.records.find(
    (r) => r.id === id && r.source.document,
  )
  if (!record) return null
  const bytes = unsealBytes(row.content, `document:${userId}:${id}`)
  if (createHash('sha256').update(bytes).digest('hex') !== record.source.document!.sha256)
    throw new Error('Document integrity check failed')
  return { record, bytes }
}
