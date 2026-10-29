import { parse } from 'csv-parse/browser/esm/sync'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { metricLabels, type HealthRecord, type Metric } from './types'

export const MAX_IMPORT_BYTES = 16 * 1024
export const MAX_IMPORTED_RECORDS = 12
export const csvHeader = 'date,provider,author,metric,value,unit,method'
export const sampleLabCsv = `${csvHeader}\n2026-10-27,Northstar Diagnostics,Laboratory team,hba1c,6.7,%,HPLC\n2026-10-27,Northstar Diagnostics,Laboratory team,ldl,101,mg/dL,Direct assay\n`

export type ImportIssue = { line?: number; field?: string; message: string }
export class ImportValidationError extends Error {
  constructor(public issues: ImportIssue[]) {
    super('The file needs a few corrections before import.')
  }
}
const fail = (message: string, line?: number, field?: string): never => {
  throw new ImportValidationError([{ line, field, message }])
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}

/** Parse a single report. Both the browser preview and server use this validation. */
export function importLabCsv(
  name: string,
  text: string,
  receivedAt = new Date().toISOString(),
): HealthRecord {
  const bytes = new TextEncoder().encode(text)
  if (!name.toLowerCase().endsWith('.csv') || name.length > 120 || /[/\\\u0000-\u001f]/.test(name))
    fail('Choose a CSV filename of at most 120 characters, without path separators.')
  if (!bytes.length || bytes.length > MAX_IMPORT_BYTES)
    fail('Choose a non-empty CSV file no larger than 16 KB.')
  if (
    new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes) !== text ||
    text.includes('\u0000')
  )
    fail('Use a UTF-8 text file without null characters.')
  if (text.split(/\r\n|\n|\r/).length > 50)
    fail('A report can contain at most 50 source lines, including blank lines.')
  const receivedDate = receivedAt.slice(0, 10)
  if (!validDate(receivedDate) || !Number.isFinite(Date.parse(receivedAt)))
    fail('The import date is invalid.')
  let rows: { record: string[]; info: { lines: number } }[] = []
  try {
    // The library's overload omits the info wrapper from its return type.
    rows = parse(text, {
      bom: true,
      info: true,
      skip_empty_lines: true,
      max_record_size: 2048,
      relax_column_count: true,
    }) as unknown as typeof rows
  } catch {
    fail('Invalid CSV syntax. Check the quotation marks and commas.')
  }
  if (!rows.length || rows[0].record.length !== 7 || rows[0].record.join(',') !== csvHeader)
    fail(`The first row must be: ${csvHeader}`, rows[0]?.info.lines ?? 1)
  if (rows.length < 2 || rows.length > 3)
    fail('Include one or two measurements: one HbA1c and/or one LDL result per report.')
  const observations: HealthRecord['observations'] = []
  let date = '',
    provider = '',
    author = ''
  const seen = new Set<string>()
  for (const row of rows.slice(1)) {
    const line = row.info.lines
    if (row.record.length !== 7) fail('Expected exactly seven columns.', line)
    const [day, lab, recorder, metric, numeric, unit, method] = row.record.map((value) =>
      value.trim(),
    )
    for (let i = 0; i < row.record.length; i++) {
      const cell = row.record[i].trim()
      if (!cell || cell.length > 160 || /[\r\n\u0000-\u001f]/.test(row.record[i]))
        fail(
          'Use a non-empty, single-line value of at most 160 characters.',
          line,
          csvHeader.split(',')[i],
        )
      if (/^[=+@-]/.test(cell))
        fail('Spreadsheet formulas are not accepted.', line, csvHeader.split(',')[i])
    }
    if (!validDate(day) || day < '1900-01-01' || day > receivedDate)
      fail('Use a real date from 1900 through the import date, formatted YYYY-MM-DD.', line, 'date')
    if (date && (date !== day || provider !== lab || author !== recorder))
      fail(
        'All rows must belong to the same date, provider, and author. Split separate reports into separate files.',
        line,
      )
    if (!['hba1c', 'ldl'].includes(metric))
      fail('Supported measurements are hba1c and ldl.', line, 'metric')
    if (seen.has(metric)) fail('Each measurement can appear only once in a report.', line, 'metric')
    if (
      !/^\d+(?:\.\d+)?$/.test(numeric) ||
      !Number.isFinite(Number(numeric)) ||
      Number(numeric) > 1_000_000
    )
      fail('Use a finite, non-negative decimal number without separators.', line, 'value')
    const units = metric === 'hba1c' ? ['%', 'mmol/mol'] : ['mg/dL', 'mmol/L']
    if (!units.includes(unit))
      fail(`Use one of these explicit units: ${units.join(', ')}.`, line, 'unit')
    seen.add(metric)
    date = day
    provider = lab
    author = recorder
    observations.push({
      metric: metric as Metric,
      label: metricLabels[metric as Metric],
      value: Number(numeric),
      unit,
      method,
      line,
    })
  }
  const digest = bytesToHex(sha256(bytes))
  return {
    id: `csv-${digest}`,
    title: `Imported lab report · ${date}`,
    kind: 'lab',
    occurredAt: date,
    recordedAt: receivedDate,
    provider,
    author,
    status: 'unreviewed',
    summary: `${observations.length} measurement${observations.length === 1 ? '' : 's'} imported from ${name}. Source review is pending.`,
    source: {
      label: name,
      lines: text.split(/\r\n|\n|\r/),
      importedCsv: { text, sha256: digest, receivedAt },
    },
    observations,
  }
}
