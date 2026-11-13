import { validDate } from './import-csv'

export interface CalendarEntry {
  id: string
  date: string
  title: string
  description?: string
  location?: string
}

export interface CalendarOptions {
  generatedAt?: Date
  reminder?: boolean
}

function calendarText(value: string) {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw new Error('Calendar text contains an unsupported control character.')
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function foldLine(value: string) {
  const lines: string[] = []
  const encoder = new TextEncoder()
  let current = ''
  let bytes = 0
  // Count the continuation space and keep every UTF-8 character intact.
  for (const character of value) {
    const length = encoder.encode(character).byteLength
    if (bytes + length > 75) {
      lines.push(current)
      current = ' '
      bytes = 1
    }
    current += character
    bytes += length
  }
  lines.push(current)
  return lines.join('\r\n')
}

function dateRange(date: string) {
  if (!validDate(date) || date === '9999-12-31')
    throw new Error('Choose a calendar date before 31 December 9999.')
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return [date.replaceAll('-', ''), next.toISOString().slice(0, 10).replaceAll('-', '')]
}

export function calendarFile(entries: CalendarEntry[], options: CalendarOptions = {}) {
  if (!entries.length) throw new Error('Select at least one dated item for the calendar.')
  const generatedAt = options.generatedAt ?? new Date()
  if (
    !Number.isFinite(generatedAt.getTime()) ||
    generatedAt.getUTCFullYear() < 0 ||
    generatedAt.getUTCFullYear() > 9999
  )
    throw new Error('The calendar generation time is invalid.')
  const stamp = generatedAt
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
  const identifiers = new Set<string>()
  const events = entries.flatMap((entry) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(entry.id) || identifiers.has(entry.id))
      throw new Error('Each calendar item needs a unique identifier.')
    identifiers.add(entry.id)
    if (!entry.title.trim()) throw new Error('Each calendar item needs a title.')
    const [start, end] = dateRange(entry.date)
    return [
      'BEGIN:VEVENT',
      `UID:${entry.id}@aether.invalid`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${calendarText(entry.title)}`,
      'CLASS:PRIVATE',
      'TRANSP:TRANSPARENT',
      ...(entry.description ? [`DESCRIPTION:${calendarText(entry.description)}`] : []),
      ...(entry.location ? [`LOCATION:${calendarText(entry.location)}`] : []),
      ...(options.reminder
        ? [
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            'TRIGGER:-PT15H',
            'DESCRIPTION:Personal calendar reminder',
            'END:VALARM',
          ]
        : []),
      'END:VEVENT',
    ]
  })
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Aether Health//Personal calendar//EN',
      'CALSCALE:GREGORIAN',
      ...events,
      'END:VCALENDAR',
    ]
      .map(foldLine)
      .join('\r\n') + '\r\n'
  )
}
