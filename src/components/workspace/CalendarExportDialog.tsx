'use client'

import { useState } from 'react'
import { CalendarDays, Download } from 'lucide-react'
import type { PersonalWorkspace } from '@/lib/records/workspace'
import { calendarFile } from '@/lib/records/calendar'
import { calendarChoices, selectedCalendarEntries } from '@/lib/records/calendar-export'
import { formatDate } from '@/lib/records/selectors'
import { WorkspaceDialog } from './WorkspaceDialog'
import { downloadText } from './downloads'
import styles from './CalendarExportDialog.module.css'

export function CalendarExportDialog({
  workspace,
  owner,
  onClose,
}: {
  workspace: PersonalWorkspace
  owner: string
  onClose: () => void
}) {
  const choices = calendarChoices(workspace)
  const [selected, setSelected] = useState(() =>
    choices.filter((c) => c.kind === 'visit').map((c) => c.id),
  )
  const [details, setDetails] = useState(false)
  const [reminder, setReminder] = useState(false)
  const [error, setError] = useState('')
  const entries = selectedCalendarEntries(choices, selected, owner, details)
  const undated = workspace.visitHistory
    .flatMap((v) => v.steps)
    .filter((s) => !s.completedAt && !s.due).length
  function toggle(id: string, checked: boolean) {
    setSelected(checked ? [...selected, id] : selected.filter((value) => value !== id))
  }
  function download() {
    try {
      downloadText(
        calendarFile(entries, { reminder }),
        'aether-calendar.ics',
        'text/calendar;charset=utf-8',
      )
      setError('')
    } catch {
      setError('A selected date could not be exported. Check the saved dates and try again.')
    }
  }
  return (
    <WorkspaceDialog
      open
      wide
      onClose={onClose}
      title="Calendar dates"
      description="Choose dates to take to your calendar. Each entry covers its whole day."
    >
      <div className={styles.layout}>
        <div className={styles.choices}>
          <fieldset>
            <legend>Visit plan</legend>
            {choices
              .filter((c) => c.kind === 'visit')
              .map((item) => (
                <label className={styles.choice} key={item.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(e) => toggle(item.id, e.target.checked)}
                  />
                  <span>
                    {item.label}
                    <small>
                      {formatDate(item.date)}
                      {item.context && ` · ${item.context}`}
                    </small>
                  </span>
                </label>
              ))}
            {!workspace.visit.date && (
              <p>Add a date in Visit preparation to include your next visit.</p>
            )}
          </fieldset>
          <fieldset>
            <legend>Open follow-up steps</legend>
            <div className={styles.steps}>
              {choices
                .filter((c) => c.kind === 'step')
                .map((item) => (
                  <label className={styles.choice} key={item.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={(e) => toggle(item.id, e.target.checked)}
                    />
                    <span>
                      {item.label}
                      <small>
                        {formatDate(item.date)}
                        {item.context && ` · ${item.context}`}
                      </small>
                    </span>
                  </label>
                ))}
            </div>
            {!choices.some((c) => c.kind === 'step') && <p>No open steps with due dates.</p>}
            {!!undated && (
              <p>
                {undated} {undated === 1 ? 'open step needs' : 'open steps need'} a due date before
                calendar export.
              </p>
            )}
          </fieldset>
        </div>
        <div className={styles.preview}>
          <article aria-label="Calendar preview" className={styles.paper} tabIndex={0}>
            <h3>In your calendar</h3>
            {entries.length ? (
              entries.map((entry) => (
                <div className={styles.event} key={entry.id}>
                  <CalendarDays size={22} aria-hidden="true" />
                  <div>
                    <strong>{entry.title}</strong>
                    <p>{formatDate(entry.date)}</p>
                    {entry.description && <p className={styles.detail}>{entry.description}</p>}
                    {entry.location && <p>{entry.location}</p>}
                    {reminder && <small>Requested reminder at 9am the day before</small>}
                  </div>
                </div>
              ))
            ) : (
              <p>Select a visit or follow-up date to preview it here.</p>
            )}
          </article>
          <div className={styles.options}>
            <label className={styles.choice}>
              <input
                type="checkbox"
                aria-label="Include names and details"
                checked={details}
                onChange={(e) => setDetails(e.target.checked)}
              />
              <span>
                Include names and details
                <small>
                  Your calendar provider and people with calendar access may see these details.
                </small>
              </span>
            </label>
            <label className={styles.choice}>
              <input
                type="checkbox"
                checked={reminder}
                onChange={(e) => setReminder(e.target.checked)}
              />
              <span>Request a reminder at 9am the day before</span>
            </label>
          </div>
          <p className={styles.help}>
            Import the file into your calendar and review its notification settings. Update calendar
            copies when plans or steps change in Aether.
          </p>
          <button className="button button-primary" disabled={!entries.length} onClick={download}>
            <Download size={16} /> Download calendar file
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </WorkspaceDialog>
  )
}
