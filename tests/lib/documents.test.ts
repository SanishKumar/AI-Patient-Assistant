import { afterEach, beforeEach, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PDFDocument, PDFName } from 'pdf-lib'
import sharp from 'sharp'
import { detectDocumentType, inspectDocument } from '../../lib/server/document-validation'
import { uploadDocument, readDocument } from '../../lib/server/documents'
import { applyWorkspaceCommand, readWorkspace } from '../../lib/server/workspaces'
import { compareMetric } from '../../lib/records/selectors'
import { personalBrief } from '../../lib/records/personal-brief'
import {
  documentReviewSchema,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_STORAGE_BYTES,
} from '../../lib/records/documents'

let db: Database.Database
beforeEach(() => {
  process.env.AETHER_DATA_KEY = randomBytes(32).toString('base64')
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(
    "CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES ('owner-a'), ('owner-b');",
  )
  for (const name of [
    '001-workspaces.sql',
    '002-personal-workspaces.sql',
    '003-record-documents.sql',
  ])
    db.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
})
afterEach(() => db.close())
const metadata = {
  title: 'Test report',
  date: '2026-01-01',
  provider: 'Fictional clinic',
  kind: 'lab' as const,
  belongsToMe: true as const,
}
const input = (revision = 0) => ({ revision, requestId: randomUUID(), metadata })
async function pdf(pages = 2) {
  const document = await PDFDocument.create()
  for (let i = 0; i < pages; i++) document.addPage().drawText(`Fictional report page ${i + 1}`)
  return document.save()
}
const reading = {
  metric: 'hba1c' as const,
  value: 6.7,
  unit: '%' as const,
  method: 'Not stated',
  methodKnown: false,
  page: 2,
}

it('checks actual PDF and image contents and rejects renamed, truncated, and oversized files', async () => {
  expect(await inspectDocument('report.pdf', await pdf())).toEqual({
    mediaType: 'application/pdf',
    pages: 2,
  })
  const image = sharp({ create: { width: 40, height: 30, channels: 3, background: '#fff' } })
  const png = await image.clone().png().toBuffer()
  const jpeg = await image.clone().jpeg().toBuffer()
  expect(await inspectDocument('report.png', png)).toEqual({ mediaType: 'image/png', pages: 1 })
  expect(await inspectDocument('report.jpeg', jpeg)).toEqual({ mediaType: 'image/jpeg', pages: 1 })
  expect(() => detectDocumentType('report.pdf', png)).toThrow('contents must match')
  expect(() => detectDocumentType('../report.png', png)).toThrow('filename')
  expect(() => detectDocumentType('report.png', new Uint8Array(MAX_DOCUMENT_BYTES + 1))).toThrow(
    '5 MB',
  )
  await expect(inspectDocument('report.pdf', Buffer.from('%PDF-broken'))).rejects.toThrow(
    'could not be accepted',
  )
  await expect(inspectDocument('report.png', png.subarray(0, 30))).rejects.toThrow(
    'could not be accepted',
  )
  await expect(inspectDocument('report.pdf', await pdf(21))).rejects.toThrow(
    'could not be accepted',
  )
}, 20000)

it('rejects PDFs with forms, active actions, attachments, or impossible page sizes', async () => {
  for (const feature of ['form', 'action', 'attachment', 'dimensions']) {
    const document = await PDFDocument.create()
    document.addPage(feature === 'dimensions' ? [20000, 20000] : undefined)
    if (feature === 'form')
      document.getForm().createTextField('test').addToPage(document.getPage(0))
    if (feature === 'action')
      document.catalog.set(
        PDFName.of('OpenAction'),
        document.context.obj({ S: PDFName.of('JavaScript'), JS: 'test' }),
      )
    if (feature === 'attachment') await document.attach(new Uint8Array([1, 2]), 'test.txt')
    await expect(inspectDocument('report.pdf', await document.save())).rejects.toThrow(
      'could not be accepted',
    )
  }
}, 20000)

it('encrypts unchanged originals, isolates owners, and deduplicates retries and renamed uploads', async () => {
  const bytes = await pdf()
  const request = input()
  const saved = await uploadDocument(db, 'owner-a', 'report.pdf', bytes, request)
  const record = saved.state.records[0]
  expect(record.status).toBe('unreviewed')
  expect(record.observations).toEqual([])
  expect(record.source.document?.pages).toBe(2)
  expect(readDocument(db, 'owner-a', record.id)?.bytes).toEqual(Buffer.from(bytes))
  expect(readDocument(db, 'owner-b', record.id)).toBeNull()
  expect(await uploadDocument(db, 'owner-a', 'report.pdf', bytes, request)).toEqual(saved)
  await expect(uploadDocument(db, 'owner-a', 'renamed.pdf', bytes, input(1))).rejects.toThrow(
    'already in your workspace',
  )
  const other = await uploadDocument(db, 'owner-b', 'report.pdf', bytes, input())
  expect(other.state.records[0].id).not.toBe(record.id)
  const raw = db.prepare('SELECT content FROM record_document WHERE id = ?').get(record.id) as {
    content: string
  }
  expect(raw.content).toMatch(/^v1\./)
  expect(raw.content).not.toContain('%PDF')
  db.prepare('UPDATE record_document SET content = ? WHERE id = ?').run(
    raw.content,
    other.state.records[0].id,
  )
  expect(() => readDocument(db, 'owner-b', other.state.records[0].id)).toThrow()
  expect(JSON.stringify(db.prepare('SELECT * FROM personal_workspace').all())).not.toContain(
    'Fictional clinic',
  )
}, 15000)

