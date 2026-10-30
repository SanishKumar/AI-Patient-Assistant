export type RecordKind = 'lab' | 'visit' | 'prescription'
export type ReviewStatus = 'verified' | 'unreviewed'
export type Metric = 'hba1c' | 'systolic' | 'ldl'

export interface Observation {
  metric: Metric
  label: string
  value: number
  unit: string
  method: string
  reference?: string
}

export interface HealthRecord {
  id: string
  title: string
  kind: RecordKind
  occurredAt: string
  recordedAt: string
  provider: string
  author: string
  status: ReviewStatus
  summary: string
  source: {
    label: string
    lines: string[]
    importedCsv?: { text: string; sha256: string; receivedAt: string }
    personalNote?: boolean
  }
  observations: (Observation & { line: number })[]
  allergy?: { substance: string; assertion: 'present' | 'none-known'; line: number }
  medication?: { name: string; instruction: string; line: number }
}

export interface RecordConflict {
  id: string
  title: string
  detail: string
  recordIds: string[]
}

export interface ReviewEvent {
  id: string
  conflictId: string
  action: 'flagged-for-visit' | 'evidence-reviewed'
  at: string
}

export interface VisitQuestion {
  id: string
  text: string
  sourceIds: string[]
}

export const metricLabels: Record<Metric, string> = {
  hba1c: 'HbA1c',
  systolic: 'Systolic blood pressure',
  ldl: 'LDL cholesterol',
}
