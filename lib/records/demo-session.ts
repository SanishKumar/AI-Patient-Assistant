import type { ReviewEvent, VisitQuestion } from './types'

export interface DemoSession {
  imported: boolean
  questions: VisitQuestion[]
  reviews: ReviewEvent[]
}

export const emptySession: DemoSession = { imported: false, questions: [], reviews: [] }
const validSources = new Set([
  'lab-jan',
  'visit-jan',
  'lab-apr',
  'rx-apr',
  'visit-aug',
  'lab-oct',
  'visit-oct',
])

export function restoreSession(raw: string | null): DemoSession {
  if (!raw) return emptySession
  try {
    const value = JSON.parse(raw)
    if (
      value.version !== 1 ||
      typeof value.imported !== 'boolean' ||
      !Array.isArray(value.questions) ||
      !Array.isArray(value.reviews)
    )
      return emptySession
    const questions: VisitQuestion[] = value.questions
      .slice(0, 20)
      .filter(
        (question: VisitQuestion) =>
          question &&
          typeof question.id === 'string' &&
          question.id.length <= 100 &&
          typeof question.text === 'string' &&
          question.text.trim().length > 0 &&
          question.text.length <= 240 &&
          Array.isArray(question.sourceIds) &&
          question.sourceIds.every((id) => validSources.has(id)),
      )
    const reviews: ReviewEvent[] = value.reviews
      .slice(0, 20)
      .filter(
        (event: ReviewEvent) =>
          event &&
          typeof event.id === 'string' &&
          event.id.length <= 100 &&
          event.conflictId === 'allergy-history' &&
          ['flagged-for-visit', 'evidence-reviewed'].includes(event.action) &&
          typeof event.at === 'string' &&
          Number.isFinite(Date.parse(event.at)),
      )
    return { imported: value.imported, questions, reviews }
  } catch {
    return emptySession
  }
}

export type SessionAction =
  | { type: 'restore'; session: DemoSession }
  | { type: 'import' }
  | { type: 'question'; question: VisitQuestion }
  | { type: 'remove-question'; id: string }
  | { type: 'review'; event: ReviewEvent }
  | { type: 'reset' }

export function sessionReducer(state: DemoSession, action: SessionAction): DemoSession {
  switch (action.type) {
    case 'restore':
      return action.session
    case 'reset':
      return emptySession
    case 'import':
      return { ...state, imported: true }
    case 'question': {
      const question = { ...action.question, text: action.question.text.trim() }
      if (
        !question.text ||
        question.text.length > 240 ||
        state.questions.length >= 20 ||
        state.questions.some((item) => item.text === question.text)
      )
        return state
      return { ...state, questions: [...state.questions, question] }
    }
    case 'remove-question':
      return {
        ...state,
        questions: state.questions.filter((question) => question.id !== action.id),
      }
    case 'review':
      if (
        state.reviews.some(
          (event) =>
            event.action === action.event.action && event.conflictId === action.event.conflictId,
        )
      )
        return state
      return { ...state, reviews: [...state.reviews, action.event] }
  }
}
