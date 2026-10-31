import { z } from 'zod'
import { validDate } from './import-csv'

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENT_STORAGE_BYTES = 50 * 1024 * 1024
export const MAX_DOCUMENT_PAGES = 20
export const MAX_IMAGE_PIXELS = 20_000_000
export type DocumentMediaType = 'application/pdf' | 'image/png' | 'image/jpeg'
export type DocumentInfo = { mediaType: DocumentMediaType; pages: number }
export const documentMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    date: z.string().refine(validDate),
    provider: z.string().trim().min(1).max(160),
    kind: z.enum(['document', 'lab', 'visit', 'prescription']),
    belongsToMe: z.literal(true),
  })
  .strict()
export type DocumentMetadata = z.infer<typeof documentMetadataSchema>
export const documentUploadSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
    metadata: documentMetadataSchema,
  })
  .strict()
export const transcriptionSchema = z
  .object({
    metric: z.enum(['hba1c', 'ldl', 'systolic']),
    value: z.number().finite().nonnegative().max(1_000_000),
    unit: z.enum(['%', 'mmol/mol', 'mg/dL', 'mmol/L', 'mmHg']),
    method: z.string().trim().min(1).max(160),
    methodKnown: z.boolean(),
    page: z.number().int().min(1).max(MAX_DOCUMENT_PAGES),
  })
  .strict()
  .superRefine((value, ctx) => {
    const units = { hba1c: ['%', 'mmol/mol'], ldl: ['mg/dL', 'mmol/L'], systolic: ['mmHg'] }
    if (!units[value.metric].includes(value.unit))
      ctx.addIssue({ code: 'custom', message: 'The unit does not match the measurement.' })
    if (!value.methodKnown && value.method !== 'Not stated')
      ctx.addIssue({ code: 'custom', message: 'An unknown method must be marked Not stated.' })
  })
export type DocumentReading = z.infer<typeof transcriptionSchema>
export const documentReviewSchema = z
  .object({
    type: z.literal('document-review'),
    id: z.string().uuid(),
    readings: z.array(transcriptionSchema).max(3),
    confirmed: z.literal(true),
  })
  .strict()
  .refine(
    (value) => new Set(value.readings.map((r) => r.metric)).size === value.readings.length,
    'Add at most one reading per measurement per document.',
  )

export function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
