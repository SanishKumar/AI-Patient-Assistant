import type { HealthRecord, Metric, RecordConflict, VisitQuestion } from './types'

export function recordsAsOf(records: HealthRecord[], date: string) {
  return records
    .filter((record) => record.occurredAt <= date && record.recordedAt <= date)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id))
}

export function observationSeries(records: HealthRecord[], metric: Metric) {
  return records
    .flatMap((record) =>
      record.observations
        .filter((observation) => observation.metric === metric)
        .map((observation) => ({
          ...observation,
          recordId: record.id,
          date: record.occurredAt,
          status: record.status,
        })),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function compareMetric(records: HealthRecord[], metric: Metric, since: string) {
  const series = observationSeries(records, metric)
  const latest = series[series.length - 1]
  const baselinePoints = series.filter((point) => point.date <= since)
  const baseline = baselinePoints[baselinePoints.length - 1]
  if (!latest || !baseline || latest.recordId === baseline.recordId) return null
  // Different units or methods are not directly comparable. Do not silently convert them.
  if (latest.unit !== baseline.unit || latest.method !== baseline.method) return null
  return { baseline, latest, delta: Math.round((latest.value - baseline.value) * 10) / 10 }
}

export function findConflicts(records: HealthRecord[]): RecordConflict[] {
  const positive = records.filter((record) => record.allergy?.assertion === 'present')
  const noneKnown = records.filter((record) => record.allergy?.assertion === 'none-known')
  if (!positive.length || !noneKnown.length) return []
  return [
    {
      id: 'allergy-history',
      title: 'Two different allergy histories',
      detail:
        'A penicillin allergy is reported in one record; another lists no known drug allergies. Neither entry has been reconciled.',
      recordIds: [...positive, ...noneKnown].map((record) => record.id),
    },
  ]
}

export function searchRecords(records: HealthRecord[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return records.filter((record) => {
    const text = [
      record.title,
      record.provider,
      record.kind,
      record.summary,
      ...record.source.lines,
    ]
      .join(' ')
      .toLowerCase()
    return terms.every((term) => text.includes(term))
  })
}

export function formatDate(date: string, short = false) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: short ? 'short' : 'long',
    ...(short ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

export function buildVisitBrief(
  records: HealthRecord[],
  questions: VisitQuestion[],
  since: string,
) {
  const changes = (['hba1c', 'ldl', 'systolic'] as Metric[]).flatMap((metric) => {
    const comparison = compareMetric(records, metric, since)
    if (!comparison) return []
    const { baseline, latest } = comparison
    return [
      `${latest.label}: ${baseline.value} → ${latest.value} ${latest.unit} (${baseline.date} → ${latest.date}). Sources: ${baseline.recordId}, ${latest.recordId}. Latest source: ${latest.status}.`,
    ]
  })
  return [
    'AETHER HEALTH · SYNTHETIC VISIT BRIEF',
    'Fictional patient: Ananya Rao',
    'Preparation only. Not a signed clinical note or medical advice.',
    '',
    'RECORDED CHANGES',
    ...changes,
    'Changes describe the record; they do not establish a cause or treatment effect.',
    '',
    'UNRESOLVED RECORD DISAGREEMENTS',
    ...findConflicts(records).map(
      (conflict) => `${conflict.detail} Sources: ${conflict.recordIds.join(', ')}.`,
    ),
    '',
    'QUESTIONS FOR THE VISIT',
    ...questions.map(
      (question, index) =>
        `${index + 1}. ${question.text}${question.sourceIds.length ? ` [${question.sourceIds.join(', ')}]` : ''}`,
    ),
    '',
    'SOURCE INDEX',
    ...records.map(
      (record) => `${record.id} · ${record.source.label} · ${record.provider} · ${record.status}`,
    ),
    '',
    'Missing from this workspace: confirmed current medication use, clinician interpretation, and a reconciled allergy history.',
  ].join('\n')
}
