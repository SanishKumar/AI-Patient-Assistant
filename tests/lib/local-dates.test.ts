import { expect, it, vi } from 'vitest'
import { formatLocalTimestampDate } from '../../lib/records/selectors'

it('shows the local calendar day for a saved timestamp across midnight', () => {
  const timestamp = '2026-11-13T23:50:00Z'
  try {
    vi.stubEnv('TZ', 'UTC')
    expect(formatLocalTimestampDate(timestamp)).toBe('13 November 2026')
    vi.stubEnv('TZ', 'Asia/Kolkata')
    expect(formatLocalTimestampDate(timestamp)).toBe('14 November 2026')
  } finally {
    vi.unstubAllEnvs()
  }
})
