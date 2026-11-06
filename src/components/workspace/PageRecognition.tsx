'use client'

import { useEffect, useRef, useState } from 'react'
import { ScanText } from 'lucide-react'
import { recognizedReading } from '@/lib/records/recognized-reading'
import type { RecognizedLine, DocumentReading } from '@/lib/records/documents'
import { metricLabels, type Metric } from '@/lib/records/types'

type Source = HTMLCanvasElement | HTMLImageElement
type Result = { type: 'result'; text: string; lines: RecognizedLine[] }
type Message = Result | { type: 'progress'; percent: number } | { type: 'error' }
type Job = { worker?: Worker; timeout?: number }

async function pageImage(source: Source) {
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  if (!width || !height) throw new Error('Page unavailable')
  const scale = Math.min(1, 2800 / Math.max(width, height), Math.sqrt(4_000_000 / (width * height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  context.fillStyle = 'white'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const image = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Page unavailable'))
    }, 'image/png'),
  )
  return { image, width: canvas.width, height: canvas.height }
}

function release(job: Job | null) {
  if (!job) return
  window.clearTimeout(job.timeout)
  job.worker?.terminate()
}

export function PageRecognition({
  page,
  source,
  usedMetrics,
  busy,
  onUse,
}: {
  page: number
  source: () => Source | null
  usedMetrics: Metric[]
  busy: boolean
  onUse: (reading: DocumentReading) => void
}) {
  const active = useRef<Job | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<number>()
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result>()
  useEffect(
    () => () => {
      release(active.current)
      active.current = null
    },
    [],
  )

  function stop() {
    release(active.current)
    active.current = null
    setRunning(false)
  }
  async function read() {
    const surface = source()
    if (!surface || active.current) return
    const job: Job = {}
    active.current = job
    setRunning(true)
    setProgress(undefined)
    setError('')
    setResult(undefined)
    function fail(message: string) {
      if (active.current !== job) return
      stop()
      setError(message)
    }
    const unavailable =
      'Text recognition could not finish. Try again or enter a reading from the page.'
    job.timeout = window.setTimeout(
      () => fail('Recognition timed out. Try a clearer scan or enter a reading manually.'),
      90000,
    )
    try {
      const snapshot = await pageImage(surface)
      if (active.current !== job) return
      const worker = new Worker('/recognize-page.js')
      job.worker = worker
      worker.onerror = (event) => {
        event.preventDefault()
        fail(unavailable)
      }
      worker.onmessageerror = () => fail(unavailable)
      worker.onmessage = ({ data }: MessageEvent<Message>) => {
        if (active.current !== job) return
        if (data.type === 'progress') setProgress(data.percent)
        else if (data.type === 'result') {
          stop()
          setResult(data)
        } else fail(unavailable)
      }
      worker.postMessage(snapshot)
    } catch {
      fail(unavailable)
    }
  }
  const candidates =
    result?.lines.flatMap((line) => {
      const reading = recognizedReading(line, page)
      return reading ? [reading] : []
    }) ?? []

  return (
    <section className="page-recognition" aria-label="Text recognition">
      {!result && !running && (
        <button type="button" className="button button-outline" onClick={read}>
          <ScanText size={16} /> Read text on this page
        </button>
      )}
      {!result && !running && (
        <p className="small-note">English print · processed on your device</p>
      )}
      {running && (
        <>
          <span role="status">
            {progress === undefined ? 'Loading the English reader…' : 'Reading page ' + page + '…'}
          </span>
          <progress aria-label="Text recognition progress" value={progress} max={100} />
          <button type="button" className="text-link" onClick={stop}>
            Cancel recognition
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {result && (
        <>
          <p role="status">
            {result.text
              ? 'Recognized text on page ' + page + '.'
              : 'No printed text found. Try a clearer scan or enter the reading manually.'}
          </p>
          {result.text && (
            <details className="document-page-text" open={candidates.length === 0}>
              <summary>Recognized text</summary>
              <p tabIndex={0}>{result.text}</p>
            </details>
          )}
          {!!candidates.length && (
            <p className="small-note">
              Choose a draft, then check the highlighted line, units, and column headings on the
              original.
            </p>
          )}
          {candidates.map((reading, index) => (
            <button
              key={index}
              type="button"
              className="button button-outline recognition-candidate"
              disabled={busy || usedMetrics.includes(reading.metric)}
              onClick={() => onUse(reading)}
            >
              {usedMetrics.includes(reading.metric) ? 'Already in form' : 'Use draft'} ·{' '}
              {metricLabels[reading.metric]} {reading.value} {reading.unit}
            </button>
          ))}
        </>
      )}
    </section>
  )
}
