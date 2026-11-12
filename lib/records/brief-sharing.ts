import { z } from 'zod'
import { validDate } from './import-csv'
import type { buildPersonalBrief } from './personal-brief'

const identifiers = (max: number) => z.array(z.string().min(1).max(100)).max(max)
export const briefSelectionSchema = z
  .object({
    visitDetails: z.boolean(),
    questionIds: identifiers(20),
    recordIds: identifiers(100),
    pastVisitIds: identifiers(100),
    baseline: z.string().refine((date) => date === '' || validDate(date)),
  })
  .strict()

export const createBriefShareSchema = z
  .object({
    type: z.literal('create'),
    requestId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    selection: briefSelectionSchema,
    preparedOn: z.string().refine(validDate),
    expiresInHours: z.union([z.literal(1), z.literal(24), z.literal(168)]),
    reviewed: z.literal(true),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export const briefShareCommandSchema = z.discriminatedUnion('type', [
  createBriefShareSchema,
  z.object({ type: z.literal('revoke'), id: z.string().uuid() }).strict(),
])
export const sharedBriefRequestSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()
export type CreateBriefShare = z.infer<typeof createBriefShareSchema>
export type SharedBrief = ReturnType<typeof buildPersonalBrief>
export interface OwnedBriefShare {
  id: string
  createdAt: string
  expiresAt: string
  opens: number
  lastOpenedAt: string | null
  token: string
  brief: SharedBrief
}