it('rolls back binary storage if the workspace write fails, and enforces revision and quota', async () => {
  const bytes = await pdf()
  db.exec(
    "CREATE TRIGGER fail_event BEFORE INSERT ON personal_workspace_event BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
  )
  await expect(uploadDocument(db, 'owner-a', 'report.pdf', bytes, input())).rejects.toThrow(
    'test failure',
  )
  expect(db.prepare('SELECT * FROM record_document').all()).toEqual([])
  expect(readWorkspace(db, 'owner-a').revision).toBe(0)
  db.exec('DROP TRIGGER fail_event')
  db.prepare('INSERT INTO record_document VALUES (?, ?, ?, ?)').run(
    randomUUID(),
    'owner-a',
    MAX_DOCUMENT_STORAGE_BYTES,
    'quota fixture',
  )
  await expect(uploadDocument(db, 'owner-a', 'report.pdf', bytes, input())).rejects.toThrow('50 MB')
  await expect(uploadDocument(db, 'owner-a', 'report.pdf', bytes, input(3))).rejects.toThrow(
    'another tab',
  )
  expect(readWorkspace(db, 'owner-a').revision).toBe(0)
}, 15000)

it('rechecks the revision after asynchronous inspection instead of overwriting a newer edit', async () => {
  const bytes = await pdf()
  const uploading = uploadDocument(db, 'owner-a', 'report.pdf', bytes, input())
  applyWorkspaceCommand(db, 'owner-a', {
    revision: 0,
    requestId: randomUUID(),
    command: { type: 'question', text: 'Keep this newer change', sourceIds: [] },
  })
  await expect(uploading).rejects.toThrow('another tab')
  expect(readWorkspace(db, 'owner-a').state.questions).toHaveLength(1)
  expect(db.prepare('SELECT * FROM record_document').all()).toEqual([])
})

it('anchors user transcriptions to real pages without modifying original bytes or clinical status', async () => {
  const bytes = await pdf()
  const saved = await uploadDocument(db, 'owner-a', 'report.pdf', bytes, input())
  const id = saved.state.records[0].id
  const command = {
    type: 'document-review' as const,
    id,
    readings: [reading],
    confirmed: true as const,
  }
  expect(
    documentReviewSchema.safeParse({ ...command, readings: [{ ...reading, unit: 'mg/dL' }] })
      .success,
  ).toBe(false)
  expect(documentReviewSchema.safeParse({ ...command, readings: [reading, reading] }).success).toBe(
    false,
  )
  expect(documentReviewSchema.safeParse({ ...command, status: 'verified' }).success).toBe(false)
  expect(() =>
    applyWorkspaceCommand(db, 'owner-a', {
      revision: 1,
      requestId: randomUUID(),
      command: { ...command, readings: [{ ...reading, page: 3 }] },
    }),
  ).toThrow('outside this document')
  expect(() =>
    applyWorkspaceCommand(db, 'owner-b', { revision: 0, requestId: randomUUID(), command }),
  ).toThrow('no longer in your workspace')
  const updated = applyWorkspaceCommand(db, 'owner-a', {
    revision: 1,
    requestId: randomUUID(),
    command,
  }).state.records[0]
  expect(updated.observations[0]).toMatchObject({ ...reading, origin: 'user-transcribed', line: 1 })
  expect(updated.status).toBe('unreviewed')
  expect(updated.source.lines[0]).toContain('Page 2 · You entered HbA1c')
  expect(personalBrief(readWorkspace(db, 'owner-a').state, 'Test Owner', '2025-01-01')).toContain(
    `Source: ${id}, page 2. Entered by you from the original document; not clinically verified.`,
  )
  expect(readDocument(db, 'owner-a', id)?.bytes).toEqual(Buffer.from(bytes))
  const earlier = { ...updated, id: randomUUID(), occurredAt: '2025-01-01' }
  expect(compareMetric([earlier, updated], 'hba1c', '2025-01-01')).toBeNull()
})

it.each(['record', 'workspace', 'account'])(
  'removes original files on %s deletion and preserves the other owner',
  async (scope) => {
    const bytes = await pdf()
    const saved = await uploadDocument(db, 'owner-a', 'report.pdf', bytes, input())
    const other = await uploadDocument(db, 'owner-b', 'report.pdf', bytes, input())
    const id = saved.state.records[0].id
    if (scope === 'account') db.prepare('DELETE FROM user WHERE id = ?').run('owner-a')
    else
      applyWorkspaceCommand(db, 'owner-a', {
        revision: 1,
        requestId: randomUUID(),
        command:
          scope === 'record'
            ? { type: 'remove-record', id, confirmation: 'DELETE' }
            : { type: 'erase', confirmation: 'DELETE' },
      })
    expect(readDocument(db, 'owner-a', id)).toBeNull()
    expect(readDocument(db, 'owner-b', other.state.records[0].id)?.bytes).toEqual(
      Buffer.from(bytes),
    )
  },
  15000,
)
