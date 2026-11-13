'use client'

import { useState } from 'react'
import { ArrowUpRight, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  medicationSchema,
  allergySchema,
  medicationUsageLabels,
  MAX_MEDICATIONS,
  MAX_ALLERGIES,
  type MedicationEntry,
  type AllergyEntry,
} from '@/lib/records/health-list'
import { WorkspaceDialog } from './WorkspaceDialog'
import type { usePersonalWorkspace } from './usePersonalWorkspace'
import styles from './HealthLists.module.css'
import { formatDate } from '@/lib/records/selectors'

type Editor = (
  { kind: 'medication'; entry?: MedicationEntry } | { kind: 'allergy'; entry?: AllergyEntry }
) & { revision: number; remove?: boolean }

function HealthListEditor({
  editor,
  workspace,
  onClose,
}: {
  editor: Editor
  workspace: ReturnType<typeof usePersonalWorkspace>
  onClose: () => void
}) {
  const { state, send, revision, busy, status, canRetry, retry, error } = workspace
  const [validationError, setValidationError] = useState('')
  const isMedication = editor.kind === 'medication'
  const title = isMedication ? 'medication' : 'allergy concern'
  const stale = editor.revision !== revision
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || stale) return
    if (editor.remove && editor.entry) {
      if (
        await send({
          type: isMedication ? 'remove-medication' : 'remove-allergy',
          id: editor.entry.id,
          confirmation: 'DELETE',
        })
      )
        onClose()
      return
    }
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    const input = { ...fields, sourceId: fields.sourceId || null }
    if (editor.kind === 'medication') {
      const parsed = medicationSchema.safeParse(input)
      if (!parsed.success) {
        setValidationError('Enter a medication name and check the field lengths.')
        return
      }
      setValidationError('')
      if (await send({ type: 'save-medication', id: editor.entry?.id, medication: parsed.data }))
        onClose()
    } else {
      const parsed = allergySchema.safeParse(input)
      if (!parsed.success) {
        setValidationError('Enter a substance or medicine and check the field lengths.')
        return
      }
      setValidationError('')
      if (await send({ type: 'save-allergy', id: editor.entry?.id, allergy: parsed.data }))
        onClose()
    }
  }
  return (
    <WorkspaceDialog
      open
      onClose={() => {
        if (status !== 'saving') onClose()
      }}
      title={`${editor.remove ? 'Delete' : editor.entry ? 'Edit' : 'Add'} ${title}`}
      description={
        editor.remove
          ? 'Deleting this entry also revokes shared brief links that include it.'
          : 'Keep your own account of this information for discussion with your clinician.'
      }
    >
      <form className="account-form" onSubmit={save}>
        {editor.remove ? (
          <p>{editor.kind === 'medication' ? editor.entry?.name : editor.entry?.substance}</p>
        ) : (
          <fieldset disabled={busy || stale} className={styles.fields}>
            {editor.kind === 'medication' ? (
              <>
                <label>
                  Medication name
                  <input name="name" required maxLength={120} defaultValue={editor.entry?.name} />
                </label>
                <label>
                  Directions as written (optional)
                  <textarea
                    name="directions"
                    rows={3}
                    maxLength={500}
                    defaultValue={editor.entry?.directions}
                  />
                </label>
                <label>
                  How are you using it?
                  <select name="usage" defaultValue={editor.entry?.usage ?? 'unsure'}>
                    <option value="unsure">Unsure</option>
                    <option value="taking">Taking</option>
                    <option value="not-taking">Not taking</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  Substance or medicine
                  <input
                    name="substance"
                    required
                    maxLength={120}
                    defaultValue={editor.entry?.substance}
                  />
                </label>
                <label>
                  Reaction (optional)
                  <textarea
                    name="reaction"
                    maxLength={500}
                    rows={3}
                    defaultValue={editor.entry?.reaction}
                  />
                </label>
              </>
            )}
            <label>
              Linked record (optional)
              <select name="sourceId" defaultValue={editor.entry?.sourceId ?? ''}>
                <option value="">No linked record</option>
                {state.records.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.source.label}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        )}
        {(error || validationError || stale) && (
          <p className="form-error" role="alert">
            {stale
              ? 'This workspace changed while the form was open. Close and reopen it to review the saved entry.'
              : validationError || error}
          </p>
        )}
        <div className="import-footer">
          <button
            className="button button-outline"
            type="button"
            disabled={status === 'saving'}
            onClick={onClose}
          >
            {stale || canRetry ? 'Close' : 'Cancel'}
          </button>
          {canRetry ? (
            <button
              className="button button-primary"
              type="button"
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
              {editor.remove ? 'Delete' : 'Save'} {title}
            </button>
          )}
        </div>
      </form>
    </WorkspaceDialog>
  )
}

