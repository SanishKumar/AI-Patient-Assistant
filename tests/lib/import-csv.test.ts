import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  importLabCsv,
  ImportValidationError,
  sampleLabCsv,
  csvHeader,
} from '@/lib/records/import-csv'
import { emptySession, restoreSession, sessionReducer } from '@/lib/records/demo-session'
import { recordsAsOf, compareMetric } from '@/lib/records/selectors'
import { initialRecords } from '@/lib/records/fixtures'

const receivedAt = '2026-10-29T09:15:00.000Z'
describe('lab file ingestion', () => {
  it('preserves exact UTF-8 contents and physical source anchors through BOM, CRLF, blank lines, and quoted commas', () => {
    const text = `\ufeff${csvHeader}\r\n\r\n2026-10-27,"Northstar, Fictional Lab",Lab team,hba1c,6.7,%,HPLC\r\n`
    const record = importLabCsv('fictional.csv', text, receivedAt)
    expect(record.observations[0].line).toBe(3)
    expect(record.source.lines[2]).toContain('"Northstar, Fictional Lab"')
    expect(record.provider).toBe('Northstar, Fictional Lab')
    expect(record.source.importedCsv?.text).toBe(text)
    expect(record.source.importedCsv?.sha256).toBe(createHash('sha256').update(text).digest('hex'))
    expect(record.status).toBe('unreviewed')
    expect(recordsAsOf([record], '2026-10-28')).toEqual([])
    expect(recordsAsOf([record], '2026-10-29')).toHaveLength(1)
  })

  it('deduplicates identical content even when the filename changes', () => {
    const first = importLabCsv('first.csv', sampleLabCsv, receivedAt)
    const second = importLabCsv('renamed.csv', sampleLabCsv, receivedAt)
    expect(second.id).toBe(first.id)
    const state = sessionReducer(emptySession, { type: 'import-file', record: first })
    expect(sessionReducer(state, { type: 'import-file', record: second }).records).toHaveLength(1)
  })

  it.each([
    ['wrong header', sampleLabCsv.replace('provider,author', 'patient,author')],
    ['invalid date', sampleLabCsv.replaceAll('2026-10-27', '2026-02-30')],
    ['future date', sampleLabCsv.replaceAll('2026-10-27', '2027-01-01')],
    ['nonfinite value', sampleLabCsv.replace('6.7', 'Infinity')],
    ['missing method', sampleLabCsv.replace('HPLC', '')],
    ['unknown unit', sampleLabCsv.replace(',%,', ',unknown,')],
    ['spreadsheet formula', sampleLabCsv.replace('Northstar Diagnostics', '"=1+1"')],
    ['negative spreadsheet formula', sampleLabCsv.replace('Northstar Diagnostics', '"-1+1"')],
    [
      'multiple reports',
      sampleLabCsv.replace('2026-10-27,Northstar Diagnostics', '2026-10-26,Northstar Diagnostics'),
    ],
    [
      'duplicate measurement',
      sampleLabCsv.replace('ldl,101,mg/dL,Direct assay', 'hba1c,6.9,%,HPLC'),
    ],
    ['multiline field', sampleLabCsv.replace('HPLC', '"HPLC\n"')],
    ['unexpected field', sampleLabCsv.replace(',HPLC', ',HPLC,extra')],
    ['oversized file', sampleLabCsv + 'x'.repeat(17000)],
  ])('rejects %s without a partial import', (_name, text) => {
    expect(() => importLabCsv('fictional.csv', text, receivedAt)).toThrow(ImportValidationError)
  })

  it('keeps incompatible units unchanged and out of comparisons', () => {
    const record = importLabCsv(
      'different-units.csv',
      sampleLabCsv.replace('6.7,%,HPLC', '50,mmol/mol,HPLC'),
      receivedAt,
    )
    expect(record.observations[0]).toMatchObject({ value: 50, unit: 'mmol/mol' })
    expect(compareMetric([...initialRecords, record], 'hba1c', '2026-04-22')).toBeNull()
  })

  it('rebuilds stored imported facts from their source, discarding forged verification or observations', () => {
    const record = importLabCsv('fictional.csv', sampleLabCsv, receivedAt)
    record.status = 'verified'
    record.observations[0].value = 999
    const restored = restoreSession(
      JSON.stringify({
        version: 1,
        ...emptySession,
        records: [record],
        questions: [{ id: 'q1', text: 'What changed?', sourceIds: [record.id] }],
      }),
    )
    expect(restored.records?.[0].status).toBe('unreviewed')
    expect(restored.records?.[0].observations[0].value).toBe(6.7)
    expect(restored.questions[0].sourceIds).toEqual([record.id])
  })
})
