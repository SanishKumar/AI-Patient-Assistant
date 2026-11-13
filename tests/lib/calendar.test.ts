import { describe, expect, it } from 'vitest'
import { calendarFile, type CalendarEntry } from '../../lib/records/calendar'

const generatedAt = new Date('2026-11-13T10:45:30.123Z')
const entry: CalendarEntry = { id: 'opaque-calendar-id', date: '2026-11-20', title: 'Health visit' }
const unfold = (text: string) => text.replace(/\r\n[ \t]/g, '')

describe('calendar file exports', () => {
  it('writes one all-day event with stable identity and an exclusive next-day end', () => {
    const text = calendarFile([entry], { generatedAt })
    expect(text).toContain('UID:opaque-calendar-id@aether.invalid\r\n')
    expect(text).toContain('DTSTAMP:20261113T104530Z\r\n')
    expect(text).toContain('DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261121\r\n')
    expect(text).toContain('SUMMARY:Health visit\r\nCLASS:PRIVATE\r\nTRANSP:TRANSPARENT\r\n')
    expect(text).not.toMatch(
      /METHOD:|TZID|ORGANIZER:|ATTENDEE:|BEGIN:VALARM|DESCRIPTION:|LOCATION:/,
    )
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/)
  })

  it.each([
    ['2028-02-28', '20280229'],
    ['2028-02-29', '20280301'],
    ['2026-12-31', '20270101'],
    ['0099-12-31', '01000101'],
  ])('advances %s without using the viewer time zone', (date, end) => {
    expect(calendarFile([{ ...entry, date }], { generatedAt })).toContain(
      `DTEND;VALUE=DATE:${end}\r\n`,
    )
  })

  it('escapes source text so imported content cannot introduce a property or component', () => {
    const text = unfold(
      calendarFile(
        [
          {
            ...entry,
            title: 'Visit, check; later\\again',
            description: 'One\r\nEND:VEVENT\nBEGIN:VALARM\rATTENDEE:evil@example.test',
            location: 'Clinic; west, floor 2',
          },
        ],
        { generatedAt },
      ),
    )
    expect(text).toContain('SUMMARY:Visit\\, check\\; later\\\\again\r\n')
    expect(text).toContain(
      'DESCRIPTION:One\\nEND:VEVENT\\nBEGIN:VALARM\\nATTENDEE:evil@example.test\r\n',
    )
    expect(text).toContain('LOCATION:Clinic\\; west\\, floor 2\r\n')
    expect(text.split('\r\n').filter((line) => line === 'END:VEVENT')).toHaveLength(1)
    expect(text.split('\r\n').some((line) => line.startsWith('ATTENDEE:'))).toBe(false)
  })

  it('folds multilingual text by UTF-8 octets and preserves the unfolded contents', () => {
    const title = 'अस्पताल 🩺 café '.repeat(30)
    const text = calendarFile([{ ...entry, title }], { generatedAt })
    const encoder = new TextEncoder()
    for (const line of text.split('\r\n'))
      expect(encoder.encode(line).byteLength).toBeLessThanOrEqual(75)
    expect(text).toContain('\r\n ')
    expect(unfold(text)).toContain(`SUMMARY:${title}\r\n`)
    expect(text).not.toContain('\ufffd')
  })

  it('adds a display reminder only when requested and keeps its notification generic', () => {
    const text = calendarFile([{ ...entry, title: 'Private appointment detail' }], {
      generatedAt,
      reminder: true,
    })
    expect(text).toContain(
      'BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15H\r\nDESCRIPTION:Personal calendar reminder\r\nEND:VALARM\r\n',
    )
    expect(text).not.toContain('ACTION:EMAIL')
  })

  it('rejects invalid dates, duplicate identifiers, and control characters', () => {
    expect(() => calendarFile([], { generatedAt })).toThrow('Select at least one')
    for (const date of ['2026-02-29', '9999-12-31', '2026-11-20\r\nBEGIN:VEVENT']) {
      expect(() => calendarFile([{ ...entry, date }], { generatedAt })).toThrow('calendar date')
    }
    expect(() => calendarFile([entry, entry], { generatedAt })).toThrow('unique identifier')
    expect(() =>
      calendarFile([{ ...entry, id: 'item\r\nATTENDEE:test' }], { generatedAt }),
    ).toThrow('unique identifier')
    expect(() => calendarFile([{ ...entry, title: 'Health\u0000visit' }], { generatedAt })).toThrow(
      'control character',
    )
    expect(() => calendarFile([entry], { generatedAt: new Date('invalid') })).toThrow(
      'generation time',
    )
  })
})
