'use client'

import { useId } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { formatDate, observationSeries } from '@/lib/records/selectors'
import { metricLabels, type HealthRecord, type Metric } from '@/lib/records/types'

export function TrendChart({
  records,
  metric,
  onSource,
}: {
  records: HealthRecord[]
  metric: Metric
  onSource: (id: string, line?: number) => void
}) {
  const gradientId = useId().replace(/:/g, '')
  const allPoints = observationSeries(records, metric)
  const latest = allPoints.at(-1)
  const compatible = allPoints.filter(
    (point) => point.unit === latest?.unit && point.method === latest?.method,
  )
  const points = compatible.slice(-6)
  if (!points.length)
    return <div className="empty-state">No measurements were available in this snapshot.</div>
  const values = points.map((p) => p.value)
  const padding = metric === 'hba1c' ? 0.5 : 10
  const min = Math.min(...values) - padding
  const max = Math.max(...values) + padding
  const start = new Date(points[0].date).getTime()
  const duration = new Date(points[points.length - 1].date).getTime() - start || 1
  const xy = points.map((p) => ({
    x: points.length === 1 ? 340 : 55 + ((new Date(p.date).getTime() - start) / duration) * 555,
    y: 170 - ((p.value - min) / (max - min)) * 125,
  }))
  const path = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
  return (
    <div className="trend-chart">
      <svg
        viewBox="0 0 670 225"
        role="img"
        aria-label={`${metricLabels[metric]} recorded values: ${points.map((p) => `${p.value} ${p.unit} on ${formatDate(p.date, true)}`).join(', ')}. Open a measurement below for its source.`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a278c1" stopOpacity=".18" />
            <stop offset="100%" stopColor="#a278c1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[45, 105, 170].map((y, i) => (
          <g key={y}>
            <line x1="55" x2="625" y1={y} y2={y} stroke="#e7dced" strokeDasharray="3 5" />
            <text x="5" y={y + 4}>
              {(max - (i * (max - min)) / 2).toFixed(metric === 'hba1c' ? 1 : 0)}
            </text>
          </g>
        ))}
        {points.length > 1 && (
          <path
            d={`${path} L${xy[xy.length - 1].x},185 L${xy[0].x},185 Z`}
            fill={`url(#${gradientId})`}
          />
        )}
        <path d={path} fill="none" stroke="#895ca6" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={point.recordId}>
            <circle cx={xy[index].x} cy={xy[index].y} r="8" fill="#f1e3fa" />
            <circle
              cx={xy[index].x}
              cy={xy[index].y}
              r="4"
              fill="#80509d"
              stroke="#fff"
              strokeWidth="1.5"
            />
            <text className="chart-value" x={xy[index].x} y={xy[index].y - 19} textAnchor="middle">
              {point.value}
            </text>
            <text x={xy[index].x} y="213" textAnchor="middle">
              {formatDate(point.date, true)}
            </text>
          </g>
        ))}
      </svg>
      <div className="measurement-links">
        {allPoints.map((point) => (
          <button key={point.recordId} onClick={() => onSource(point.recordId, point.line)}>
            <span>
              {point.value} {point.unit}
              <small>
                {formatDate(point.date, true)}
                {point.status === 'unreviewed' ? ' · unreviewed' : ''}
              </small>
            </span>
            <ArrowUpRight size={13} />
          </button>
        ))}
      </div>
      <p className="chart-caption">
        {points.length < allPoints.length && (
          <>
            Chart: latest {points.length} readings in {latest?.unit}, using {latest?.method}. All
            readings are linked above.{' '}
          </>
        )}
        Recorded values, not a forecast. Lines connect available measurements; gaps contain no
        inferred data.
      </p>
    </div>
  )
}
