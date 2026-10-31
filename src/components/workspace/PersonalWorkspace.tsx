'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Download,
  FilePlus2,
  FileText,
  History,
  LayoutGrid,
  ListChecks,
  LockKeyhole,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import type { WorkspaceSnapshot } from '@/lib/records/workspace'
import { noteSchema, visitSchema } from '@/lib/records/workspace'
import { formatDate, observationSeries, recordsAsOf, searchRecords } from '@/lib/records/selectors'
import { personalBrief } from '@/lib/records/personal-brief'
import { type Metric, metricLabels } from '@/lib/records/types'
import { usePersonalWorkspace } from './usePersonalWorkspace'
import { RecordImportDialog } from './RecordImportDialog'
import { DocumentUploadDialog } from './DocumentUploadDialog'
import { DocumentSourceDialog } from './DocumentSourceDialog'
import { SourceViewer } from './SourceViewer'
import { RecordTimeline } from './RecordTimeline'
import { TrendChart } from './TrendChart'
import { WorkspaceDialog } from './WorkspaceDialog'
import { AccountDialog } from './AccountDialog'
import { downloadText } from './downloads'

const tabs = [
  { id: 'overview', name: 'Overview', icon: LayoutGrid },
  { id: 'records', name: 'Record library', icon: FileText },
  { id: 'timeline', name: 'Health timeline', icon: History },
  { id: 'visit', name: 'Visit preparation', icon: ListChecks },
] as const

