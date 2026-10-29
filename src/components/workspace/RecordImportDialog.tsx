'use client'

import { useRef, useState } from 'react'
import { ArrowRight, Check, Download, FileCheck2, FileUp, ShieldCheck } from 'lucide-react'
import {
  importLabCsv,
  ImportValidationError,
  MAX_IMPORT_BYTES,
  MAX_IMPORTED_RECORDS,
  sampleLabCsv,
  type ImportIssue,
} from '@/lib/records/import-csv'
import type { HealthRecord } from '@/lib/records/types'
import { WorkspaceDialog } from './WorkspaceDialog'
import { downloadText } from './downloads'

export function RecordImportDialog({
  open,
  onClose,
  records,
  onImport,
}: {
  open: boolean
  onClose: () => void
  records: HealthRecord[]
  onImport: (record: HealthRecord) => void
}) {
  const [draft, setDraft] = useState<HealthRecord>()
  const [issues, setIssues] = useState<ImportIssue[]>([])
  const [reading, setReading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const generation = useRef(0)
  const duplicate = draft && records.some((record) => record.id === draft.id)
  const limitReached =
    records.filter((record) => record.source.importedCsv).length >= MAX_IMPORTED_RECORDS
  function reset() {
    generation.current++
    setDraft(undefined)
    setIssues([])
    setConfirmed(false)
    setReading(false)
  }
  async function choose(file?: File) {
    reset()
    if (!file) return
    const current = generation.current
    setReading(true)
    try {
      if (file.size > MAX_IMPORT_BYTES)
        throw new ImportValidationError([{ message: 'Choose a CSV file no larger than 16 KB.' }])
      const buffer = await file.arrayBuffer()
      if (generation.current !== current) return
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer)
      } catch {
        throw new ImportValidationError([
          { message: 'The file is not valid UTF-8 text. Save it as UTF-8 CSV and try again.' },
        ])
      }
      setDraft(importLabCsv(file.name, text))
    } catch (error) {
      if (generation.current === current)
        setIssues(
          error instanceof ImportValidationError
            ? error.issues
            : [{ message: 'This file could not be read. Choose another CSV file.' }],
        )
    } finally {
      if (generation.current === current) setReading(false)
    }
  }
  return (
    <WorkspaceDialog
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Bring another piece of the story."
      description="Import a fictional lab report. Review every value before it joins the workspace."
      wide
    >
      <ol className="import-steps" aria-label="Import steps">
        <li className="complete">
          01 <span>Choose file</span>
        </li>
        <li className={draft ? 'complete' : ''}>
          02 <span>Review values</span>
        </li>
        <li>
          03 <span>Save with source</span>
        </li>
      </ol>
      {!draft && (
        <div className="import-picker">
          <FileUp size={32} strokeWidth={1.4} />
          <h3>A small file. A traceable beginning.</h3>
          <p>
            UTF-8 CSV · up to 16 KB · HbA1c and LDL measurements
            <br />
            One report per file, using the columns in our example.
          </p>
          <label className="file-picker">
            {reading ? 'Reading file…' : 'Choose CSV file'}
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Choose CSV file"
              disabled={reading}
              onChange={(event) => void choose(event.target.files?.[0])}
            />
          </label>
          <button
            className="text-link"
            onClick={() =>
              downloadText(sampleLabCsv, 'aether-fictional-lab.csv', 'text/csv;charset=utf-8')
            }
          >
            <Download size={14} /> Download fictional example
          </button>
          <p className="import-local-note">
            The file is checked in your browser first. It is sent to your local account server only
            when you confirm the import. Use fictional details only.
          </p>
        </div>
      )}
      {issues.length > 0 && (
        <div className="import-errors" role="alert">
          <h3>Let’s fix the file first.</h3>
          <ul>
            {issues.map((issue, i) => (
              <li key={i}>
                {issue.line && (
                  <strong>
                    Line {issue.line}
                    {issue.field ? ` · ${issue.field}` : ''}:{' '}
                  </strong>
                )}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {draft && (
        <div className="import-review">
          <div className="import-file-heading">
            <span className="file-tile">
              <FileCheck2 size={26} />
            </span>
            <div>
              <h3>{draft.source.label}</h3>
              <p>
                {draft.provider} · {draft.occurredAt}
              </p>
            </div>
            <span className="pill amber">Unreviewed</span>
          </div>
          <div
            className="import-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Measurement preview"
          >
            <table className="import-table">
              <caption>Values found in the source file</caption>
              <thead>
                <tr>
                  <th scope="col">Measurement</th>
                  <th scope="col">Value</th>
                  <th scope="col">Method</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {draft.observations.map((item) => (
                  <tr key={item.metric}>
                    <th scope="row">{item.label}</th>
                    <td>
                      {item.value} {item.unit}
                    </td>
                    <td>{item.method}</td>
                    <td>Line {item.line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="import-raw">
            <summary>Read the original file</summary>
            <pre tabIndex={0} role="region" aria-label="Original CSV content">
              {draft.source.importedCsv!.text}
            </pre>
          </details>
          <div className="review-boundary">
            <ShieldCheck size={18} />
            <p>
              Values are copied from the file. No units are converted and no clinical interpretation
              is added. The original text and its content fingerprint stay attached.
            </p>
          </div>
          {duplicate ? (
            <p className="import-feedback">
              <Check size={16} /> This exact file is already in your workspace, even if its filename
              changed.
            </p>
          ) : limitReached ? (
            <p className="form-error">
              This preview supports up to 12 imported reports. Export or clear the workspace before
              importing another.
            </p>
          ) : (
            <label className="import-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />{' '}
              I have reviewed these values and confirm this file contains fictional information.
            </label>
          )}
          <div className="import-footer">
            <button className="button button-outline" onClick={reset}>
              Choose a different file
            </button>
            <button
              className="button button-primary"
              disabled={!confirmed || !!duplicate || limitReached}
              onClick={() => {
                onImport(draft)
                reset()
                onClose()
              }}
            >
              Import reviewed file <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </WorkspaceDialog>
  )
}
