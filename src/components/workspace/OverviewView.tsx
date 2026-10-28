'use client'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  FlaskConical,
  Link2,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react'
import { demoPatient } from '@/lib/records/fixtures'
import { compareMetric, formatDate, observationSeries } from '@/lib/records/selectors'
import { metricLabels, type HealthRecord, type Metric } from '@/lib/records/types'
import type { DemoSession } from '@/lib/records/demo-session'
import { TrendChart } from './TrendChart'
import { RecordTimeline } from './RecordTimeline'

interface OverviewProps {
  allRecords: HealthRecord[]
  records: HealthRecord[]
  session: DemoSession
  metric: Metric
  setMetric: (metric: Metric) => void
  since: string
  setSince: (date: string) => void
  navigate: (view: 'overview' | 'timeline' | 'records' | 'visit') => void
  openSource: (id: string, line?: number) => void
  setReviewOpen: (open: boolean) => void
  isFlagged: boolean
}
export function OverviewView({
  allRecords,
  records,
  session,
  metric,
  setMetric,
  since,
  setSince,
  navigate,
  openSource,
  setReviewOpen,
  isFlagged,
}: OverviewProps) {
  const comparison = compareMetric(allRecords, metric, since)
  const measurements = observationSeries(allRecords, metric)
  const latestMeasurement = measurements[measurements.length - 1]
  return (
    <>
      <div className="overview-grid">
        <section className="story-card">
          <div className="story-card-top">
            <span className="eyebrow">THE THREAD BETWEEN YOUR VISITS</span>
            <span className="story-seal">
              <Link2 size={17} />
            </span>
          </div>
          <h2>
            Small details.
            <br />
            <em>A more complete picture.</em>
          </h2>
          <p>
            Your records are connected. Start with what changed, then follow the evidence behind it.
          </p>
          <button onClick={() => navigate('timeline')} className="story-link">
            Explore your health timeline <ArrowRight size={17} />
          </button>
          <div className="story-orbit" aria-hidden="true">
            <div />
            <div />
            <div />
            <span className="orbit-dot one" />
            <span className="orbit-dot two" />
            <span className="orbit-dot three" />
          </div>
          <div className="story-stats">
            <div>
              <strong>{allRecords.length.toString().padStart(2, '0')}</strong>
              <span>connected records</span>
            </div>
            <div>
              <strong>03</strong>
              <span>care providers</span>
            </div>
            <div>
              <strong>01</strong>
              <span>detail to reconcile</span>
            </div>
          </div>
        </section>
        <section className="next-visit-card">
          <div className="section-kicker">
            <span className="calendar-tile">
              <small>NOV</small>02
            </span>
            <span className="pill neutral">Next chapter</span>
          </div>
          <h2>A more prepared you.</h2>
          <p>
            Your sample follow-up with <strong>{demoPatient.clinician}</strong>
          </p>
          <div className="visit-location">
            {demoPatient.clinic}
            <span>Monday · 10:30 AM IST · Sample appointment</span>
          </div>
          <div className="visit-prep-count">
            <span className="stacked-icons">
              <FileText size={14} />
              <MessageSquareText size={14} />
            </span>
            {session.questions.length
              ? `${session.questions.length} questions in your brief`
              : 'A few good questions go a long way.'}
          </div>
          <button className="button button-light full-width" onClick={() => navigate('visit')}>
            Prepare for your visit <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <div className="section-heading">
        <div>
          <h2>Between then and now</h2>
          <p>Changes in the record, with the context attached.</p>
        </div>
        <label className="select-label">
          Compare from{' '}
          <select
            value={since}
            onChange={(event) => setSince(event.target.value)}
            aria-label="Comparison baseline"
          >
            <option value="2026-04-22">22 Apr 2026</option>
            <option value="2026-01-20">20 Jan 2026</option>
          </select>
        </label>
      </div>
      <div className="insight-grid">
        <section className="panel trend-panel">
          <div className="panel-heading">
            <div className="metric-tabs" role="group" aria-label="Measurement">
              {(['hba1c', 'ldl', 'systolic'] as Metric[]).map((item) => (
                <button
                  key={item}
                  aria-pressed={metric === item}
                  className={metric === item ? 'selected' : ''}
                  onClick={() => setMetric(item)}
                >
                  {item === 'systolic' ? 'Blood pressure' : metricLabels[item]}
                </button>
              ))}
            </div>
            <FlaskConical size={17} className="muted-icon" />
          </div>
          <div className="metric-summary">
            {comparison ? (
              <>
                <strong>
                  {comparison.latest.value}
                  <span>{comparison.latest.unit}</span>
                </strong>
                <span className="metric-change">
                  <ArrowDownRight size={15} />
                  {Math.abs(comparison.delta)}
                  {metric === 'hba1c' ? ' percentage points' : ` ${comparison.latest.unit}`}{' '}
                  {comparison.delta < 0 ? 'lower' : 'higher'}
                  <small>vs. {formatDate(comparison.baseline.date, true)}</small>
                </span>
              </>
            ) : (
              <>
                <strong>
                  {latestMeasurement?.value ?? '—'}
                  <span>{latestMeasurement?.unit}</span>
                </strong>
                <span className="muted">No newer comparable measurement</span>
              </>
            )}
          </div>
          <TrendChart records={allRecords} metric={metric} onSource={openSource} />
        </section>
        <section className="review-card">
          <div className="review-heading">
            <span className="review-symbol">
              <Link2 size={18} />
            </span>
            <span className="pill amber">Needs a conversation</span>
          </div>
          <h2>
            One detail.
            <br /> Two different stories.
          </h2>
          <p>
            Your January note mentions a penicillin allergy. An August intake says no known drug
            allergies.
          </p>
          <div className="conflict-mini">
            <span>
              20 JAN <strong>Penicillin allergy</strong>
            </span>
            <span>
              12 AUG <strong>No known allergies</strong>
            </span>
          </div>
          <p className="review-footnote">
            Both records are kept. Your care team can help reconcile them.
          </p>
          <button onClick={() => setReviewOpen(true)} className="button button-outline full-width">
            Compare the evidence <ArrowUpRight size={16} />
          </button>
          {isFlagged && (
            <span className="flagged-note">
              <Check size={13} /> Added to your visit brief
            </span>
          )}
        </section>
      </div>
      <div className="bottom-grid">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <h2>The latest in your story</h2>
            <button className="text-link" onClick={() => navigate('timeline')}>
              Full timeline <ArrowRight size={14} />
            </button>
          </div>
          <RecordTimeline records={records.slice(0, 3)} onSource={openSource} compact />
        </section>
        <section className="principle-card">
          <span className="principle-icon">
            <ShieldCheck size={26} strokeWidth={1.3} />
          </span>
          <span className="eyebrow">CLARITY COMES WITH CONTEXT</span>
          <h2>
            Not just a number.
            <br /> The story behind it.
          </h2>
          <p>
            Each observation takes you back to its source. Missing information stays visible.
            Differences stay open until they are understood.
          </p>
          <button className="text-link" onClick={() => openSource('lab-oct', 3)}>
            Try following a source <ArrowUpRight size={14} />
          </button>
        </section>
      </div>
    </>
  )
}