export function PersonalWorkspace({
  viewer,
  saved,
  local,
}: {
  viewer: { id: string; name: string; email: string }
  saved: WorkspaceSnapshot
  local: boolean
}) {
  const { state, status, error, send, upload, retry, busy, canRetry } = usePersonalWorkspace(
    saved,
    viewer.id,
  )
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('overview')
  const [accountOpen, setAccountOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteError, setNoteError] = useState('')
  const [source, setSource] = useState<{ id: string; line?: number }>()
  const [deleteId, setDeleteId] = useState<string>()
  const [query, setQuery] = useState('')
  const [metric, setMetric] = useState<Metric>('hba1c')
  const [question, setQuestion] = useState('')
  const [questionSource, setQuestionSource] = useState('')
  const [visitEditing, setVisitEditing] = useState(false)
  const [visitError, setVisitError] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [asOf, setAsOf] = useState(today)
  const sorted = recordsAsOf(state.records, today)
  const series = observationSeries(state.records, metric)
  const latest = series.at(-1)
  const openSource = (id: string, line?: number) => setSource({ id, line })
  const selectedRecord = state.records.find((r) => r.id === source?.id)
  const firstDate =
    [...state.records].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0]?.occurredAt ??
    today
  const [since, setSince] = useState('')

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (busy) event.preventDefault()
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [busy])
  // Clear the rendered vault if another tab switches or ends this account's session.
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const response = await fetch('/api/auth/get-session', { cache: 'no-store' })
        if (response.ok && (await response.json())?.user?.id !== viewer.id)
          window.location.replace('/login')
      } catch {
        /* Offline access is limited to the current in-memory view. */
      }
    }
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [viewer.id])

  async function saveNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = noteSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)))
    if (!result.success) {
      setNoteError('Add a title, a valid date, and up to 4,000 characters of notes.')
      return
    }
    setNoteError('')
    if (await send({ type: 'note', note: result.data })) setNoteOpen(false)
  }
  async function saveVisit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = visitSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)))
    if (!result.success) {
      setVisitError('Check your visit date, time, and field lengths.')
      return
    }
    setVisitError('')
    if (await send({ type: 'visit', visit: result.data })) setVisitEditing(false)
  }

  return (
    <div className="personal-app">
      <a className="skip-link" href="#workspace-main">
        Skip to content
      </a>
      <header className="product-header">
        <Link href="/workspace" className="brand" aria-label="Aether Health home">
          <span className="brand-symbol">
            a<span />
          </span>
          <span>
            aether<small>H E A L T H</small>
          </span>
        </Link>
        <div className="product-header-right">
          <span className="workspace-owner">{viewer.name}</span>
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => setAccountOpen(true)}
          >
            <LockKeyhole size={15} /> My account
          </button>
        </div>
      </header>
      <nav className="personal-nav" aria-label="Workspace navigation">
        {tabs.map((item) => (
          <button
            key={item.id}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={17} />
            {item.name}
            {item.id === 'records' && <span>{state.records.length}</span>}
          </button>
        ))}
      </nav>
      <main id="workspace-main" className="personal-main" tabIndex={-1}>
        {local && (
          <p className="local-development-note">
            Local development · email verification is disabled. Use test data until your server is
            configured for public accounts.
          </p>
        )}
        <div className={`save-status ${status}`} role="status">
          <span>
            {status === 'saving'
              ? 'Saving changes…'
              : status === 'error'
                ? error
                : 'Saved to your account'}
          </span>
          {canRetry && <button onClick={() => void retry()}>Retry save</button>}
          {status === 'error' && !canRetry && (
            <button onClick={() => window.location.reload()}>Reload</button>
          )}
        </div>
        {tab === 'overview' && (
          <>
            <section className="personal-welcome">
              <div>
                <span className="eyebrow">A SPACE THAT STARTS WITH YOU</span>
                <h1>
                  Your story.
                  <br />
                  <em>All in one place.</em>
                </h1>
                <p>
                  {state.records.length
                    ? `${viewer.name.split(' ')[0]}, your records and questions are here whenever you need them.`
                    : 'Start with one record or one thought. Build a picture you can bring to your next conversation.'}
                </p>
                <div className="welcome-actions">
                  <button
                    className="button button-light"
                    disabled={busy}
                    onClick={() => setUploadOpen(true)}
                  >
                    <FilePlus2 size={17} /> Upload a document
                  </button>
                  <button
                    className="welcome-secondary"
                    disabled={busy}
                    onClick={() => setImportOpen(true)}
                  >
                    <Plus size={17} /> Import a record
                  </button>
                  <button
                    className="welcome-secondary"
                    disabled={busy}
                    onClick={() => setNoteOpen(true)}
                  >
                    Write a journal entry <ArrowUpRight size={17} />
                  </button>
                </div>
              </div>
              <div className="personal-orbit" aria-hidden="true">
                <span className="orbit-center">{viewer.name.slice(0, 1).toUpperCase()}</span>
                <span className="orbit-token one">
                  <FileText size={23} />
                </span>
                <span className="orbit-token two">
                  <History size={23} />
                </span>
                <span className="orbit-token three">
                  <ListChecks size={23} />
                </span>
                <div className="orbit-caption">
                  A little more clarity.
                  <br />
                  Every time you return.
                </div>
              </div>
            </section>
            <div className="personal-stats">
              <div>
                <strong>{state.records.length}</strong>
                <span>records in your space</span>
              </div>
              <div>
                <strong>{state.questions.length}</strong>
                <span>questions for your visit</span>
              </div>
              <div>
                <strong>{state.records.filter((r) => r.source.personalNote).length}</strong>
                <span>journal entries</span>
              </div>
            </div>
            <div className="personal-two-column">
              <section className="panel trend-panel">
                <div className="panel-heading">
                  <h2>Numbers, with context.</h2>
                  <select
                    aria-label="Measurement"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as Metric)}
                  >
                    {(['hba1c', 'ldl', 'systolic'] as Metric[]).map((m) => (
                      <option key={m} value={m}>
                        {metricLabels[m]}
                      </option>
                    ))}
                  </select>
                </div>
                {latest ? (
                  <>
                    <div className="metric-summary">
                      <strong>
                        {latest.value}
                        <span>{latest.unit}</span>
                      </strong>
                      <span className="muted">
                        {formatDate(latest.date, true)} · from your report
                      </span>
                    </div>
                    <TrendChart records={state.records} metric={metric} onSource={openSource} />
                  </>
                ) : (
                  <div className="personal-empty">
                    <FilePlus2 size={32} />
                    <h3>No {metricLabels[metric]} readings yet.</h3>
                    <p>
                      Upload a report and enter a reading beside its source page, or import a
                      supported lab CSV.
                    </p>
                  </div>
                )}
              </section>
              <section className="personal-visit-card">
                <span className="eyebrow">YOUR NEXT CONVERSATION</span>
                <CalendarDays size={30} />
                <h2>
                  {state.visit.date ? formatDate(state.visit.date) : 'A better visit begins here.'}
                </h2>
                <p>
                  {state.visit.clinician ||
                    'Gather the details you want to discuss. Your visit plan and questions stay together.'}
                </p>
                {state.visit.location && <p>{state.visit.location}</p>}
                <button className="button button-light" onClick={() => setTab('visit')}>
                  Prepare for your visit <ArrowRight size={16} />
                </button>
                <small>Personal preparation · no appointment is booked</small>
              </section>
            </div>
            {!!sorted.length && (
              <section className="panel recent-panel">
                <div className="panel-heading">
                  <h2>Recently in your story</h2>
                  <button className="text-link" onClick={() => setTab('records')}>
                    All records <ArrowRight size={15} />
                  </button>
                </div>
                <RecordTimeline records={sorted.slice(0, 3)} onSource={openSource} compact />
              </section>
            )}
          </>
        )}
        {(tab === 'records' || tab === 'timeline') && (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR OWN RECORD</span>
                <h1>{tab === 'records' ? 'A home for every detail.' : 'Your story, over time.'}</h1>
                <p>
                  {tab === 'records'
                    ? 'Original reports and your own notes, with their origins intact.'
                    : 'See the records available as of a particular day.'}
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => setUploadOpen(true)}
                >
                  <FilePlus2 size={16} /> Upload a document
                </button>
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => setNoteOpen(true)}
                >
                  Write a journal entry
                </button>
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => setImportOpen(true)}
                >
                  <Plus size={16} /> Import a record
                </button>
              </div>
            </div>
            {tab === 'timeline' ? (
              <>
                <label className="personal-date">
                  Show records available on
                  <input
                    type="date"
                    aria-label="Timeline date"
                    value={asOf}
                    max={today}
                    onChange={(e) => setAsOf(e.target.value || today)}
                  />
                </label>
                <section className="panel recent-panel">
                  {recordsAsOf(state.records, asOf).length ? (
                    <RecordTimeline
                      records={recordsAsOf(state.records, asOf)}
                      onSource={openSource}
                    />
                  ) : (
                    <div className="personal-empty">
                      <History size={32} />
                      <h2>No records available on this day.</h2>
                      <p>A report appears after both its event date and its import date.</p>
                    </div>
                  )}
                </section>
              </>
            ) : (
              <>
                <label className="search-field">
                  <Search size={18} />
                  <input
                    aria-label="Search your records"
                    placeholder="Search titles, providers, or source text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <section className="panel personal-library">
                  {searchRecords(sorted, query).map((record) => (
                    <article key={record.id} className="personal-record-row">
                      <button
                        className="personal-record-open"
                        onClick={() => openSource(record.id)}
                      >
                        <span className="record-type-icon">
                          <FileText size={21} />
                        </span>
                        <span>
                          <strong>{record.source.label}</strong>
                          <small>
                            {formatDate(record.occurredAt, true)} · {record.provider} ·{' '}
                            {record.source.personalNote ? 'Self-reported' : 'Unreviewed import'}
                          </small>
                        </span>
                        <ArrowUpRight size={18} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`Delete record: ${record.source.label}`}
                        onClick={() => setDeleteId(record.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </article>
                  ))}
                  {!searchRecords(sorted, query).length && (
                    <div className="personal-empty">
                      <FilePlus2 size={32} />
                      <h2>{query ? 'No matching records.' : 'Your first record belongs here.'}</h2>
                      <p>
                        {query
                          ? 'Try a different word from your source.'
                          : 'Import a lab report or write down something you want to remember.'}
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
        {tab === 'visit' && (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">PREPARATION, IN YOUR WORDS</span>
                <h1>Make the next visit count.</h1>
                <p>A plan, a few good questions, and the sources behind them.</p>
              </div>
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() =>
                  downloadText(
                    personalBrief(state, viewer.name, since || firstDate),
                    'aether-visit-brief.txt',
                  )
                }
              >
                <Download size={16} /> Export visit brief
              </button>
            </div>
            <div className="personal-two-column visit-columns">
              <section className="panel personal-form-panel">
                <div className="panel-heading">
                  <h2>Your visit plan</h2>
                  <span className="pill neutral">Your notes · not a booking</span>
                </div>
                {visitEditing ? (
                  <form className="account-form" onSubmit={saveVisit}>
                    <div className="form-pair">
                      <label>
                        Visit date
                        <input type="date" name="date" defaultValue={state.visit.date} />
                      </label>
                      <label>
                        Time at the visit location
                        <input type="time" name="time" defaultValue={state.visit.time} />
                      </label>
                    </div>
                    <label>
                      Clinician or clinic
                      <input
                        name="clinician"
                        maxLength={100}
                        defaultValue={state.visit.clinician}
                      />
                    </label>
                    <label>
                      Location
                      <input name="location" maxLength={160} defaultValue={state.visit.location} />
                    </label>
                    <label>
                      What brings you in?
                      <textarea
                        name="reason"
                        rows={3}
                        maxLength={500}
                        defaultValue={state.visit.reason}
                      />
                    </label>
                    {visitError && (
                      <p role="alert" className="form-error">
                        {visitError}
                      </p>
                    )}
                    <div className="import-footer">
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={busy}
                        onClick={() => setVisitEditing(false)}
                      >
                        Cancel
                      </button>
                      <button className="button button-primary" disabled={busy}>
                        Save visit details
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="visit-plan-summary">
                    <h3>
                      {state.visit.date ? formatDate(state.visit.date) : 'No visit date set'}
                      {state.visit.time && ` · ${state.visit.time}`}
                    </h3>
                    <p>{state.visit.clinician || 'Clinician not added'}</p>
                    {state.visit.location && <p>{state.visit.location}</p>}
                    {state.visit.reason && <blockquote>{state.visit.reason}</blockquote>}
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => setVisitEditing(true)}
                    >
                      Edit visit details
                    </button>
                  </div>
                )}
                <label className="personal-date">
                  Compare measurements from
                  <input
                    type="date"
                    aria-label="Brief comparison baseline"
                    value={since || firstDate}
                    max={today}
                    onChange={(e) => setSince(e.target.value)}
                  />
                </label>
                <p className="small-note">
                  Your exported brief includes comparable changes, source references, questions, and
                  journal entries. Imported information is not clinically verified.
                </p>
              </section>
              <section className="panel personal-form-panel">
                <div className="panel-heading">
                  <h2>Your questions</h2>
                  <span className="count-badge">{state.questions.length}/20</span>
                </div>
                <ol className="question-list">
                  {state.questions.map((q) => (
                    <li key={q.id}>
                      <div>
                        {q.text}
                        {q.sourceIds.map((id) => (
                          <button key={id} className="text-link" onClick={() => openSource(id)}>
                            {state.records.find((r) => r.id === id)?.source.label}{' '}
                            <ArrowUpRight size={13} />
                          </button>
                        ))}
                      </div>
                      <button
                        className="icon-button"
                        disabled={busy}
                        onClick={() => void send({ type: 'remove-question', id: q.id })}
                        aria-label={`Remove question: ${q.text}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ol>
                {!state.questions.length && (
                  <p className="empty-questions">
                    What would help you leave your next visit feeling clearer?
                  </p>
                )}
                <form
                  className="account-form"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (
                      await send({
                        type: 'question',
                        text: question,
                        sourceIds: questionSource ? [questionSource] : [],
                      })
                    ) {
                      setQuestion('')
                      setQuestionSource('')
                    }
                  }}
                >
                  <label>
                    Add a question
                    <textarea
                      aria-label="Add a question"
                      value={question}
                      maxLength={240}
                      required
                      rows={3}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="What would you like to discuss?"
                    />
                  </label>
                  <label>
                    Link a source (optional)
                    <select
                      value={questionSource}
                      onChange={(e) => setQuestionSource(e.target.value)}
                    >
                      <option value="">No source</option>
                      {state.records.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.source.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button button-primary"
                    disabled={busy || !question.trim() || state.questions.length >= 20}
                  >
                    <Plus size={15} /> Add question
                  </button>
                </form>
              </section>
            </div>
          </>
        )}
        <footer className="personal-footer">
          <span>
            <LockKeyhole size={13} /> Records organization and visit preparation
          </span>
          <Link href="/privacy">Data & privacy</Link>
          <Link href="/demo">Explore the demo</Link>
        </footer>
      </main>
      <RecordImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        records={state.records}
        synthetic={false}
        onImport={(record) => {
          void send({
            type: 'import-file',
            name: record.source.label,
            content: record.source.importedCsv!.text,
            belongsToMe: true,
          })
        }}
      />
      {uploadOpen && (
        <DocumentUploadDialog
          onClose={() => {
            if (status !== 'saving') setUploadOpen(false)
          }}
          onUpload={upload}
          used={state.records.reduce((total, r) => total + (r.source.document?.byteLength ?? 0), 0)}
          busy={busy}
          error={error}
          canRetry={canRetry}
          retry={retry}
        />
      )}
      {selectedRecord?.source.document ? (
        <DocumentSourceDialog
          key={`${selectedRecord.id}:${source?.line ?? 0}`}
          record={selectedRecord}
          line={source?.line}
          owner={viewer.id}
          onClose={() => setSource(undefined)}
          send={send}
          busy={busy}
          error={error}
          canRetry={canRetry}
          retry={retry}
        />
      ) : (
        <SourceViewer
          record={selectedRecord}
          line={source?.line}
          onClose={() => setSource(undefined)}
          synthetic={false}
        />
      )}
      <AccountDialog
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        viewer={viewer}
        onErase={() => send({ type: 'erase', confirmation: 'DELETE' })}
      />
      <WorkspaceDialog
        open={noteOpen}
        onClose={() => {
          if (status !== 'saving') setNoteOpen(false)
        }}
        title="A thought worth keeping."
        description="Your own observations, in your own words. Saved as a personal journal entry."
      >
        <form className="account-form" onSubmit={saveNote}>
          <label>
            Entry title
            <input
              name="title"
              required
              maxLength={120}
              placeholder="What would you like to remember?"
            />
          </label>
          <label>
            Entry date
            <input name="date" type="date" defaultValue={today} max={today} required />
          </label>
          <label>
            Your notes
            <textarea
              name="text"
              required
              maxLength={4000}
              rows={7}
              placeholder="Write what you noticed or want to discuss."
            />
          </label>
          <p className="small-note">
            Journal entries are self-reported. They do not become diagnoses, prescriptions, or
            measured lab values.
          </p>
          {(noteError || error) && (
            <p className="form-error" role="alert">
              {noteError || error}
            </p>
          )}
          {canRetry && (
            <button
              type="button"
              className="text-link"
              onClick={async () => {
                if (await retry()) setNoteOpen(false)
              }}
            >
              Retry save
            </button>
          )}
          <button className="button button-primary" disabled={busy}>
            <Check size={16} /> Save journal entry
          </button>
        </form>
      </WorkspaceDialog>
      <WorkspaceDialog
        open={!!deleteId}
        onClose={() => {
          if (status !== 'saving') setDeleteId(undefined)
        }}
        title="Remove this record?"
        description="This removes the record and its links from your questions. Your question text stays."
      >
        <p>{state.records.find((r) => r.id === deleteId)?.source.label}</p>
        <div className="import-footer">
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => setDeleteId(undefined)}
          >
            Keep record
          </button>
          <button
            className="button button-danger"
            disabled={busy}
            onClick={async () => {
              if (
                deleteId &&
                (await send({ type: 'remove-record', id: deleteId, confirmation: 'DELETE' }))
              )
                setDeleteId(undefined)
            }}
          >
            Delete record
          </button>
        </div>
      </WorkspaceDialog>
    </div>
  )
}
