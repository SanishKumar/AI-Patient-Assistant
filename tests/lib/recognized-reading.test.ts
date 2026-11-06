import { expect, it } from 'vitest'
import { recognizedReading } from '../../lib/records/recognized-reading'
import { documentReviewSchema } from '../../lib/records/documents'

const line = { text: 'HbA1c 6.7 %', left: 0.1, top: 0.2, right: 0.65, bottom: 0.25 }
it('suggests a value only when a whole source line contains one supported measurement and unit', () => {
  for (const [text, metric, value, unit] of [
    ['HbA1c 6.7 %', 'hba1c', 6.7, '%'],
    ['LDL-C:101 mg/dl', 'ldl', 101, 'mg/dL'],
    ['Systolic blood pressure 120 mmHg', 'systolic', 120, 'mmHg'],
  ] as const) {
    expect(recognizedReading({ ...line, text }, 2)).toMatchObject({
      metric,
      value,
      unit,
      page: 2,
      methodKnown: false,
      recognizedLine: { ...line, text },
    })
  }
  for (const text of [
    'HbA1c < 6.7 %',
    'HbA1c 6,7 %',
    'HbA1c 6.7',
    'LDL 70–100 mg/dL',
    'HbA1c 6.7 % 4–6 %',
    'Goal HbA1c 6.7 %',
    'HbA1c 6.7 mg/dL',
    'BP 120/80 mmHg',
    'HbA1c\n6.7 %',
  ]) {
    expect(recognizedReading({ ...line, text }, 1)).toBeUndefined()
  }
})

it('rejects out-of-bounds evidence before it can enter a saved reading', () => {
  const reading = recognizedReading(line, 1)!
  for (const invalid of [{ right: 1.1 }, { top: -1 }, { left: 0.65 }, { text: '' }]) {
    expect(
      documentReviewSchema.safeParse({
        type: 'document-review',
        id: '11111111-1111-4111-8111-111111111111',
        confirmed: true,
        readings: [{ ...reading, recognizedLine: { ...line, ...invalid } }],
      }).success,
    ).toBe(false)
  }
})
