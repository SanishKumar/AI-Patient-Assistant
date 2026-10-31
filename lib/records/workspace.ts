import { z } from 'zod'
import type { HealthRecord, VisitQuestion } from './types'
import { validDate } from './import-csv'
import { documentReviewSchema } from './documents'

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
export interface PersonalWorkspace {
  version: 2
  records: HealthRecord[]
  questions: VisitQuestion[]
  visit: VisitPlan
}
export interface WorkspaceSnapshot {
  state: PersonalWorkspace
  revision: number
}
export function newWorkspace(): PersonalWorkspace {
  return { version: 2, records: [], questions: [], visit: { ...emptyVisit } }
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
