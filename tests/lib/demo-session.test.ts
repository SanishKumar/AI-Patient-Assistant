import { describe, expect, it } from 'vitest'
import { emptySession, restoreSession, sessionReducer } from '@/lib/records/demo-session'

describe('synthetic workspace state', () => {
  it('recovers safely from corrupt and stale browser storage', () => {
    for (const raw of ['{', 'null', '{}', '{"version":2}', '"string"'])
      expect(restoreSession(raw)).toEqual(emptySession)
  })
  it('preserves valid drafts but rejects unknown sources and malformed activity', () => {
    const session = restoreSession(
      JSON.stringify({
        version: 1,
        imported: true,
        questions: [
          { id: 'q1', text: 'What changed?', sourceIds: ['lab-oct'] },
          { id: 'q2', text: 'Bad source', sourceIds: ['other-patient'] },
        ],
        reviews: [{ id: 'r1', conflictId: 'allergy-history', action: 'signed', at: 'invalid' }],
      }),
    )
    expect(session.imported).toBe(true)
    expect(session.questions).toHaveLength(1)
    expect(session.reviews).toHaveLength(0)
  })
  it('makes repeated imports and review actions idempotent', () => {
    const state = sessionReducer(emptySession, { type: 'import' })
    expect(sessionReducer(state, { type: 'import' })).toEqual(state)
    const action = {
      type: 'review',
      event: {
        id: 'r1',
        conflictId: 'allergy-history',
        action: 'evidence-reviewed',
        at: '2026-10-28T00:00:00Z',
      },
    } as const
    const reviewed = sessionReducer(state, action)
    expect(sessionReducer(reviewed, action).reviews).toHaveLength(1)
  })
  it('deduplicates questions and rejects whitespace-only input', () => {
    const action = {
      type: 'question',
      question: { id: 'q1', text: '  What changed?  ', sourceIds: [] },
    } as const
    const state = sessionReducer(emptySession, {
      ...action,
      question: { ...action.question, sourceIds: [] },
    })
    expect(state.questions[0].text).toBe('What changed?')
    expect(
      sessionReducer(state, {
        type: 'question',
        question: { id: 'q2', text: 'What changed?', sourceIds: [] },
      }).questions,
    ).toHaveLength(1)
    expect(
      sessionReducer(state, { type: 'question', question: { id: 'q3', text: ' ', sourceIds: [] } })
        .questions,
    ).toHaveLength(1)
  })
})
