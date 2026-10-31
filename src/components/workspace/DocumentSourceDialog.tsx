'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Plus, Trash2 } from 'lucide-react'
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist'
import { documentReviewSchema, formatBytes, type DocumentReading } from '@/lib/records/documents'
import { metricLabels, type HealthRecord, type Metric } from '@/lib/records/types'
import type { WorkspaceCommand } from '@/lib/records/workspace'
import { WorkspaceDialog } from './WorkspaceDialog'

const units: Record<Metric, DocumentReading['unit'][]> = {
  hba1c: ['%', 'mmol/mol'],
  ldl: ['mg/dL', 'mmol/L'],
  systolic: ['mmHg'],
}
type Draft = Omit<DocumentReading, 'value'> & { value: string }

export function DocumentSourceDialog({
  record,
  line,
  owner,
  onClose,
  send,
  busy,
  error,
  canRetry,
  retry,
}: {
  record: HealthRecord
  line?: number
  owner: string
  onClose: () => void
  send: (command: WorkspaceCommand) => Promise<boolean>
  busy: boolean
  error: string
  canRetry: boolean
  retry: () => Promise<boolean>
}) {
  const info = record.source.document!
  const [page, setPage] = useState(record.observations.find((r) => r.line === line)?.page ?? 1)
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [url, setUrl] = useState('')
  const [loadError, setLoadError] = useState('')
  const [rendered, setRendered] = useState(0)
  const [pageText, setPageText] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [zoom, setZoom] = useState(1)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [readings, setReadings] = useState<Draft[]>(
    record.observations.map((r) => ({
      metric: r.metric,
      value: String(r.value),
      unit: r.unit as DocumentReading['unit'],
      method: r.method,
      methodKnown: r.methodKnown !== false,
      page: r.page ?? 1,
    })),
  )
  const [confirmed, setConfirmed] = useState(false)
  const [problem, setProblem] = useState('')
  const [saved, setSaved] = useState(false)
  const changed = useRef(false)
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (changed.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])
  function update(index: number, values: Partial<Draft>) {
    changed.current = true
    setSaved(false)
    setConfirmed(false)
    setReadings((current) => current.map((r, i) => (i === index ? { ...r, ...values } : r)))
  }
  useEffect(() => {
    let disposed = false
    let objectUrl = ''
    let task: PDFDocumentLoadingTask | undefined
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
      void task?.destroy()
    }, 30000)
    async function load() {
      try {
        const response = await fetch(`/api/workspace/documents/${record.id}`, {
          headers: { 'X-Workspace-Owner': owner },
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error()
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (disposed) return
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: info.mediaType }))
        setUrl(objectUrl)
        setLoadError('')
        if (info.mediaType === 'application/pdf') {
          const engine = await import('pdfjs-dist')
          if (disposed) return
          if (controller.signal.aborted) throw new Error()
          engine.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
          ).toString()
          const assets = `/api/document-assets/${engine.version}`
          task = engine.getDocument({
            data: bytes,
            useSystemFonts: true,
            stopAtErrors: true,
            maxImageSize: 20_000_000,
            canvasMaxAreaInBytes: 16_000_000,
            cMapUrl: `${assets}/cmaps/`,
            cMapPacked: true,
            standardFontDataUrl: `${assets}/standard_fonts/`,
            wasmUrl: `${assets}/wasm/`,
          })
          const document = await task.promise
          if (!disposed) setPdf(document)
        }
      } catch {
        if (!disposed)
          setLoadError(
            'The preview could not be loaded. Retry, or download the original if it is available.',
          )
      } finally {
        clearTimeout(timeout)
      }
    }
    void load()
    return () => {
      disposed = true
      clearTimeout(timeout)
      controller.abort()
      void task?.destroy()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [record.id, owner, info.mediaType, attempt])

  useEffect(() => {
    if (!pdf || !canvas.current) return
    let disposed = false
    let render: RenderTask | undefined
    const surface = canvas.current
    async function paint() {
      try {
        const sourcePage = await pdf!.getPage(page)
        if (disposed) return
        const unscaled = sourcePage.getViewport({ scale: 1 })
        const scale = Math.min(2, 2000 / Math.max(unscaled.width, unscaled.height))
        const viewport = sourcePage.getViewport({ scale })
        surface.width = Math.ceil(viewport.width)
        surface.height = Math.ceil(viewport.height)
        // Render static annotation appearances without an interactive annotation layer.
        render = sourcePage.render({ canvas: surface, viewport, annotationMode: 1 })
        await render.promise
        if (disposed) return
        setRendered(page)
        const text = await sourcePage.getTextContent()
        if (!disposed)
          setPageText(
            text.items
              .flatMap((item) => ('str' in item ? [item.str] : []))
              .join(' ')
              .slice(0, 40000),
          )
      } catch {
        if (!disposed)
          setLoadError(
            'This page could not be rendered. You can still download the original document.',
          )
      }
    }
    void paint()
    return () => {
      disposed = true
      render?.cancel()
    }
  }, [pdf, page])

  return (
    <WorkspaceDialog
      open
      wide
      onClose={() => {
        if (busy && !canRetry) return
        if (changed.current && !window.confirm('Discard the readings you have not saved?')) return
        onClose()
      }}
      title={record.title}
      description={`${record.provider} · ${record.occurredAt} · Your original document and the readings you enter, side by side.`}
    >
      <div className="document-review-layout">
        <section className="document-original" aria-label="Original document">
          <div className="document-toolbar">
            <button
              className="icon-button"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span aria-live="polite">
              Page {page} of {info.pages}
            </span>
            <button
              className="icon-button"
              aria-label="Next page"
              disabled={page >= info.pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={18} />
            </button>
            <select
              aria-label="Document zoom"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            >
              <option value="1">Fit width</option>
              <option value="1.5">150%</option>
              <option value="2">200%</option>
              <option value="3">300%</option>
            </select>
            {url && (
              <a className="text-link" href={url} download={record.source.label}>
                <Download size={15} /> Original
              </a>
            )}
          </div>
          {loadError ? (
            <div className="document-preview-error">
              <p role="alert">{loadError}</p>
              <button
                className="button button-outline"
                onClick={() => {
                  setLoadError('')
                  setAttempt(attempt + 1)
                }}
              >
                Retry preview
              </button>
            </div>
          ) : (
            <>
              {(!url || (info.mediaType === 'application/pdf' && rendered !== page)) && (
                <p role="status" className="small-note">
                  Loading page {page}…
                </p>
              )}
              <div
                className="document-page"
                role="region"
                aria-label="Scrollable document page"
                tabIndex={0}
              >
                {info.mediaType === 'application/pdf' ? (
                  <canvas
                    ref={canvas}
                    role="img"
                    aria-label={`Original document, page ${page}`}
                    style={{
                      visibility: rendered === page ? 'visible' : 'hidden',
                      width: `${zoom * 100}%`,
                    }}
                  />
                ) : (
                  url && (
                    // The owner-only blob URL must stay in the browser, outside the image optimizer.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      style={{ width: `${zoom * 100}%` }}
                      alt={`Original document: ${record.title}`}
                      onError={() =>
                        setLoadError(
                          'This image could not be displayed. Download the original to open it on your device.',
                        )
                      }
                    />
                  )
                )}
              </div>
              {pdf && rendered === page && (
                <details className="document-page-text">
                  <summary>Text on this page</summary>
                  <p>
                    {pageText ||
                      'This page has no selectable text. It may be a scan; automatic text recognition is not available yet.'}
                  </p>
                </details>
              )}
            </>
          )}
          <div className="source-integrity">
            <h4>Unchanged original · {formatBytes(info.byteLength)}</h4>
            <code>{info.sha256}</code>
            <p>SHA-256 identifies these file contents. It does not verify their accuracy.</p>
          </div>
        </section>
        <form
          className="account-form document-readings"
          onSubmit={async (event) => {
            event.preventDefault()
            const result = documentReviewSchema.safeParse({
              type: 'document-review',
              id: record.id,
              confirmed,
              readings: readings.map((r) => ({
                ...r,
                value: r.value.trim() ? Number(r.value) : NaN,
              })),
            })
            if (!result.success) {
              setProblem(
                'Check each value, unit, method, and page, then confirm you checked the original.',
              )
              return
            }
            setProblem('')
            if (await send(result.data)) {
              setSaved(true)
              changed.current = false
            }
          }}
        >
          <span className="eyebrow">FROM PAGE TO PICTURE</span>
          <h3>Readings, with a reference.</h3>
          <p className="small-note">
            Enter only what the report states. These are your transcriptions, not clinically
            verified values. No diagnosis or treatment is inferred.
          </p>
          {readings.map((reading, index) => (
            <fieldset key={index} className="document-reading" disabled={busy}>
              <legend>Reading {index + 1}</legend>
              <label>
                Measurement
                <select
                  aria-label={`Measurement ${index + 1}`}
                  value={reading.metric}
                  onChange={(e) => {
                    const metric = e.target.value as Metric
                    update(index, { metric, unit: units[metric][0] })
                  }}
                >
                  {Object.entries(metricLabels).map(([metric, label]) => (
                    <option
                      key={metric}
                      value={metric}
                      disabled={readings.some((r, i) => i !== index && r.metric === metric)}
                    >
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="document-field-grid">
                <label>
                  Value
                  <input
                    aria-label={`Value ${index + 1}`}
                    type="number"
                    step="any"
                    min="0"
                    max="1000000"
                    required
                    value={reading.value}
                    onChange={(e) => update(index, { value: e.target.value })}
                  />
                </label>
                <label>
                  Unit
                  <select
                    aria-label={`Unit ${index + 1}`}
                    value={reading.unit}
                    onChange={(e) =>
                      update(index, { unit: e.target.value as DocumentReading['unit'] })
                    }
                  >
                    {units[reading.metric].map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="document-checkbox">
                <input
                  type="checkbox"
                  checked={!reading.methodKnown}
                  onChange={(e) =>
                    update(index, {
                      methodKnown: !e.target.checked,
                      method: e.target.checked ? 'Not stated' : '',
                    })
                  }
                />{' '}
                Method not stated on report
              </label>
              {reading.methodKnown && (
                <label>
                  Method as printed
                  <input
                    aria-label={`Method ${index + 1}`}
                    required
                    maxLength={160}
                    value={reading.method}
                    onChange={(e) => update(index, { method: e.target.value })}
                    placeholder="For example, HPLC"
                  />
                </label>
              )}
              <label>
                Source page
                <select
                  aria-label={`Source page ${index + 1}`}
                  value={reading.page}
                  onChange={(e) => {
                    const value = Number(e.target.value)
                    update(index, { page: value })
                    setPage(value)
                  }}
                >
                  {Array.from({ length: info.pages }, (_, i) => (
                    <option value={i + 1} key={i}>
                      Page {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setReadings(readings.filter((_, i) => i !== index))
                  changed.current = true
                  setConfirmed(false)
                  setSaved(false)
                }}
              >
                <Trash2 size={14} /> Remove reading {index + 1}
              </button>
            </fieldset>
          ))}
          {readings.length < 3 && (
            <button
              type="button"
              className="button button-outline"
              disabled={busy || !url}
              onClick={() => {
                const metric = (Object.keys(metricLabels) as Metric[]).find(
                  (m) => !readings.some((r) => r.metric === m),
                )!
                setReadings([
                  ...readings,
                  {
                    metric,
                    value: '',
                    unit: units[metric][0],
                    method: 'Not stated',
                    methodKnown: false,
                    page,
                  },
                ])
                changed.current = true
                setSaved(false)
                setConfirmed(false)
              }}
            >
              <Plus size={15} /> Add a reading
            </button>
          )}
          <p className="small-note">
            Up to one HbA1c, LDL, and systolic reading per document. Unknown methods stay separate
            in comparisons.
          </p>
          <label className="document-checkbox">
            <input
              type="checkbox"
              required
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            I checked these readings, units, and page references against the original.
          </label>
          {(problem || error) && (
            <p className="form-error" role="alert">
              {problem || error}
            </p>
          )}
          {canRetry && (
            <button
              type="button"
              className="text-link"
              onClick={async () => {
                if (await retry()) {
                  changed.current = false
                  setSaved(true)
                }
              }}
            >
              Retry save
            </button>
          )}
          {saved && (
            <p role="status" className="document-saved">
              Readings saved. The original is unchanged.
            </p>
          )}
          <button className="button button-primary" disabled={busy || !confirmed || !url}>
            {busy && !canRetry ? 'Saving…' : 'Save readings'}
          </button>
        </form>
      </div>
    </WorkspaceDialog>
  )
}
