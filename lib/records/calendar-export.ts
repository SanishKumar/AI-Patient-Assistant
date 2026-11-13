import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { PersonalWorkspace } from './workspace'
import type { CalendarEntry } from './calendar'

export interface CalendarChoice {
  id: string
  kind: 'visit' | 'step'
  date: string
  label: string
  context: string
  details: string
  location?: string
}

export function calendarChoices(workspace: PersonalWorkspace): CalendarChoice[] {
  const plan = workspace.visit
  const visit: CalendarChoice[] = plan.date
    ? [
        {
          id: `visit-${workspace.visitCalendarId}`,
          kind: 'visit',
          date: plan.date,
          label: 'Visit plan',
          context: plan.clinician,
          details: [plan.clinician, plan.time && `Saved local visit time ${plan.time}`, plan.reason]
            .filter(Boolean)
            .join('\n'),
          location: plan.location,
        },
      ]
    : []
  return [
    ...visit,
    ...workspace.visitHistory.flatMap((v) =>
      v.steps
        .filter((step) => step.due && !step.completedAt)
        .map((step): CalendarChoice => ({
          id: `step-${step.id}`,
          kind: 'step',
          date: step.due,
          label: step.text,
          context: v.clinic,
          details: [step.text, `From my visit on ${v.date}`, v.clinic].filter(Boolean).join('\n'),
        })),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date))
}

export function selectedCalendarEntries(
  choices: CalendarChoice[],
  selected: string[],
  owner: string,
  includeDetails: boolean,
): CalendarEntry[] {
  return choices
    .filter((item) => selected.includes(item.id))
    .map((item) => ({
      id: bytesToHex(sha256(new TextEncoder().encode(`${owner}:calendar:${item.id}`))),
      date: item.date,
      title:
        includeDetails && item.kind === 'step'
          ? item.label
          : item.kind === 'visit'
            ? 'Health visit'
            : 'Personal follow-up',
      description: includeDetails ? item.details : undefined,
      location: includeDetails ? item.location : undefined,
    }))
}
