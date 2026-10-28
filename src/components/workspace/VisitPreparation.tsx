'use client'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Download,
  History,
  Link2,
  MessageSquareText,
  Plus,
  Trash2,
} from 'lucide-react'
import type { Dispatch } from 'react'
import { demoPatient, suggestedQuestions } from '@/lib/records/fixtures'
import { compareMetric } from '@/lib/records/selectors'
import { metricLabels, type HealthRecord, type Metric } from '@/lib/records/types'
import type { DemoSession, SessionAction } from '@/lib/records/demo-session'
interface VisitProps {
  allRecords: HealthRecord[]
  session: DemoSession
  since: string
  question: string
  setQuestion: (text: string) => void
  addQuestion: (text: string, sourceIds?: string[]) => void
  dispatch: Dispatch<SessionAction>
  exportBrief: () => void
  openSource: (id: string, line?: number) => void
  setReviewOpen: (open: boolean) => void
}
export function VisitPreparation({
  allRecords,
  session,
  since,
  question,
  setQuestion,
  addQuestion,
  dispatch,
  exportBrief,
  openSource,
  setReviewOpen,
}: VisitProps) {
  return (
    <div className="visit-grid">
      <section className="panel brief-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">MONDAY, 2 NOVEMBER · SAMPLE VISIT</span>
            <h2>A better conversation starts here.</h2>
          </div>
          <span className="pill neutral">Draft</span>
        </div>
        <p className="brief-intro">
          A preparation brief for {demoPatient.clinician}. It is yours to shape, and still needs
          your clinician&apos;s interpretation.
        </p>
        <div className="brief-section">
          <h3>
            <History size={16} /> What changed in the record
          </h3>
          {(['hba1c', 'ldl', 'systolic'] as Metric[]).map((item) => {
            const change = compareMetric(allRecords, item, since)
            return (
              change && (
                <div className="brief-change" key={item}>
                  <span>{metricLabels[item]}</span>
                  <strong>
                    {change.baseline.value} <ArrowRight size={14} /> {change.latest.value}{' '}
                    {change.latest.unit}
                  </strong>
                  <button
                    className="text-link"
                    onClick={() => openSource(change.latest.recordId, change.latest.line)}
                  >
                    Source <ArrowUpRight size={13} />
                  </button>
                </div>
              )
            )
          })}
          <p className="small-note">
            These changes do not establish a treatment effect. Medication use and clinical context
            need confirmation.
          </p>
        </div>
        <div className="brief-section">
          <h3>
            <MessageSquareText size={16} /> Your questions{' '}
            <span className="count-badge">{session.questions.length}</span>
          </h3>
          {!session.questions.length && (
            <p className="empty-questions">
              Start with a suggested question, or write your own fictional question below.
            </p>
          )}
          <ol className="question-list">
            {session.questions.map((item) => (
              <li key={item.id}>
                <div>
                  {item.text}
                  {item.sourceIds.length > 0 && (
                    <div className="question-sources">
                      {item.sourceIds.map((id) => (
                        <button key={id} onClick={() => openSource(id)}>
                          <Link2 size={11} />
                          {allRecords.find((record) => record.id === id)?.source.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="icon-button"
                  onClick={() => dispatch({ type: 'remove-question', id: item.id })}
                  aria-label={`Remove question: ${item.text}`}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ol>
          <form
            className="question-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (question.trim()) {
                addQuestion(question)
                setQuestion('')
              }
            }}
          >
            <label htmlFor="visit-question">Add a question to this fictional scenario</label>
            <textarea
              id="visit-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={240}
              placeholder="What would you like to discuss? Please use fictional details."
              rows={3}
            />
            <div>
              <span>{question.length}/240</span>
              <button
                className="button button-primary"
                disabled={!question.trim() || session.questions.length >= 20}
              >
                <Plus size={15} /> Add question
              </button>
            </div>
          </form>
        </div>
        <button className="button button-primary" onClick={exportBrief}>
          <Download size={16} /> Export visit brief
        </button>
        <p className="export-note">
          Text file · includes source references and unresolved questions
        </p>
      </section>
      <aside className="visit-aside">
        <section className="suggestion-card">
          <span className="eyebrow">A PLACE TO START</span>
          <h2>
            Good questions,
            <br />
            grounded in your record.
          </h2>
          {suggestedQuestions.map((item) => {
            const added = session.questions.some((q) => q.text === item.text)
            return (
              <button
                key={item.text}
                onClick={() => addQuestion(item.text, item.sourceIds)}
                disabled={added}
              >
                <span>{item.text}</span>
                {added ? <Check size={17} /> : <Plus size={17} />}
              </button>
            )
          })}
        </section>
        <section className="open-question-card">
          <span className="pill amber">Still open</span>
          <h3>The allergy history needs reconciliation.</h3>
          <p>Reviewing evidence or adding a question does not resolve a clinical disagreement.</p>
          <button className="text-link" onClick={() => setReviewOpen(true)}>
            See both records <ArrowUpRight size={14} />
          </button>
        </section>
      </aside>
    </div>
  )
}
