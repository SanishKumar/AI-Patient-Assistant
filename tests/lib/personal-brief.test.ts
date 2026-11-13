import { describe, expect, it } from 'vitest'
import { importLabCsv, sampleLabCsv } from '../../lib/records/import-csv'
import {
  briefText,
  buildPersonalBrief,
  initialBriefSelection,
} from '../../lib/records/personal-brief'
import { newWorkspace } from '../../lib/records/workspace'

const first = importLabCsv('first.csv', sampleLabCsv, '2026-11-01')
const next = importLabCsv(
  'next.csv',
  sampleLabCsv.replaceAll('10-27', '10-30').replace('6.7', '6.5'),
  '2026-11-01',
)
const hidden = importLabCsv(
  'omitted.csv',
  sampleLabCsv.replaceAll('10-27', '10-31').replace('6.7', '9.9'),
  '2026-11-01',
)
const workspace = newWorkspace()
workspace.records = [hidden, next, first]
workspace.visit.reason = 'Private reason'
workspace.questions = [
  { id: 'ask', text: 'Which readings should I bring?', sourceIds: [first.id, hidden.id] },
  { id: 'skip', text: 'Private question', sourceIds: [hidden.id] },
]
const defaults = initialBriefSelection(workspace)
const build = (selection: typeof defaults) =>
  buildPersonalBrief(workspace, 'Example Owner', selection, '2026-11-01')

describe('patient-selected visit briefs', () => {
  it('includes only selected patient-reported health entries and explicitly chosen linked records', () => {
    const health = newWorkspace()
    health.records = [first]
    health.medications = [
      {
        id: 'med',
        name: 'Example supplement',
        directions: 'Exactly as written',
        usage: 'not-taking',
        sourceId: first.id,
        recordedAt: '2026-11-14T00:00:00Z',
        updatedAt: '2026-11-14T00:00:00Z',
      },
    ]
    health.allergies = [
      {
        id: 'allergy',
        substance: 'Example ingredient',
        reaction: '',
        sourceId: first.id,
        recordedAt: '2026-11-14T00:00:00Z',
        updatedAt: '2026-11-14T00:00:00Z',
      },
    ]
    const options = initialBriefSelection(health)
    expect(buildPersonalBrief(health, 'Owner', options, '2026-11-14').sections).toEqual([])
    const selection = { ...options, medicationIds: ['med'], allergyIds: ['allergy'] }
    const text = briefText(buildPersonalBrief(health, 'Owner', selection, '2026-11-14'))
    expect(text).toContain('Medications (patient-reported)')
    expect(text).toContain('Example supplement · Not taking')
    expect(text).toContain('Directions as entered: Exactly as written')
    expect(text).toContain('Allergy concerns (patient-reported)')
    expect(text).toContain('Reaction not entered.')
    expect(text).toContain('Last updated by patient 14 November 2026')
    expect(text).not.toMatch(/first\.csv|Linked record|Source index|csv-/)
    const linked = briefText(
      buildPersonalBrief(health, 'Owner', { ...selection, recordIds: [first.id] }, '2026-11-14'),
    )
    expect(linked).toContain('Linked record [1].')
    expect(linked).toContain('[1] first.csv')
  })
  it('starts with the visit and questions but no records or linked identifiers', () => {
    const text = briefText(build(defaults))
    expect(text).toContain('Private reason')
    expect(text).toContain('Private question')
    expect(text).not.toMatch(/\.csv|csv-|Source index|Recorded measurements|\[1\]/)
  })

  it('derives comparisons, numbering, source references and sections only from included content', () => {
    const text = briefText(
      build({
        ...defaults,
        visitDetails: false,
        questionIds: ['ask'],
        recordIds: [next.id, first.id],
      }),
    )
    expect(text).toContain('Which readings should I bring? [1]')
    expect(text).toContain('6.7 → 6.5 %')
    expect(text).toContain('2026-10-27 [1], line 2 → 2026-10-30 [2], line 2')
    expect(text).toContain('[2] next.csv')
    expect(text).not.toMatch(/omitted|9\.9|Private reason|Private question|csv-|2026-10-31/)
    const one = briefText(build({ ...defaults, recordIds: [first.id] }))
    expect(one).not.toContain('Changes across selected records')
    expect(one).toContain('Recorded measurements')
    const laterBaseline = briefText(
      build({ ...defaults, recordIds: [first.id, next.id], baseline: '2026-10-30' }),
    )
    expect(laterBaseline).not.toContain('Changes across selected records')
  })

  it('ignores missing selections and never fills out an empty brief from the rest of the account', () => {
    expect(
      build({ ...defaults, visitDetails: false, questionIds: ['removed'], recordIds: ['removed'] })
        .sections,
    ).toEqual([])
  })
  it('shares past notes and follow-up steps only for the chosen visit', () => {
    const saved = newWorkspace()
    const visit = {
      id: 'first-visit',
      recordedAt: '2026-10-02',
      date: '2026-10-01',
      clinic: 'October clinic',
      recap: 'Discussed the report',
      plan: { ...saved.visit, reason: 'Old private plan' },
      questions: [{ id: 'old', text: 'Old private question', sourceIds: ['private-id'] }],
      steps: [{ id: 'step', text: 'Collect a copy', due: '2026-10-09', completedAt: null }],
    }
    saved.visitHistory = [visit, { ...visit, id: 'other', recap: 'Another private recap' }]
    const options = initialBriefSelection(saved)
    expect(buildPersonalBrief(saved, 'Owner', options, '2026-11-01').sections).toEqual([])
    const text = briefText(
      buildPersonalBrief(saved, 'Owner', { ...options, pastVisitIds: [visit.id] }, '2026-11-01'),
    )
    expect(text).toContain('Discussed the report')
    expect(text).toContain('Open · Collect a copy · Due 9 October 2026')
    expect(text).not.toMatch(/Another private recap|Old private|private-id/)
  })
})
