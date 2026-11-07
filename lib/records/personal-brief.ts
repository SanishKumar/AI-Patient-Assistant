import { compareMetric, formatDate } from './selectors'
import type { PersonalWorkspace } from './workspace'
import { displayedMethod, type Metric, type Observation } from './types'

export interface BriefSelection {
  visitDetails: boolean
  questionIds: string[]
  recordIds: string[]
  baseline: string
}

export function initialBriefSelection(workspace: PersonalWorkspace): BriefSelection {
  return {
    visitDetails: Object.values(workspace.visit).some(Boolean),
    questionIds: workspace.questions.map((question) => question.id),
    recordIds: [],
    baseline: '',
  }
}

const readingOrigins = {
  'user-transcribed': 'Entered by you from the original document',
  'ocr-assisted': 'Recognized from the page and checked by you',
}

export function buildPersonalBrief(
  workspace: PersonalWorkspace,
  name: string,
  selection: BriefSelection,
  preparedOn: string,
) {
  const records = workspace.records
    .filter((record) => selection.recordIds.includes(record.id))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const references = new Map(records.map((record, i) => [record.id, `[${i + 1}]`]))
  const source = (id: string, reading: Observation & { line: number }) =>
    `${references.get(id)}, ${reading.page ? `page ${reading.page}` : `line ${reading.line}`}`
  const { visit } = workspace
  const sections = [
    {
      title: 'Visit details',
      entries: selection.visitDetails
        ? [
            visit.date && `Planned date: ${formatDate(visit.date)}`,
            visit.time && `Local visit time: ${visit.time}`,
            visit.clinician && `Clinician or clinic: ${visit.clinician}`,
            visit.location && `Location: ${visit.location}`,
            visit.reason && `Reason for visit: ${visit.reason}`,
          ].filter(Boolean)
        : [],
    },
    {
      title: 'Questions for this visit',
      entries: workspace.questions
        .filter((question) => selection.questionIds.includes(question.id))
        .map((question, index) => {
          const links = question.sourceIds.map((id) => references.get(id)).filter(Boolean)
          return `${index + 1}. ${question.text}${links.length ? ` ${links.join(' ')}` : ''}`
        }),
    },
    {
      title: 'Changes across selected records',
      entries: (['hba1c', 'ldl', 'systolic'] as Metric[]).flatMap((metric) => {
        const since =
          selection.baseline ||
          records.find((r) => r.observations.some((o) => o.metric === metric))?.occurredAt
        if (!since) return []
        const change = compareMetric(records, metric, since)
        if (!change || change.baseline.date === change.latest.date) return []
        const { baseline, latest } = change
        return [
          `${latest.label} · ${baseline.value} → ${latest.value} ${latest.unit} (${latest.method})\n${baseline.date} ${source(baseline.recordId, baseline)} → ${latest.date} ${source(latest.recordId, latest)}`,
        ]
      }),
    },
    {
      title: 'Recorded measurements',
      entries: records.flatMap((record) =>
        record.observations.map(
          (reading) =>
            `${record.occurredAt} · ${reading.label}: ${reading.value} ${reading.unit}\nMethod: ${displayedMethod(reading)}. Source: ${source(record.id, reading)}. ${reading.origin ? readingOrigins[reading.origin] : 'Imported from CSV'}.`,
        ),
      ),
    },
    {
      title: 'Personal journal',
      entries: records
        .filter((r) => r.source.personalNote)
        .map(
          (r) =>
            `${r.occurredAt} · ${r.title} ${references.get(r.id)}\n${r.source.lines.join('\n')}`,
        ),
    },
    {
      title: 'Source index',
      entries: records.map(
        (r) =>
          `${references.get(r.id)} ${r.source.label} · ${r.occurredAt} · ${r.provider} · ${r.source.personalNote ? 'Self-reported journal' : 'Unreviewed import'}`,
      ),
    },
  ].filter((section) => section.entries.length > 0)
  return {
    title: 'Personal visit brief',
    byline: `Prepared by ${name} · ${formatDate(preparedOn)}`,
    context:
      'Patient-prepared for discussion. Measurements and notes have not been clinically verified.',
    sections,
  }
}

export type PersonalBrief = ReturnType<typeof buildPersonalBrief>

export function briefText(brief: PersonalBrief) {
  return [
    brief.title,
    brief.byline,
    brief.context,
    ...brief.sections.map((section) => [section.title, ...section.entries].join('\n')),
  ].join('\n\n')
}

export function personalBrief(workspace: PersonalWorkspace, name: string, since: string) {
  return briefText(
    buildPersonalBrief(
      workspace,
      name,
      {
        ...initialBriefSelection(workspace),
        recordIds: workspace.records.map((record) => record.id),
        baseline: since,
      },
      new Date().toISOString().slice(0, 10),
    ),
  )
}
