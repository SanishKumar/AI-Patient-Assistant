'use client'

import { useState } from 'react'
import { ArrowUpRight, CalendarDays, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/records/selectors'
import { MAX_VISIT_HISTORY } from '@/lib/records/workspace'
import type { usePersonalWorkspace } from './usePersonalWorkspace'
import { VisitOutcomeDialog, type VisitEditor } from './VisitOutcomeDialog'
import styles from './VisitHistory.module.css'

type Workspace = ReturnType<typeof usePersonalWorkspace>

export function FollowUpOverview({
  workspace,
  openVisit,
}: {
  workspace: Workspace
  openVisit: (id: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const open = workspace.state.visitHistory
    .flatMap((visit) =>
      visit.steps.filter((step) => !step.completedAt).map((step) => ({ visit, step })),
    )
    .sort(
      (a, b) =>
        Number(!a.step.due) - Number(!b.step.due) ||
        a.step.due.localeCompare(b.step.due) ||
        b.visit.date.localeCompare(a.visit.date),
    )
  if (!open.length) return null
  return (
    <section className={`panel recent-panel ${styles.history}`} aria-label="Open follow-up steps">
      <div className="panel-heading">
        <h2>Your follow-up steps</h2>
        <span className="count-badge">{open.length} open</span>
      </div>
      {(showAll ? open : open.slice(0, 3)).map(({ visit, step }) => (
        <div className={styles.followRow} key={step.id}>
          <label className={styles.tick}>
            <input
              type="checkbox"
              checked={false}
              disabled={workspace.busy}
              onChange={() =>
                void workspace.send({
                  type: 'set-visit-step',
                  id: visit.id,
                  stepId: step.id,
                  done: true,
                })
              }
            />
            <span>
              {step.text}
              <small>{step.due ? `Due ${formatDate(step.due)}` : 'No due date'}</small>
            </span>
          </label>
          <button className="text-link" onClick={() => openVisit(visit.id)}>
            {visit.clinic || formatDate(visit.date)} <ArrowUpRight size={14} />
          </button>
        </div>
      ))}
      {open.length > 3 && (
        <button className="text-link" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer steps' : `Show all ${open.length} steps`}
        </button>
      )}
    </section>
  )
}

export function VisitHistory({
  workspace,
  expanded,
  setExpanded,
  onSource,
}: {
  workspace: Workspace
  expanded?: string
  setExpanded: (id?: string) => void
  onSource: (id: string) => void
}) {
  const { state, send, busy, revision } = workspace
  const [editor, setEditor] = useState<VisitEditor>()
  const visits = [...state.visitHistory].sort(
    (a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt),
  )
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Past visits</h1>
          <p>Your account of each appointment and the steps you want to take afterward.</p>
        </div>
        <button
          className="button button-primary"
          disabled={busy || visits.length >= MAX_VISIT_HISTORY}
          onClick={() => setEditor({ revision })}
        >
          <Plus size={16} /> Record a visit
        </button>
      </div>
      {visits.length >= MAX_VISIT_HISTORY && (
        <p className="small-note">
          Your history holds {MAX_VISIT_HISTORY} visits. Delete an older entry to add another.
        </p>
      )}
      {!visits.length ? (
        <div className="panel personal-empty">
          <CalendarDays size={30} />
          <h2>No past visits yet.</h2>
          <p>
            After an appointment, record what you discussed. You can also bring in the questions
            from your visit plan.
          </p>
        </div>
      ) : (
        <section className={styles.history} aria-label="Visit history">
          {visits.map((v) => {
            const active = expanded === v.id
            const open = v.steps.filter((s) => !s.completedAt).length
            return (
              <article key={v.id} className={styles.visit}>
                <h2>
                  <button
                    className={styles.summary}
                    aria-expanded={active}
                    aria-controls={`past-${v.id}`}
                    onClick={() => setExpanded(active ? undefined : v.id)}
                  >
                    <span className={styles.stamp} aria-hidden="true">
                      <CalendarDays size={20} />
                    </span>
                    <span>
                      <strong>{v.clinic || 'Visit notes'}</strong>
                      <small>
                        {formatDate(v.date)}
                        {v.steps.length > 0 && ` · ${open} open / ${v.steps.length} steps`}
                      </small>
                    </span>
                    <ChevronDown size={18} className={active ? styles.expanded : ''} />
                  </button>
                </h2>
                <div id={`past-${v.id}`} hidden={!active} className={styles.visitBody}>
                  <h3>Your visit notes</h3>
                  <p className={styles.recap}>{v.recap}</p>
                  {!!v.steps.length && (
                    <>
                      <h3>Follow-up steps</h3>
                      {v.steps.map((s) => (
                        <label key={s.id} className={styles.tick}>
                          <input
                            type="checkbox"
                            checked={!!s.completedAt}
                            disabled={busy}
                            onChange={(e) =>
                              void send({
                                type: 'set-visit-step',
                                id: v.id,
                                stepId: s.id,
                                done: e.target.checked,
                              })
                            }
                          />
                          <span>
                            {s.text}
                            {s.due && <small>Due {formatDate(s.due)}</small>}
                          </span>
                        </label>
                      ))}
                    </>
                  )}
                  {v.plan && Object.values(v.plan).some(Boolean) && (
                    <>
                      <h3>Original visit plan</h3>
                      <p>
                        {[
                          v.plan.date && formatDate(v.plan.date),
                          v.plan.time,
                          v.plan.clinician,
                          v.plan.location,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {v.plan.reason && <p className={styles.recap}>{v.plan.reason}</p>}
                    </>
                  )}
                  {!!v.questions.length && (
                    <>
                      <h3>Questions you brought</h3>
                      <ol className={styles.questions}>
                        {v.questions.map((q) => (
                          <li key={q.id}>
                            {q.text}
                            {q.sourceIds.map((id) => (
                              <button key={id} className="text-link" onClick={() => onSource(id)}>
                                {state.records.find((r) => r.id === id)?.source.label}{' '}
                                <ArrowUpRight size={13} />
                              </button>
                            ))}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                  <div className={styles.actions}>
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => setEditor({ revision, visit: v })}
                    >
                      <Pencil size={14} /> Edit past visit
                    </button>
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => setEditor({ revision, visit: v, remove: true })}
                    >
                      <Trash2 size={14} /> Delete visit
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}
      {editor && (
        <VisitOutcomeDialog
          editor={editor}
          workspace={workspace}
          onClose={() => setEditor(undefined)}
        />
      )}
    </>
  )
}
