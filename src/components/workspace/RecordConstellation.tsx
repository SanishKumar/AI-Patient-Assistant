'use client'

import { ArrowUpRight, FileText, FlaskConical, Pill, ScanLine } from 'lucide-react'
import type { HealthRecord } from '@/lib/records/types'
import { formatDate } from '@/lib/records/selectors'

const positions = [
  { x: 22, y: 16 },
  { x: 66, y: 10 },
  { x: 86, y: 48 },
  { x: 69, y: 83 },
  { x: 26, y: 87 },
  { x: 13, y: 51 },
  { x: 49, y: 54 },
]
const icons = { lab: FlaskConical, visit: FileText, prescription: Pill }

export function RecordConstellation({
  records,
  onSource,
}: {
  records: HealthRecord[]
  onSource: (id: string) => void
}) {
  const ordered = [...records].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  return (
    <div
      className="constellation"
      role="group"
      aria-label="Source record map, ordered by visit date"
    >
      <div className="constellation-canvas">
        <svg viewBox="0 0 500 280" preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx="250" cy="140" rx="172" ry="100" className="map-orbit" />
          {ordered.slice(1).map((record, i) => (
            <path
              key={record.id}
              d={`M${positions[i].x * 5},${positions[i].y * 2.8} Q250,140 ${positions[i + 1].x * 5},${positions[i + 1].y * 2.8}`}
              className="map-connection"
            />
          ))}
        </svg>
        <div className={`map-core ${records.length > 6 ? 'with-import' : ''}`} aria-hidden="true">
          <ScanLine size={24} strokeWidth={1.3} />
          <strong>{records.length.toString().padStart(2, '0')}</strong>
          <span>source records</span>
        </div>
        {ordered.map((record, i) => {
          const Icon = icons[record.kind]
          return (
            <button
              key={record.id}
              className={`map-node ${record.kind} ${i === 5 ? 'latest' : ''}`}
              style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%` }}
              onClick={() => onSource(record.id)}
              aria-label={`Open ${record.title}, ${formatDate(record.occurredAt, true)}`}
            >
              <span className="map-node-icon">
                <Icon size={16} />
              </span>
              <span>
                <small>{formatDate(record.occurredAt, true)}</small>
                <strong>
                  {record.kind === 'lab'
                    ? 'Lab report'
                    : record.kind === 'visit'
                      ? 'Visit note'
                      : 'Prescription'}
                </strong>
              </span>
              <ArrowUpRight size={12} className="map-node-arrow" />
            </button>
          )
        })}
      </div>
      <p>
        <span /> Select a source to look closer{' '}
        <span className="map-caption-detail">Lines follow record dates</span>
      </p>
    </div>
  )
}
