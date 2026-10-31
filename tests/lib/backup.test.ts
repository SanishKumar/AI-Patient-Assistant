import { expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { applyWorkspaceCommand, readWorkspace } from '../../lib/server/workspaces'
import { uploadDocument, readDocument } from '../../lib/server/documents'
import { PDFDocument } from 'pdf-lib'

it('backs up committed WAL contents and restores encrypted records and originals using the same key', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'aether-backup-test-'))
  const filename = join(folder, 'source.sqlite'),
    backup = join(folder, 'snapshot.sqlite')
  const originalKey = process.env.AETHER_DATA_KEY
  process.env.AETHER_DATA_KEY = randomBytes(32).toString('base64')
  const db = new Database(filename)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('wal_autocheckpoint = 0')
    db.exec("CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES ('test-owner');")
    for (const file of [
      '001-workspaces.sql',
      '002-personal-workspaces.sql',
      '003-record-documents.sql',
    ])
      db.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'))
    applyWorkspaceCommand(db, 'test-owner', {
      revision: 0,
      requestId: randomUUID(),
      command: { type: 'question', text: 'A committed question in the WAL', sourceIds: [] },
    })
    const pdf = await PDFDocument.create()
    pdf.addPage().drawText('Fictional backup test report')
    const original = await pdf.save()
    const saved = await uploadDocument(db, 'test-owner', 'backup-test.pdf', original, {
      revision: 1,
      requestId: randomUUID(),
      metadata: {
        title: 'Backup report',
        provider: 'Test laboratory',
        date: '2026-01-01',
        kind: 'lab',
        belongsToMe: true,
      },
    })
    execFileSync(process.execPath, ['scripts/backup.mjs', backup], {
      env: { ...process.env, AETHER_DATABASE_PATH: filename },
    })
    const restored = new Database(backup, { readonly: true })
    try {
      expect(restored.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(readWorkspace(restored, 'test-owner').state.questions[0].text).toBe(
        'A committed question in the WAL',
      )
      const raw = restored.prepare('SELECT state FROM personal_workspace').get() as {
        state: string
      }
      expect(raw.state).not.toContain('committed question')
      expect(readDocument(restored, 'test-owner', saved.state.records[0].id)?.bytes).toEqual(
        Buffer.from(original),
      )
    } finally {
      restored.close()
    }
    expect(() =>
      execFileSync(process.execPath, ['scripts/backup.mjs', backup], {
        env: { ...process.env, AETHER_DATABASE_PATH: filename },
        stdio: 'pipe',
      }),
    ).toThrow()
  } finally {
    db.close()
    if (originalKey === undefined) delete process.env.AETHER_DATA_KEY
    else process.env.AETHER_DATA_KEY = originalKey
    if (!resolve(folder).startsWith(`${resolve(tmpdir())}${sep}aether-backup-test-`))
      throw new Error('Unexpected test directory')
    rmSync(folder, { recursive: true, force: true })
  }
})
