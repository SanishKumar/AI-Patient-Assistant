'use client'

import { Check, FileText, Link2, Clock3 } from 'lucide-react'
import type { HealthRecord } from '@/lib/records/types'
import { formatDate } from '@/lib/records/selectors'
import { WorkspaceDialog } from './WorkspaceDialog'
import { downloadText } from './downloads'

export function SourceViewer({
  record,
  line,
  onClose,
}: {
  record?: HealthRecord
  line?: number
  onClose: () => void
}) {
  return (
    <WorkspaceDialog
      open={!!record}
      onClose={onClose}
      title="Follow the evidence"
      description="The original fictional source and the facts recorded from it, together."
      wide
    >
      {record && (
        <div className="source-layout">
          <article className="source-paper">
            <div className="paper-brand">
              <span className="paper-icon">
                <FileText size={22} />
              </span>
              <span>
                {record.provider}
                <small>Fictional source document</small>
              </span>
            </div>
            <h3>{record.source.label}</h3>
            <div className="source-lines">
              {record.source.lines.map((text, index) => (
                <p key={index} className={index + 1 === line ? 'highlighted' : ''}>
                  <span className="line-number" aria-label={`Line ${index + 1}`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{text}</span>
                </p>
              ))}
            </div>
            <div className="paper-footer">
              SYNTHETIC RECORD <span>{record.id}</span>
            </div>
          </article>
          <aside className="source-details">
            <span className="eyebrow">EVIDENCE DETAILS</span>
            <h3>A fact with a footprint.</h3>
            <p>
              Source text is preserved. Reviewing a record never silently replaces its original
              contents.
            </p>
            <dl>
              <dt>Event date</dt>
              <dd>{formatDate(record.occurredAt)}</dd>
              <dt>Added to workspace</dt>
              <dd>{formatDate(record.recordedAt)}</dd>
              <dt>Recorded by</dt>
              <dd>{record.author}</dd>
              <dt>Source status</dt>
              <dd className={`status-text ${record.status}`}>
                {record.status === 'verified' ? <Check size={14} /> : <Clock3 size={14} />}
                {record.status === 'verified'
                  ? 'Verified in sample data'
                  : 'Awaiting source review'}
              </dd>
              <dt>Method</dt>
              <dd>
                {record.source.importedCsv
                  ? 'CSV import · original text preserved'
                  : 'Bundled synthetic example'}
              </dd>
              <dt>Evidence anchor</dt>
              <dd>
                <Link2 size={14} />
                {record.id}
                {line ? ` · line ${line}` : ''}
              </dd>
            </dl>
            {record.source.importedCsv && (
              <div className="source-integrity">
                <h4>File fingerprint · SHA-256</h4>
                <code>{record.source.importedCsv.sha256}</code>
                <p>
                  This identifies the imported contents. It does not verify their accuracy or
                  origin.
                </p>
                <button
                  className="text-link"
                  onClick={() =>
                    downloadText(
                      record.source.importedCsv!.text,
                      record.source.label,
                      'text/csv;charset=utf-8',
                    )
                  }
                >
                  Download original CSV
                </button>
              </div>
            )}
            <div className="small-note">
              Verification here is part of the fictional scenario. It is not a real clinician
              signature.
            </div>
          </aside>
        </div>
      )}
    </WorkspaceDialog>
  )
}
