'use client'

import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { briefText, buildPersonalBrief, initialBriefSelection } from '@/lib/records/personal-brief'
import { formatDate, localCalendarDate } from '@/lib/records/selectors'
import type { PersonalWorkspace } from '@/lib/records/workspace'
import { downloadText } from './downloads'
import { WorkspaceDialog } from './WorkspaceDialog'
import { VisitBriefPaper } from './VisitBriefPaper'
import { BriefShareControl, type ShareStatus } from './BriefShareControl'
import { medicationUsageLabels } from '@/lib/records/health-list'
import styles from './VisitBriefDialog.module.css'

function Choices({
  label,
  items,
  selected,
  onChange,
  empty,
}: {
  label: string
  items: { id: string; title: string; detail?: string }[]
  selected: string[]
  onChange: (id: string, checked: boolean) => void
  empty: string
}) {
  return (
    <fieldset className={styles.group}>
      <legend>
        {label}{' '}
        <span>
          {items.filter((item) => selected.includes(item.id)).length}/{items.length}
        </span>
      </legend>
      {items.length ? (
        <div className={styles.choices}>
          {items.map((item) => (
            <label key={item.id} className={styles.choice}>
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={(e) => onChange(item.id, e.target.checked)}
              />
              <span>
                {item.title}
                {item.detail && <small>{item.detail}</small>}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className={styles.hint}>{empty}</p>
      )}
    </fieldset>
  )
}

export function VisitBriefDialog({
  workspace,
  name,
  onClose,
  owner,
  revision,
}: {
  workspace: PersonalWorkspace
  name: string
  onClose: () => void
  owner: string
  revision: number
}) {
  const [selection, setSelection] = useState(() => initialBriefSelection(workspace))
  const [preparedOn] = useState(() => localCalendarDate())
  const [mobileView, setMobileView] = useState<'choices' | 'preview'>('choices')
  const [shareStatus, setShareStatus] = useState<ShareStatus>('idle')
  const hasVisitDetails = Object.values(workspace.visit).some(Boolean)
  const brief = buildPersonalBrief(workspace, name, selection, preparedOn)
  const sorted = [...workspace.records].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const items = sorted.map((r) => ({
    id: r.id,
    title: r.source.label,
    detail: r.source.personalNote
      ? formatDate(r.occurredAt)
      : [
          formatDate(r.occurredAt),
          r.provider,
          r.observations.length
            ? `${r.observations.length} ${r.observations.length === 1 ? 'reading' : 'readings'}`
            : 'Source reference only',
        ].join(' · '),
    journal: !!r.source.personalNote,
  }))
  function toggle(
    key: 'recordIds' | 'questionIds' | 'pastVisitIds' | 'medicationIds' | 'allergyIds',
    id: string,
    checked: boolean,
  ) {
    setSelection((current) => ({
      ...current,
      [key]: checked ? [...current[key], id] : current[key].filter((v) => v !== id),
    }))
  }
  const hasContent = brief.sections.length > 0
  const measuredRecords = sorted.filter(
    (r) => selection.recordIds.includes(r.id) && r.observations.length,
  )
  return (
    <WorkspaceDialog
      open
      wide
      onClose={() => {
        if (shareStatus !== 'saving') onClose()
      }}
      title="Build your visit brief"
      description="Choose what to bring to your visit. The preview shows what will appear in your printout or download."
    >
      <div className={styles.mobileSwitch} role="group" aria-label="Brief view">
        <button
          type="button"
          aria-pressed={mobileView === 'choices'}
          onClick={() => setMobileView('choices')}
        >
          Choose contents
        </button>
        <button
          type="button"
          aria-pressed={mobileView === 'preview'}
          onClick={() => setMobileView('preview')}
        >
          View preview
        </button>
      </div>
      <div className={styles.builder} data-view={mobileView}>
        <fieldset
          className={styles.picker}
          disabled={shareStatus !== 'idle'}
          aria-label="Brief contents"
        >
          <label className={styles.choice}>
            <input
              type="checkbox"
              disabled={!hasVisitDetails}
              checked={selection.visitDetails}
              onChange={(e) => setSelection({ ...selection, visitDetails: e.target.checked })}
            />
            <span>
              Visit details
              <small>
                {hasVisitDetails
                  ? 'Include the details saved in your visit plan.'
                  : 'No details saved for this visit.'}
              </small>
            </span>
          </label>
          <Choices
            label="Questions"
            selected={selection.questionIds}
            onChange={(id, checked) => toggle('questionIds', id, checked)}
            items={workspace.questions.map((q) => ({ id: q.id, title: q.text }))}
            empty="No questions saved."
          />
          <Choices
            label="Records"
            selected={selection.recordIds}
            onChange={(id, checked) => toggle('recordIds', id, checked)}
            items={items.filter((r) => !r.journal)}
            empty="No reports saved."
          />
          {measuredRecords.length >= 2 && (
            <label className={styles.baseline}>
              Compare readings from
              <input
                type="date"
                max={preparedOn}
                value={selection.baseline}
                onChange={(e) => setSelection({ ...selection, baseline: e.target.value })}
              />
              <small>Leave blank to use the earliest selected reading for each measurement.</small>
            </label>
          )}
          <Choices
            label="Journal entries"
            selected={selection.recordIds}
            onChange={(id, checked) => toggle('recordIds', id, checked)}
            items={items.filter((r) => r.journal)}
            empty="No journal entries saved."
          />
          {!!workspace.visitHistory.length && (
            <Choices
              label="Past visits"
              selected={selection.pastVisitIds}
              onChange={(id, checked) => toggle('pastVisitIds', id, checked)}
              items={[...workspace.visitHistory]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((v) => ({
                  id: v.id,
                  title: [formatDate(v.date), v.clinic].filter(Boolean).join(' · '),
                  detail: v.steps.length
                    ? 'Includes your notes and all follow-up steps'
                    : 'Includes your visit notes',
                }))}
              empty="No past visits saved."
            />
          )}
          {!!workspace.medications.length && (
            <Choices
              label="Medications"
              selected={selection.medicationIds}
              onChange={(id, checked) => toggle('medicationIds', id, checked)}
              items={workspace.medications.map((m) => ({
                id: m.id,
                title: m.name,
                detail: `${medicationUsageLabels[m.usage]} · Patient-reported`,
              }))}
              empty="No medications entered."
            />
          )}
          {!!workspace.allergies.length && (
            <Choices
              label="Allergy concerns"
              selected={selection.allergyIds}
              onChange={(id, checked) => toggle('allergyIds', id, checked)}
              items={workspace.allergies.map((a) => ({
                id: a.id,
                title: a.substance,
                detail: 'Patient-reported',
              }))}
              empty="No allergy concerns entered."
            />
          )}
          <p className={styles.hint}>
            Questions appear as written. Select a linked record to include its source reference.
          </p>
        </fieldset>
        <div className={styles.preview}>
          <div className={styles.actions}>
            <button
              className="button button-primary"
              disabled={!hasContent}
              onClick={() => window.print()}
            >
              <Printer size={16} /> Print / save PDF
            </button>
            <button
              className="button button-outline"
              disabled={!hasContent}
              onClick={() =>
                downloadText(briefText(brief), 'aether-visit-brief.txt', 'text/plain;charset=utf-8')
              }
            >
              <Download size={15} /> Download text
            </button>
          </div>
          <div className={styles.actions}>
            <BriefShareControl
              brief={brief}
              selection={selection}
              preparedOn={preparedOn}
              owner={owner}
              revision={revision}
              onStatus={setShareStatus}
            />
          </div>
          <VisitBriefPaper brief={brief} />
        </div>
      </div>
    </WorkspaceDialog>
  )
}
