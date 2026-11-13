import { z } from 'zod'

const text = (length: number) =>
  z
    .string()
    .trim()
    .max(length)
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
const sourceId = z.string().min(1).max(100).nullable()
export const MAX_MEDICATIONS = 50
export const MAX_ALLERGIES = 50
export const medicationUsageLabels = {
  taking: 'Taking',
  'not-taking': 'Not taking',
  unsure: 'Unsure',
} as const

export const medicationSchema = z
  .object({
    name: text(120).min(1),
    directions: text(500),
    usage: z.enum(['taking', 'not-taking', 'unsure']),
    sourceId,
  })
  .strict()

export const allergySchema = z
  .object({
    substance: text(120).min(1),
    reaction: text(500),
    sourceId,
  })
  .strict()

export type MedicationInput = z.infer<typeof medicationSchema>
export type AllergyInput = z.infer<typeof allergySchema>
export interface MedicationEntry extends MedicationInput {
  id: string
  recordedAt: string
  updatedAt: string
}
export interface AllergyEntry extends AllergyInput {
  id: string
  recordedAt: string
  updatedAt: string
}
