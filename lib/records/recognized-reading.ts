import { transcriptionSchema, type RecognizedLine } from './documents'

// Match an entire printed line. A reference range, inequality, missing unit or extra
// table column needs manual transcription because its number may mean something else.
const resultLine =
  /^(HbA1c|LDL(?:[ -](?:cholesterol|C))?|Systolic(?: blood pressure| BP)?)(?:\s*[:=]\s*|\s+)(\d+(?:\.\d+)?)\s*(%|mmol\/mol|mg\/dL|mmol\/L|mmHg)$/i
const units = ['%', 'mmol/mol', 'mg/dL', 'mmol/L', 'mmHg'] as const

export function recognizedReading(line: RecognizedLine, page: number) {
  const match = resultLine.exec(line.text)
  if (!match) return
  const [, label, value, printedUnit] = match
  const metric = /^ldl/i.test(label) ? 'ldl' : /^systolic/i.test(label) ? 'systolic' : 'hba1c'
  const unit = units.find((candidate) => candidate.toLowerCase() === printedUnit.toLowerCase())
  const reading = transcriptionSchema.safeParse({
    metric,
    value: Number(value),
    unit,
    page,
    method: 'Not stated',
    methodKnown: false,
    recognizedLine: line,
  })
  if (reading.success) return reading.data
}
