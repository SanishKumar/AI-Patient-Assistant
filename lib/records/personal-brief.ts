import { compareMetric } from './selectors'
import type { PersonalWorkspace } from './workspace'
import type { Metric } from './types'

export function personalBrief(workspace: PersonalWorkspace, name: string, since: string) {
  const { records, questions, visit } = workspace
  const changes = (['hba1c', 'ldl', 'systolic'] as Metric[]).flatMap((metric) => {
    const value = compareMetric(records, metric, since)
    if (!value) return []
    const { baseline, latest } = value
    return [
      `${latest.label}: ${baseline.value} → ${latest.value} ${latest.unit} (${baseline.date} → ${latest.date}; method: ${latest.method}). Sources: ${baseline.recordId}, ${latest.recordId}.`,
    ]
  })
  return [
    'AETHER HEALTH · PERSONAL VISIT BRIEF',
    `Prepared by: ${name}`,
    `Exported: ${new Date().toISOString()}`,
    'Patient-prepared. Not a signed clinical note or medical advice.',
    '',
    'VISIT DETAILS',
    `Date: ${visit.date || 'Not set'}${visit.time ? ` at ${visit.time} (local visit time)` : ''}`,
    `Clinician: ${visit.clinician || 'Not set'}`,
    `Location: ${visit.location || 'Not set'}`,
    `Reason: ${visit.reason || 'Not added'}`,
    'These are your saved plans, not a confirmed booking.',
    '',
    'RECORDED CHANGES',
    ...(changes.length ? changes : ['Not enough comparable measurements.']),
    'Values describe the records. Units and methods are not converted; changes do not establish a cause.',
    '',
    'RECORDED MEASUREMENTS',
    ...records.flatMap((record) =>
      record.observations.map(
        (reading) =>
          `${record.occurredAt} · ${reading.label}: ${reading.value} ${reading.unit} · Method: ${reading.method}. Source: ${record.id}, ${reading.page ? `page ${reading.page}` : `line ${reading.line}`}. ${reading.origin === 'user-transcribed' ? 'Entered by you from the original document' : 'Imported from CSV'}; not clinically verified.`,
      ),
    ),
    '',
    'QUESTIONS',
    ...(questions.length
      ? questions.map(
          (q, i) =>
            `${i + 1}. ${q.text}${q.sourceIds.length ? ` [${q.sourceIds.join(', ')}]` : ''}`,
        )
      : ['No questions added.']),
    '',
    'PERSONAL JOURNAL (SELF-REPORTED)',
    ...records
      .filter((r) => r.source.personalNote)
      .map((r) => `${r.occurredAt} · ${r.title}\n${r.source.lines.join('\n')}\nSource: ${r.id}`),
    '',
    'SOURCE INDEX',
    ...records.map(
      (r) =>
        `${r.id} · ${r.occurredAt} · ${r.source.label} · ${r.provider} · ${r.source.personalNote ? 'self-reported' : 'unreviewed import'}`,
    ),
    '',
    'Imported records and personal notes have not been clinically verified. This workspace may be incomplete; confirm medications, allergies, and interpretation with your clinician.',
  ].join('\n')
}
