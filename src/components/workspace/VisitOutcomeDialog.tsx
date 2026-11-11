'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { MAX_VISIT_STEPS, outcomeSchema, type CompletedVisit } from '@/lib/records/workspace'
import { localCalendarDate } from '@/lib/records/selectors'
import { WorkspaceDialog } from './WorkspaceDialog'
import type { usePersonalWorkspace } from './usePersonalWorkspace'
import styles from './VisitHistory.module.css'

export type VisitEditor = { visit?: CompletedVisit; remove?: boolean; revision: number }

export function VisitOutcomeDialog({
  editor,
  workspace,
  onClose,
}: {
  editor: VisitEditor
  workspace: ReturnType<typeof usePersonalWorkspace>
  onClose: () => void
}) {
  const { state, busy, error, canRetry, retry, send, revision } = workspace
  const { visit } = editor
  const today = localCalendarDate()
  const [usePlan, setUsePlan] = useState(false)
  const [carry, setCarry] = useState<string[]>([])
  const [enteredDate, setEnteredDate] = useState<string | null>(visit?.date ?? null)
  const [enteredClinic, setEnteredClinic] = useState<string | null>(visit?.clinic ?? null)
  const [recap, setRecap] = useState(visit?.recap ?? '')
  const [steps, setSteps] = useState(() =>
    (visit?.steps ?? []).map((s) => ({
      key: s.id,
      id: s.id as string | undefined,
      text: s.text,
      due: s.due,
    })),
  )
  const [formError, setFormError] = useState('')
  const hasPlan = state.questions.length > 0 || Object.values(state.visit).some(Boolean)
  const date =
    enteredDate ??
    (usePlan && state.visit.date && state.visit.date <= today ? state.visit.date : today)
  const clinic = enteredClinic ?? (usePlan ? state.visit.clinician : '')
  const stale = revision !== editor.revision
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (stale || busy) return
    if (editor.remove && visit) {
      if (await send({ type: 'remove-visit', id: visit.id, confirmation: 'DELETE' })) onClose()
      return
    }
    const outcome = outcomeSchema.safeParse({
      date,
      clinic,
      recap,
      steps: steps.map((s) => ({ id: s.id, text: s.text, due: s.due })),
    })
    if (!outcome.success || date > today) {
      setFormError(
        'Check the visit date, your notes, and the text and date of each follow-up step.',
      )
      return
    }
    setFormError('')
    const saved = visit
      ? await send({ type: 'edit-visit-outcome', id: visit.id, outcome: outcome.data })
      : await send({
          type: 'record-visit',
          usePlan,
          carryQuestionIds: usePlan ? carry : [],
          outcome: outcome.data,
        })
    if (saved) onClose()
  }
  return (
    <WorkspaceDialog
      open
      onClose={() => {
        if (workspace.status !== 'saving') onClose()
      }}
      title={
        editor.remove ? 'Delete this past visit?' : visit ? 'Edit past visit' : 'Record a visit'
      }
      description={
        editor.remove
          ? 'This removes the saved visit, its notes, and its follow-up steps from your history.'
          : 'Write down what happened and what you want to do next, in your own words.'
      }
    >
      <form className="account-form" onSubmit={submit}>
        {editor.remove && visit ? (
          <p>
            {visit.date} · {visit.clinic || 'Past visit'}
          </p>
        ) : (
          <fieldset disabled={busy || stale} className={styles.fields}>
            {!visit && hasPlan && (
              <div className={styles.planBox}>
                <label className={styles.tick}>
                  <input
                    type="checkbox"
                    checked={usePlan}
                    onChange={(e) => setUsePlan(e.target.checked)}
                  />{' '}
                  Move my current plan and questions into this visit
                </label>
                {usePlan && (
                  <div className={styles.carry}>
                    <p>
                      {[state.visit.clinician, state.visit.date, state.visit.reason]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p>
                      Saving starts a fresh plan. Select any questions you also want to keep for
                      your next visit.
                    </p>
                    {state.questions.map((q) => (
                      <label key={q.id} className={styles.tick}>
                        <input
                          type="checkbox"
                          checked={carry.includes(q.id)}
                          onChange={(e) =>
                            setCarry(
                              e.target.checked
                                ? [...carry, q.id]
                                : carry.filter((id) => id !== q.id),
                            )
                          }
                        />
                        {q.text}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="form-pair">
              <label>
                Date of visit
                <input
                  required
                  type="date"
                  max={today}
                  value={date}
                  onChange={(e) => setEnteredDate(e.target.value)}
                />
              </label>
              <label>
                Clinic or clinician (optional)
                <input
                  maxLength={100}
                  value={clinic}
                  onChange={(e) => setEnteredClinic(e.target.value)}
                />
              </label>
            </div>
            <label>
              Your visit notes
              <textarea
                rows={4}
                required
                maxLength={3000}
                value={recap}
                onChange={(e) => setRecap(e.target.value)}
              />
            </label>
            <fieldset className={styles.steps}>
              <legend>Follow-up steps</legend>
              {steps.map((step, i) => (
                <div key={step.key} className={styles.stepRow}>
                  <label>
                    Step {i + 1}
                    <input
                      required
                      maxLength={240}
                      value={step.text}
                      onChange={(e) =>
                        setSteps(
                          steps.map((s) =>
                            s.key === step.key ? { ...s, text: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Due date {i + 1} (optional)
                    <input
                      type="date"
                      value={step.due}
                      onChange={(e) =>
                        setSteps(
                          steps.map((s) =>
                            s.key === step.key ? { ...s, due: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove step ${i + 1}`}
                    onClick={() => setSteps(steps.filter((s) => s.key !== step.key))}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button button-outline"
                disabled={steps.length >= MAX_VISIT_STEPS}
                onClick={() =>
                  setSteps([
                    ...steps,
                    { key: crypto.randomUUID(), id: undefined, text: '', due: '' },
                  ])
                }
              >
                <Plus size={15} /> Add a step
              </button>
            </fieldset>
          </fieldset>
        )}
        {(formError || error || stale) && (
          <p className="form-error" role="alert">
            {stale
              ? 'This workspace changed while the form was open. Close and reopen it to review the saved version.'
              : formError || error}
          </p>
        )}
        <div className="import-footer">
          <button
            type="button"
            className="button button-outline"
            disabled={workspace.status === 'saving'}
            onClick={onClose}
          >
            {canRetry || stale ? 'Close' : 'Cancel'}
          </button>
          {canRetry ? (
            <button
              type="button"
              className="button button-primary"
              onClick={async () => {
                if (await retry()) onClose()
              }}
            >
              Retry save
            </button>
          ) : (
            <button
              className={`button ${editor.remove ? 'button-danger' : 'button-primary'}`}
              disabled={busy || stale}
            >
              {editor.remove ? 'Delete past visit' : 'Save visit notes'}
            </button>
          )}
        </div>
      </form>
    </WorkspaceDialog>
  )
}