export function HealthLists({
  workspace,
  onSource,
}: {
  workspace: ReturnType<typeof usePersonalWorkspace>
  onSource: (id: string) => void
}) {
  const [editor, setEditor] = useState<Editor>()
  const { state, revision, busy } = workspace
  function sourceLink(id: string | null) {
    const source = state.records.find((r) => r.id === id)
    return (
      source && (
        <button
          className="text-link"
          aria-label={`Open linked record: ${source.source.label}`}
          onClick={() => onSource(source.id)}
        >
          {source.source.label} <ArrowUpRight size={13} />
        </button>
      )
    )
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Medications & allergies</h1>
          <p>Your own list to review and bring to your next conversation.</p>
        </div>
      </div>
      <div className={styles.lists}>
        <section className={styles.panel} aria-label="Your medications">
          <div className={styles.heading}>
            <h2>Medications</h2>
            <button
              className="button button-primary"
              disabled={busy || state.medications.length >= MAX_MEDICATIONS}
              onClick={() => setEditor({ kind: 'medication', revision })}
            >
              <Plus size={15} /> Add medication
            </button>
          </div>
          {!state.medications.length && (
            <p className={styles.empty}>
              No medications entered yet. You can add a name, directions as written, and how you’re
              using it.
            </p>
          )}
          {state.medications.length >= MAX_MEDICATIONS && (
            <p className={styles.note}>Your list holds up to {MAX_MEDICATIONS} medications.</p>
          )}
          {state.medications.map((m) => (
            <article key={m.id} className={styles.entry} aria-label={`Medication: ${m.name}`}>
              <div className={styles.identity}>
                <h3>{m.name}</h3>
                <span>{medicationUsageLabels[m.usage]}</span>
              </div>
              <small>
                Patient-reported · Last updated{' '}
                <time dateTime={m.updatedAt}>{formatDate(m.updatedAt.slice(0, 10))}</time>
              </small>
              <p className={styles.verbatim}>{m.directions || 'Directions not entered.'}</p>
              {sourceLink(m.sourceId)}
              <div className={styles.actions}>
                <button
                  className="text-link"
                  disabled={busy}
                  aria-label={`Edit medication: ${m.name}`}
                  onClick={() => setEditor({ kind: 'medication', entry: m, revision })}
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  className="text-link"
                  disabled={busy}
                  aria-label={`Delete medication: ${m.name}`}
                  onClick={() =>
                    setEditor({ kind: 'medication', entry: m, revision, remove: true })
                  }
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </article>
          ))}
        </section>
        <section className={styles.panel} aria-label="Your allergy concerns">
          <div className={styles.heading}>
            <h2>Allergy concerns</h2>
            <button
              className="button button-primary"
              disabled={busy || state.allergies.length >= MAX_ALLERGIES}
              onClick={() => setEditor({ kind: 'allergy', revision })}
            >
              <Plus size={15} /> Add allergy concern
            </button>
          </div>
          {!state.allergies.length && (
            <p className={styles.empty}>
              No allergy concerns entered yet. Record something you want your clinician to review.
            </p>
          )}
          {state.allergies.length >= MAX_ALLERGIES && (
            <p className={styles.note}>Your list holds up to {MAX_ALLERGIES} allergy concerns.</p>
          )}
          {state.allergies.map((a) => (
            <article
              key={a.id}
              className={styles.entry}
              aria-label={`Allergy concern: ${a.substance}`}
            >
              <div className={styles.identity}>
                <h3>{a.substance}</h3>
              </div>
              <small>
                Patient-reported · Last updated{' '}
                <time dateTime={a.updatedAt}>{formatDate(a.updatedAt.slice(0, 10))}</time>
              </small>
              <p className={styles.verbatim}>{a.reaction || 'Reaction not entered.'}</p>
              {sourceLink(a.sourceId)}
              <div className={styles.actions}>
                <button
                  className="text-link"
                  disabled={busy}
                  aria-label={`Edit allergy concern: ${a.substance}`}
                  onClick={() => setEditor({ kind: 'allergy', entry: a, revision })}
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  className="text-link"
                  disabled={busy}
                  aria-label={`Delete allergy concern: ${a.substance}`}
                  onClick={() => setEditor({ kind: 'allergy', entry: a, revision, remove: true })}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
      {editor && (
        <HealthListEditor
          editor={editor}
          workspace={workspace}
          onClose={() => setEditor(undefined)}
        />
      )}
    </>
  )
}
