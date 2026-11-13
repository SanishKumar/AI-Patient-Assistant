import { z } from 'zod'
import type { HealthRecord, VisitQuestion } from './types'
import { validDate } from './import-csv'
import { documentReviewSchema } from './documents'
import {
  medicationSchema,
  allergySchema,
  type MedicationEntry,
  type AllergyEntry,
} from './health-list'

const text = (length: number) =>
  z
    .string()
    .trim()
    .max(length)
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))
export const visitSchema = z
  .object({
    date: z.string().refine((date) => date === '' || validDate(date)),
    time: z.string().regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/),
    clinician: text(100),
    location: text(160),
    reason: text(500),
  })
  .strict()
export type VisitPlan = z.infer<typeof visitSchema>
export const emptyVisit: VisitPlan = { date: '', time: '', clinician: '', location: '', reason: '' }
export const noteSchema = z
  .object({ title: text(120).min(1), date: z.string().refine(validDate), text: text(4000).min(1) })
  .strict()
export type PersonalNote = z.infer<typeof noteSchema>
export const MAX_VISIT_HISTORY = 100
export const MAX_VISIT_STEPS = 12
const stepDraftSchema = z
  .object({
    id: z.string().uuid().optional(),
    text: text(240).min(1),
    due: z.string().refine((date) => date === '' || validDate(date)),
  })
  .strict()
export const outcomeSchema = z
  .object({
    date: z.string().refine(validDate),
    clinic: text(100),
    recap: text(3000).min(1),
    steps: z.array(stepDraftSchema).max(MAX_VISIT_STEPS),
  })
  .strict()
export type VisitOutcome = z.infer<typeof outcomeSchema>
export interface CompletedVisit extends Omit<VisitOutcome, 'steps'> {
  id: string
  recordedAt: string
  plan: VisitPlan | null
  questions: VisitQuestion[]
  steps: { id: string; text: string; due: string; completedAt: string | null }[]
}
export interface PersonalWorkspace {
  version: 2
  records: HealthRecord[]
  questions: VisitQuestion[]
  visit: VisitPlan
  visitCalendarId?: string
  visitHistory: CompletedVisit[]
  medications: MedicationEntry[]
  allergies: AllergyEntry[]
}
export interface WorkspaceSnapshot {
  state: PersonalWorkspace
  revision: number
}
export function newWorkspace(): PersonalWorkspace {
  return {
    version: 2,
    records: [],
    questions: [],
    visit: { ...emptyVisit },
    visitHistory: [],
    visitCalendarId: crypto.randomUUID(),
    medications: [],
    allergies: [],
  }
}
export const commandSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
    command: z.discriminatedUnion('type', [
      documentReviewSchema,
      z
        .object({
          type: z.literal('import-file'),
          name: text(120).min(1),
          content: z
            .string()
            .min(1)
            .max(16 * 1024),
          belongsToMe: z.literal(true),
        })
        .strict(),
      z.object({ type: z.literal('note'), note: noteSchema }).strict(),
      z.object({ type: z.literal('visit'), visit: visitSchema }).strict(),
      z
        .object({
          type: z.literal('save-medication'),
          id: z.string().uuid().optional(),
          medication: medicationSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal('save-allergy'),
          id: z.string().uuid().optional(),
          allergy: allergySchema,
        })
        .strict(),
      z
        .object({
          type: z.literal('remove-medication'),
          id: z.string().uuid(),
          confirmation: z.literal('DELETE'),
        })
        .strict(),
      z
        .object({
          type: z.literal('remove-allergy'),
          id: z.string().uuid(),
          confirmation: z.literal('DELETE'),
        })
        .strict(),
      z
        .object({
          type: z.literal('record-visit'),
          outcome: outcomeSchema,
          usePlan: z.boolean(),
          carryQuestionIds: z.array(z.string().uuid()).max(20),
        })
        .strict(),
      z
        .object({
          type: z.literal('edit-visit-outcome'),
          id: z.string().uuid(),
          outcome: outcomeSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal('set-visit-step'),
          id: z.string().uuid(),
          stepId: z.string().uuid(),
          done: z.boolean(),
        })
        .strict(),
      z
        .object({
          type: z.literal('remove-visit'),
          id: z.string().uuid(),
          confirmation: z.literal('DELETE'),
        })
        .strict(),
      z
        .object({
          type: z.literal('question'),
          text: text(240).min(1),
          sourceIds: z.array(z.string().min(1).max(100)).max(7),
        })
        .strict(),
      z.object({ type: z.literal('remove-question'), id: z.string().uuid() }).strict(),
      z
        .object({
          type: z.literal('remove-record'),
          id: z.string().min(1).max(100),
          confirmation: z.literal('DELETE'),
        })
        .strict(),
      z.object({ type: z.literal('erase'), confirmation: z.literal('DELETE') }).strict(),
    ]),
  })
  .strict()
export type WorkspaceCommand = z.infer<typeof commandSchema>['command']
