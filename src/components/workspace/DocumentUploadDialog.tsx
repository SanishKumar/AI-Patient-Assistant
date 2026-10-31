'use client'

import { useState } from 'react'
import { FileUp, ShieldCheck } from 'lucide-react'
import {
  documentMetadataSchema,
  formatBytes,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_STORAGE_BYTES,
  type DocumentMetadata,
} from '@/lib/records/documents'
import { WorkspaceDialog } from './WorkspaceDialog'

export function DocumentUploadDialog({
  onClose,
  onUpload,
  used,
  busy,
  error,
  canRetry,
  retry,
}: {
  onClose: () => void
  onUpload: (file: File, metadata: DocumentMetadata) => Promise<boolean>
  used: number
  busy: boolean
  error: string
  canRetry: boolean
  retry: () => Promise<boolean>
}) {
  const [file, setFile] = useState<File>()
  const [problem, setProblem] = useState('')
  return (
    <WorkspaceDialog
      open
      onClose={onClose}
      title="A home for the original."
      description="Keep your report, then add readings beside the page they came from. PDF, PNG, or JPEG · up to 5 MB and 20 pages."
    >
      <form
        className="account-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!file || file.size > MAX_DOCUMENT_BYTES || !file.size) {
            setProblem('Choose a non-empty PDF, PNG, or JPEG no larger than 5 MB.')
            return
          }
          const values = Object.fromEntries(new FormData(event.currentTarget))
          const result = documentMetadataSchema.safeParse({
            ...values,
            belongsToMe: values.belongsToMe === 'on',
          })
          if (!result.success) {
            setProblem('Add a title, date, provider, and ownership confirmation.')
            return
          }
          setProblem('')
          if (await onUpload(file, result.data)) onClose()
        }}
      >
        <label className="document-dropzone">
          <FileUp size={28} /> Choose your document
          <input
            type="file"
            aria-label="Document file"
            accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0])
              setProblem('')
            }}
          />
          <span>
            {file
              ? `${file.name} · ${formatBytes(file.size)}`
              : 'Select a report saved on your device'}
          </span>
        </label>
        <div className="document-field-grid">
          <label>
            Document title
            <input
              name="title"
              required
              maxLength={120}
              placeholder="October blood report"
              disabled={busy}
            />
          </label>
          <label>
            Document date
            <input
              name="date"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              disabled={busy}
            />
          </label>
          <label>
            Clinic or laboratory
            <input
              name="provider"
              required
              maxLength={160}
              placeholder="As shown on the report"
              disabled={busy}
            />
          </label>
          <label>
            Document category
            <select name="kind" defaultValue="lab" disabled={busy}>
              <option value="lab">Lab report</option>
              <option value="visit">Visit note</option>
              <option value="prescription">Prescription</option>
              <option value="document">Other document</option>
            </select>
          </label>
        </div>
        <label className="document-checkbox">
          <input type="checkbox" name="belongsToMe" required disabled={busy} /> This is my own
          health document.
        </label>
        <p className="small-note">
          <ShieldCheck size={15} /> Originals are encrypted on the server. Password-protected PDFs,
          forms, scripts, and attachments are not accepted. Readings are entered by you; no
          automatic extraction runs.
        </p>
        <p className="document-storage">
          {used ? formatBytes(used) : '0 MB'} of {formatBytes(MAX_DOCUMENT_STORAGE_BYTES)} used
        </p>
        {(problem || error) && (
          <p role="alert" className="form-error">
            {problem || error}
          </p>
        )}
        {canRetry && (
          <button
            type="button"
            className="text-link"
            onClick={async () => {
              if (await retry()) onClose()
            }}
          >
            Retry upload
          </button>
        )}
        <button className="button button-primary" disabled={busy || !file}>
          <FileUp size={16} /> {busy && !canRetry ? 'Checking and saving…' : 'Save document'}
        </button>
      </form>
    </WorkspaceDialog>
  )
}
