import { describe, expect, it } from 'vitest'
import { initialRecords, sampleImport } from '@/lib/records/fixtures'
import { buildVisitBrief, compareMetric, findConflicts, recordsAsOf, searchRecords } from '@/lib/records/selectors'

describe('record history and provenance', () => {
  it('does not leak a late-arriving record into an earlier snapshot', () => {
    expect(recordsAsOf(initialRecords, '2026-08-31').map(r => r.id)).not.toContain('visit-aug')
    expect(recordsAsOf(initialRecords, '2026-09-03').map(r => r.id)).toContain('visit-aug')
  })
  it('keeps contradictory assertions unresolved without changing source records', () => {
    const before = structuredClone(initialRecords)
    expect(findConflicts(initialRecords)[0].recordIds).toEqual(['visit-jan', 'visit-aug'])
    expect(initialRecords).toEqual(before)
    expect(findConflicts(recordsAsOf(initialRecords, '2026-08-31'))).toEqual([])
  })
  it('compares actual measurements with exact source references', () => {
    expect(compareMetric(initialRecords, 'hba1c', '2026-04-22')).toMatchObject({
      delta: -0.6, baseline: { recordId: 'lab-apr', line: 3 }, latest: { recordId: 'lab-oct', line: 3 },
    })
  })
  it('does not compare incompatible units or test methods', () => {
    for (const override of [{ unit: 'mmol/mol' }, { method: 'Different assay' }]) {
      const records = structuredClone(initialRecords)
      Object.assign(records[records.length - 1].observations[0], override)
      expect(compareMetric(records, 'hba1c', '2026-04-22')).toBeNull()
    }
  })
  it('shows missing baseline rather than inventing one', () => {
    expect(compareMetric(initialRecords, 'hba1c', '2025-12-31')).toBeNull()
    expect(compareMetric([], 'hba1c', '2026-04-22')).toBeNull()
  })
  it('searches the actual source text and requires every query term', () => {
    expect(searchRecords(initialRecords, 'penicillin childhood').map(r => r.id)).toEqual(['visit-jan'])
    expect(searchRecords(initialRecords, 'unlisted medicine')).toEqual([])
  })
  it('every evidence anchor refers to an existing line in its own source', () => {
    for (const record of [...initialRecords, sampleImport]) {
      const anchors = [...record.observations, ...(record.allergy ? [record.allergy] : []), ...(record.medication ? [record.medication] : [])]
      for (const anchor of anchors) expect(record.source.lines[anchor.line - 1]).toBeTruthy()
    }
  })
  it('exports uncertainty, pending review, and source IDs with the visit brief', () => {
    const brief = buildVisitBrief([...initialRecords, sampleImport], [{ id: 'q1', text: 'Which allergy history is correct?', sourceIds: ['visit-jan', 'visit-aug'] }], '2026-04-22')
    expect(brief).toContain('134 → 122 mmHg')
    expect(brief).toContain('Latest source: unreviewed')
    expect(brief).toContain('Neither entry has been reconciled')
    expect(brief).toContain('Sources: lab-apr, lab-oct')
    expect(brief).toContain('Not a signed clinical note')
  })
})
