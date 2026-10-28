'use client'

import { ArrowUpRight, FileText, FlaskConical, Stethoscope, Pill, Check } from 'lucide-react'
import { formatDate } from '@/lib/records/selectors'
import type { HealthRecord } from '@/lib/records/types'

export const recordIcons = { lab: FlaskConical, visit: Stethoscope, prescription: Pill }

export function RecordTimeline({
  records,
  onSource,
  compact = false,
}: {
  records: HealthRecord[]
  onSource: (id: string) => void
  compact?: boolean
}) {
  return (
    <ol className={`record-timeline ${compact ? 'timeline-compact' : ''}`}>
      {records.map((record) => {
        const Icon = recordIcons[record.kind]
        return (
          <li key={record.id}>
            <span className={`timeline-icon ${record.kind}`}>
              <Icon size={17} />
            </span>
            <div className="timeline-item">
              <div className="timeline-meta">
                <time dateTime={record.occurredAt}>{formatDate(record.occurredAt, true)}</time>
                <span>·</span>
                <span>{record.provider}</span>
              </div>
              <button className="timeline-title" onClick={() => onSource(record.id)}>
                {record.title}
                <ArrowUpRight size={15} />
              </button>
              {!compact && <p>{record.summary}</p>}
              <div className="timeline-tags">
                {record.observations.map((observation) => (
                  <span key={observation.metric}>
                    {observation.label}{' '}
                    <strong>
                      {observation.value} {observation.unit}
                    </strong>
                  </span>
                ))}
                {record.allergy && (
                  <span className="allergy-tag">
                    {record.allergy.assertion === 'present'
                      ? 'Penicillin allergy reported'
                      : 'No known allergies recorded'}
                  </span>
                )}
                {record.medication && (
                  <span>
                    {record.medication.name}
                    <small>Historical entry</small>
                  </span>
                )}
              </div>
              {!compact && (
                <div className="timeline-footer">
                  <span>
                    {record.status === 'verified' ? <Check size={12} /> : <FileText size={12} />}
                    {record.status === 'verified'
                      ? 'Source verified in sample'
                      : 'Needs source review'}
                  </span>
                  <span>Added {formatDate(record.recordedAt, true)}</span>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
