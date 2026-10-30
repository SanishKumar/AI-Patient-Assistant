'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  History,
  LayoutGrid,
  Link2,
  ListChecks,
  LockKeyhole,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { demoPatient, sampleImport, suggestedQuestions } from '@/lib/records/fixtures'
import {
  buildVisitBrief,
  findConflicts,
  formatDate,
  recordsAsOf,
  searchRecords,
} from '@/lib/records/selectors'
import { workspaceRecords } from '@/lib/records/demo-session'
import { type HealthRecord, type Metric } from '@/lib/records/types'
import { SourceViewer } from './SourceViewer'
import { OverviewView } from './OverviewView'
import { VisitPreparation } from './VisitPreparation'
import { RecordTimeline, recordIcons } from './RecordTimeline'
import { WorkspaceDialog } from './WorkspaceDialog'
import { useWorkspaceState } from './useWorkspaceState'
import { RecordImportDialog } from './RecordImportDialog'

type View = 'overview' | 'timeline' | 'records' | 'visit'
const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'timeline', label: 'Health timeline', icon: History },
  { id: 'records', label: 'Record library', icon: FileText },
  { id: 'visit', label: 'Visit preparation', icon: ListChecks },
] as const

export function HealthWorkspace() {
  const [view, setView] = useState<View>('overview')
  const { session, dispatch, storageWarning } = useWorkspaceState()
  const [source, setSource] = useState<{ id: string; line?: number }>()
  const [metric, setMetric] = useState<Metric>('hba1c')
  const [since, setSince] = useState('2026-04-22')
  const [asOf, setAsOf] = useState('latest')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [fileImportOpen, setFileImportOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [notice, setNotice] = useState('')
  const allRecords = workspaceRecords(session)
  const latestDate = allRecords.reduce(
    (date, record) => (record.recordedAt > date ? record.recordedAt : date),
    demoPatient.referenceDate,
  )
  const snapshotDate = asOf === 'latest' ? latestDate : asOf
  const records = recordsAsOf(allRecords, view === 'timeline' ? snapshotDate : latestDate)
  const conflicts = findConflicts(allRecords)
  const sourceRecord = allRecords.find((record) => record.id === source?.id)
  const isFlagged = session.reviews.some((event) => event.action === 'flagged-for-visit')
  const reviewed = session.reviews.some((event) => event.action === 'evidence-reviewed')

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setSearchOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  function navigate(next: View) {
    setView(next)
    setMenuOpen(false)
    setQuery('')
    setFilter('all')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function openSource(id: string, line?: number) {
    setSource({ id, line })
  }
  function addQuestion(text: string, sourceIds: string[] = []) {
    if (session.questions.some((item) => item.text === text.trim())) {
      setNotice('This question is already in your visit brief.')
      return
    }
    if (session.questions.length >= 20) {
      setNotice('Your brief has 20 questions. Remove one before adding another.')
      return
    }
    dispatch({ type: 'question', question: { id: crypto.randomUUID(), text, sourceIds } })
    setNotice('Question added to your visit brief.')
  }
  function flagForVisit() {
    dispatch({
      type: 'review',
      event: {
        id: crypto.randomUUID(),
        conflictId: 'allergy-history',
        action: 'flagged-for-visit',
        at: new Date().toISOString(),
      },
    })
    addQuestion(suggestedQuestions[0].text, suggestedQuestions[0].sourceIds)
  }
  function exportBrief() {
    const blob = new Blob([buildVisitBrief(allRecords, session.questions, since)], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'aether-synthetic-visit-brief.txt'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Visit brief exported with source references.')
  }

  return (
    <div className="health-app">
      <a className="skip-link" href="#workspace-main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <Link href="/" className="brand" aria-label="Aether Health home">
          <span className="brand-symbol">
            a<span />
          </span>
          <span>
            aether<small>H E A L T H</small>
          </span>
        </Link>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <div className="patient-switch">
          <span className="avatar-monogram">AR</span>
          <span>
            Ananya Rao<small>Synthetic profile</small>
          </span>
          <span className="small-dot" />
        </div>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === 'records' && <span className="nav-count">{allRecords.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="sidebar-note-icon">
            <Link2 size={19} />
          </span>
          <h3>Every detail has a story.</h3>
          <p>Follow any record back to its source. Know what is known.</p>
          <button onClick={() => setAboutOpen(true)}>
            Meet your workspace <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setAboutOpen(true)}>
            <CircleHelp size={17} /> About this preview
          </button>
          <div className="privacy-caption">
            <LockKeyhole size={13} /> Fictional data. Real possibilities.
          </div>
          <div className="sidebar-account">
            <span className="avatar-monogram small">AR</span>
            <span>
              Your space to explore
              <small>Interactive preview</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="workspace-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>My workspace</span>
            <ChevronRight size={13} />
            <strong>{navigation.find((item) => item.id === view)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="Search records"
            >
              <Search size={16} />
              <span>Find in your records</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="demo-badge">
              <span /> SYNTHETIC DEMO
            </span>
            <Link className="account-trigger" href="/login">
              Create my workspace
            </Link>
          </div>
        </header>
        <main id="workspace-main" className="workspace-main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === 'overview'
                  ? 'YOUR HEALTH, IN PERSPECTIVE'
                  : 'YOUR CONNECTED HEALTH RECORD'}
              </div>
              <h1>
                {view === 'overview'
                  ? 'Your health. More connected.'
                  : view === 'timeline'
                    ? 'Your story, over time.'
                    : view === 'records'
                      ? 'A home for every record.'
                      : 'Make the next visit count.'}
              </h1>
              <p>
                {view === 'overview'
                  ? 'A little more clarity. A better conversation with your care team.'
                  : view === 'timeline'
                    ? 'See what happened, and what was known at the time.'
                    : view === 'records'
                      ? 'Original sources, clear origins, and nothing lost between visits.'
                      : 'Bring the important changes, open questions, and their evidence.'}
              </p>
            </div>
            <div className="heading-actions">
              <button className="button button-outline" onClick={() => setImportOpen(true)}>
                <Plus size={17} /> Add sample record
              </button>
              <button className="button button-primary" onClick={() => setFileImportOpen(true)}>
                <Plus size={17} /> Import a record
              </button>
            </div>
          </div>
          <div className="patient-context">
            <span className="context-avatar">AR</span>
            <div>
              <strong>{demoPatient.name}</strong>
              <span>
                {demoPatient.age} years · {demoPatient.location} · Fictional patient
              </span>
            </div>
            <div className="context-divider" />
            <div className="context-detail">
              <span>RECORD WINDOW</span>
              <strong>{allRecords.length} source records</strong>
            </div>
            <div className="context-status">
              <ShieldCheck size={16} />
              <span>Source-linked records</span>
            </div>
            <span className="context-date">As of {formatDate(latestDate, true)}</span>
          </div>

          {view === 'overview' && (
            <OverviewView
              allRecords={allRecords}
              records={records}
              session={session}
              metric={metric}
              setMetric={setMetric}
              since={since}
              setSince={setSince}
              navigate={navigate}
              openSource={openSource}
              setReviewOpen={setReviewOpen}
              isFlagged={isFlagged}
            />
          )}

          {view === 'timeline' && (
            <section className="panel timeline-panel">
              <div className="section-heading">
                <div>
                  <h2>What the record knew</h2>
                  <p>Late arrivals appear only after the date they were added.</p>
                </div>
                <label className="select-label">
                  View as of{' '}
                  <select
                    value={asOf}
                    onChange={(event) => setAsOf(event.target.value)}
                    aria-label="Historical snapshot"
                  >
                    <option value="latest">{formatDate(latestDate, true)} · latest</option>
                    <option value="2026-10-28">28 Oct 2026</option>
                    <option value="2026-09-03">3 Sep 2026</option>
                    <option value="2026-08-31">31 Aug 2026</option>
                    <option value="2026-04-22">22 Apr 2026</option>
                    <option value="2026-01-20">20 Jan 2026</option>
                  </select>
                </label>
              </div>
              <div className="snapshot-strip">
                <History size={17} />
                <span>
                  <strong>{records.length} records</strong> available by {formatDate(snapshotDate)}.{' '}
                  {findConflicts(records).length
                    ? 'An allergy disagreement is visible in this snapshot.'
                    : 'No allergy disagreement was yet visible in this snapshot.'}
                </span>
              </div>
              <RecordTimeline records={records} onSource={openSource} />
            </section>
          )}

          {view === 'records' && (
            <section className="panel library-panel">
              <div className="library-toolbar">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search notes, results, or providers"
                    aria-label="Search record library"
                  />
                  {query && (
                    <button
                      className="icon-button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                <div className="filter-tabs" role="group" aria-label="Record type">
                  {['all', 'lab', 'visit', 'prescription'].map((kind) => (
                    <button
                      className={filter === kind ? 'selected' : ''}
                      key={kind}
                      onClick={() => setFilter(kind)}
                      aria-pressed={filter === kind}
                    >
                      {kind === 'all'
                        ? 'All records'
                        : kind === 'lab'
                          ? 'Lab reports'
                          : kind === 'visit'
                            ? 'Visits'
                            : 'Medications'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="record-list">
                {searchRecords(records, query)
                  .filter((record) => filter === 'all' || record.kind === filter)
                  .map((record) => (
                    <RecordRow
                      key={record.id}
                      record={record}
                      onClick={() => openSource(record.id)}
                    />
                  ))}
              </div>
              {!searchRecords(records, query).filter(
                (record) => filter === 'all' || record.kind === filter,
              ).length && (
                <div className="empty-state">
                  <Search size={24} />
                  <h3>No records match this search.</h3>
                  <p>Try a provider name, a result, or a different record type.</p>
                  <button
                    className="button button-outline"
                    onClick={() => {
                      setQuery('')
                      setFilter('all')
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </section>
          )}

          {view === 'visit' && (
            <VisitPreparation
              allRecords={allRecords}
              session={session}
              since={since}
              question={question}
              setQuestion={setQuestion}
              addQuestion={addQuestion}
              dispatch={dispatch}
              exportBrief={exportBrief}
              openSource={openSource}
              setReviewOpen={setReviewOpen}
            />
          )}

          <footer className="workspace-footer">
            <span>
              <span className="footer-mark">a</span> A little more connected. A little more clear.
            </span>
            <span>
              Synthetic preview ·{' '}
              {storageWarning
                ? 'Storage unavailable; changes last until reload'
                : 'Changes stay in this browser tab'}
              <button onClick={() => setAboutOpen(true)}>
                About this demo <ArrowUpRight size={12} />
              </button>
            </span>
          </footer>
        </main>
      </div>
      <div className={`notice ${notice ? 'visible' : ''}`} role="status" aria-live="polite">
        {notice && (
          <>
            <CheckCheck size={17} />
            {notice}
          </>
        )}
      </div>
      <RecordImportDialog
        open={fileImportOpen}
        onClose={() => setFileImportOpen(false)}
        records={allRecords}
        onImport={(record) => {
          dispatch({ type: 'import-file', record })
          setNotice('Report added with its original source.')
          setAsOf('latest')
        }}
      />

      <WorkspaceDialog
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Your workspace"
        description="Choose where to explore next."
      >
        <nav className="mobile-navigation" aria-label="Mobile workspace navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === 'records' && <span className="nav-count">{allRecords.length}</span>}
            </button>
          ))}
        </nav>
      </WorkspaceDialog>
      <SourceViewer
        record={sourceRecord}
        line={source?.line}
        onClose={() => setSource(undefined)}
      />
      <WorkspaceDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Find the detail that matters"
        description="Search the actual text in your fictional records. No generated medical answers."
      >
        <label className="search-field dialog-search">
          <Search size={19} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try HbA1c, penicillin, or metformin"
            aria-label="Search all records"
          />
        </label>
        <div className="search-results">
          {searchRecords(recordsAsOf(allRecords, demoPatient.referenceDate), query).map(
            (record) => (
              <RecordRow
                key={record.id}
                record={record}
                onClick={() => {
                  setSearchOpen(false)
                  openSource(record.id)
                }}
              />
            ),
          )}
          {!searchRecords(allRecords, query).length && (
            <div className="empty-state">No matching source. Try a different word.</div>
          )}
        </div>
      </WorkspaceDialog>
      <WorkspaceDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="One more piece of the picture"
        description="Add a prewritten, fictional source to explore the record workflow. Real document uploads are not enabled."
      >
        <div className="import-preview">
          <span className="file-tile">
            <FileText size={25} />
          </span>
          <div>
            <h3>Vitals note · 26 Oct 2026</h3>
            <p>Fern Family Clinic · Fictional source</p>
          </div>
          <span className="pill amber">Unreviewed</span>
        </div>
        <blockquote className="import-excerpt">{sampleImport.source.lines[2]}</blockquote>
        <div className="import-checks">
          <p>
            <Check size={15} /> Original wording and source date stay attached.
          </p>
          <p>
            <Check size={15} /> The new reading appears in your timeline and comparison.
          </p>
          <p>
            <Clock3 size={15} /> Source review remains pending after import.
          </p>
        </div>
        <button
          className="button button-primary full-width"
          disabled={session.imported}
          onClick={() => {
            dispatch({ type: 'import' })
            setImportOpen(false)
            setNotice('Sample record added. Its source review is still pending.')
          }}
        >
          {session.imported ? (
            <>
              <Check size={16} /> Sample already added
            </>
          ) : (
            <>
              <Plus size={16} /> Add to the sample workspace
            </>
          )}
        </button>
      </WorkspaceDialog>
      <WorkspaceDialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Hold both stories up to the light"
        description="An unresolved disagreement in the source records. The original entries remain unchanged."
        wide
      >
        <div className="conflict-sources">
          {conflicts[0].recordIds.map((id) => {
            const record = allRecords.find((item) => item.id === id)!
            return (
              <article key={id}>
                <span className="eyebrow">{formatDate(record.occurredAt).toUpperCase()}</span>
                <h3>{record.provider}</h3>
                <blockquote>{record.source.lines[record.allergy!.line - 1]}</blockquote>
                <button className="text-link" onClick={() => openSource(id, record.allergy!.line)}>
                  Open original source <ArrowUpRight size={14} />
                </button>
              </article>
            )
          })}
        </div>
        <div className="review-boundary">
          <ShieldCheck size={19} />
          <p>
            Neither entry overrides the other. A qualified clinician needs to confirm the allergy
            history; this demo cannot sign or resolve it.
          </p>
        </div>
        <div className="review-actions">
          <button className="button button-primary" disabled={isFlagged} onClick={flagForVisit}>
            {isFlagged ? <Check size={16} /> : <Plus size={16} />}
            {isFlagged ? 'Flagged for your visit' : 'Add to visit questions'}
          </button>
          <button
            className="button button-outline"
            disabled={reviewed}
            onClick={() => {
              dispatch({
                type: 'review',
                event: {
                  id: crypto.randomUUID(),
                  conflictId: 'allergy-history',
                  action: 'evidence-reviewed',
                  at: new Date().toISOString(),
                },
              })
              setNotice('Evidence marked as read. The allergy disagreement remains open.')
            }}
          >
            {reviewed ? 'Evidence read · still unresolved' : 'Mark evidence as read'}
          </button>
        </div>
        {session.reviews.length > 0 && (
          <div className="review-history">
            <h4>Demo activity</h4>
            {session.reviews.map((event) => (
              <p key={event.id}>
                <Check size={12} />
                {event.action === 'flagged-for-visit'
                  ? 'Question flagged for the next visit'
                  : 'Source evidence marked as read'}
                <span>
                  Local demo action ·{' '}
                  {new Date(event.at).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Kolkata',
                  })}{' '}
                  IST
                </span>
              </p>
            ))}
          </div>
        )}
      </WorkspaceDialog>
      <WorkspaceDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="A clearer kind of health workspace"
        description="AETHER connects records, the changes between them, and the evidence behind every detail."
      >
        <div className="about-content">
          <p>
            This interactive preview uses deliberately fictional people, providers, reports, and
            appointments. Source verification is part of the sample scenario.
          </p>
          <p>
            You can search source text, compare measurements, move through historical snapshots,
            inspect disagreements, and export a preparation brief. Nothing here diagnoses,
            prescribes, signs a clinical note, or sends data to a model.
          </p>
          <p>
            Demo changes stay in this browser tab and never enter your personal account. Use
            fictional information only; this preview is not ready for real patient records or
            clinical use.
          </p>
          <button
            className="button button-outline"
            onClick={() => {
              dispatch({ type: 'reset' })
              setAboutOpen(false)
              setAsOf('latest')
              setNotice('The fictional workspace has been reset.')
            }}
          >
            Reset sample workspace
          </button>
        </div>
      </WorkspaceDialog>
    </div>
  )
}

function RecordRow({ record, onClick }: { record: HealthRecord; onClick: () => void }) {
  const Icon = recordIcons[record.kind]
  return (
    <button className="record-row" onClick={onClick}>
      <span className={`record-type-icon ${record.kind}`}>
        <Icon size={19} />
      </span>
      <span className="record-row-title">
        <strong>{record.source.label}</strong>
        <small>{record.provider}</small>
      </span>
      <span className={`record-status ${record.status}`}>
        {record.status === 'verified' ? <Check size={13} /> : <Clock3 size={13} />}
        <span>{record.status === 'verified' ? 'Sample verified' : 'Unreviewed'}</span>
      </span>
      <ArrowUpRight size={17} />
    </button>
  )
}
