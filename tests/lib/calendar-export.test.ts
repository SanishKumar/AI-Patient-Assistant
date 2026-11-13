import { describe, expect, it } from 'vitest'
import { newWorkspace } from '../../lib/records/workspace'
import { calendarChoices, selectedCalendarEntries } from '../../lib/records/calendar-export'

describe('calendar content selection', () => {
  it('keeps private details out until selected and scopes identifiers to the owner', () => {
    const state = newWorkspace()
    state.visit = {
      date: '2026-12-03',
      time: '10:30',
      clinician: 'Private clinic',
      location: 'Private location',
      reason: 'Private reason',
    }
    const choices = calendarChoices(state)
    const id = choices[0].id
    const plain = selectedCalendarEntries(choices, [id], 'owner-a', false)
    expect(plain).toEqual([
      {
        id: expect.stringMatching(/^[a-f0-9]{64}$/),
        date: '2026-12-03',
        title: 'Health visit',
        description: undefined,
        location: undefined,
      },
    ])
    const detailed = selectedCalendarEntries(choices, [id], 'owner-a', true)
    expect(detailed[0].id).toBe(plain[0].id)
    expect(detailed[0].description).toContain('Saved local visit time 10:30')
    expect(detailed[0].location).toBe('Private location')
    expect(selectedCalendarEntries(choices, [id], 'owner-b', true)[0].id).not.toBe(plain[0].id)
    state.visit.date = '2026-12-05'
    expect(selectedCalendarEntries(calendarChoices(state), [id], 'owner-a', false)[0].id).toBe(
      plain[0].id,
    )
  })
  it('offers only dated open steps and exports exactly the selected content', () => {
    const state = newWorkspace()
    state.visitHistory = [
      {
        id: 'visit',
        date: '2026-01-01',
        recordedAt: '2026-01-01',
        clinic: 'My clinic',
        recap: 'Private recap',
        plan: null,
        questions: [{ id: 'q', text: 'Private question', sourceIds: [] }],
        steps: [
          { id: 'open', text: 'Collect report', due: '2026-01-04', completedAt: null },
          { id: 'done', text: 'Done step', due: '2026-01-02', completedAt: '2026-01-01' },
          { id: 'undated', text: 'Undated step', due: '', completedAt: null },
        ],
      },
    ]
    const choices = calendarChoices(state)
    expect(choices.map((c) => c.id)).toEqual(['step-open'])
    expect(selectedCalendarEntries(choices, ['step-done', 'removed'], 'owner', true)).toEqual([])
    const exported = selectedCalendarEntries(choices, ['step-open'], 'owner', true)
    expect(exported[0]).toMatchObject({ title: 'Collect report', date: '2026-01-04' })
    expect(JSON.stringify(exported)).not.toMatch(
      /Private recap|Private question|Done step|Undated step/,
    )
    state.visitHistory[0].steps[0].completedAt = '2026-01-04'
    expect(calendarChoices(state)).toEqual([])
  })
})
