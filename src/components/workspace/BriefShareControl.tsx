'use client'

import { useRef, useState } from 'react'
import { Link2 } from 'lucide-react'
import type { BriefSelection, buildPersonalBrief } from '@/lib/records/personal-brief'
import styles from './BriefSharing.module.css'

export type ShareStatus = 'idle' | 'saving' | 'retry' | 'created'

export function ShareLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/shared-brief#${token}`
  return (
    <div className={styles.link}>
      <label>
        Share link
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <button
        type="button"
        className="button button-outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
          } catch {
            setCopied(false)
          }
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  )
}

export function BriefShareControl({
  brief,
  selection,
  preparedOn,
  owner,
  revision,
  onStatus,
}: {
  brief: ReturnType<typeof buildPersonalBrief>
  selection: BriefSelection
  preparedOn: string
  owner: string
  revision: number
  onStatus: (status: ShareStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const [reviewedContents, setReviewedContents] = useState('')
  const [hours, setHours] = useState(24)
  const [status, setStatus] = useState<ShareStatus>('idle')
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ token: string; expiresAt: string }>()
  const pending = useRef<string | undefined>(undefined)
  const running = useRef(false)
  const previewContents = JSON.stringify(brief)
  const reviewed = reviewedContents === previewContents
  function update(value: ShareStatus) {
    setStatus(value)
    onStatus(value)
  }
  async function create() {
    if (running.current) return
    running.current = true
    update('saving')
    setError('')
    try {
      if (!pending.current) {
        const digest = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify(brief)),
        )
        const previewHash = Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('')
        pending.current = JSON.stringify({
          type: 'create',
          revision,
          requestId: crypto.randomUUID(),
          selection,
          preparedOn,
          expiresInHours: hours,
          reviewed: true,
          previewHash,
        })
      }
      const response = await fetch('/api/workspace/brief-shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Owner': owner },
        body: pending.current,
      })
      const body = await response.json()
      if (!response.ok) {
        if ([400, 401, 403, 409, 410, 413, 422].includes(response.status)) {
          pending.current = undefined
          update('idle')
          setError(body.error || 'Reload the workspace and review the brief before trying again.')
          return
        }
        throw new Error()
      }
      setCreated(body.share)
      update('created')
    } catch {
      update('retry')
      setError(
        'The link is not confirmed created. Retry to check the same request, or open Shared briefs after closing this preview.',
      )
    } finally {
      running.current = false
    }
  }
  if (!open)
    return (
      <button
        type="button"
        className="button button-outline"
        disabled={!brief.sections.length}
        onClick={() => setOpen(true)}
      >
        <Link2 size={15} /> Share this brief
      </button>
    )
  return (
    <div className={styles.panel} aria-label="Share this brief">
      {created ? (
        <>
          <p>Your link is ready. It expires {new Date(created.expiresAt).toLocaleString()}.</p>
          <ShareLink token={created.token} />
          <p>Manage or revoke it under Shared briefs in Visit preparation.</p>
        </>
      ) : (
        <>
          <p>
            Anyone with this link can read and save this copy of your brief. Revoke it anytime under
            Shared briefs.
          </p>
          <label className={styles.expiry}>
            Link expires after
            <select
              value={hours}
              disabled={status !== 'idle'}
              onChange={(e) => setHours(Number(e.target.value))}
            >
              <option value={1}>1 hour</option>
              <option value={24}>24 hours</option>
              <option value={168}>7 days</option>
            </select>
          </label>
          <label className={styles.consent}>
            <input
              type="checkbox"
              checked={reviewed}
              disabled={status !== 'idle'}
              onChange={(e) => setReviewedContents(e.target.checked ? previewContents : '')}
            />{' '}
            I reviewed this preview and want to share it.
          </label>
          <button
            type="button"
            className="button button-primary"
            disabled={!reviewed || status === 'saving'}
            onClick={() => void create()}
          >
            {status === 'saving'
              ? 'Creating link…'
              : status === 'retry'
                ? 'Retry creating link'
                : 'Create share link'}
          </button>
        </>
      )}
      {['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) && (
        <p>This installation runs on localhost. Its links open on this computer.</p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  )
}
