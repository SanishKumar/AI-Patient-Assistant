'use client'

import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import type { OwnedBriefShare } from '@/lib/records/brief-sharing'
import { WorkspaceDialog } from './WorkspaceDialog'
import { VisitBriefPaper } from './VisitBriefPaper'
import { ShareLink } from './BriefShareControl'
import styles from './BriefSharing.module.css'
import paperStyles from './VisitBriefDialog.module.css'

export function SharedBriefsDialog({ owner, onClose }: { owner: string; onClose: () => void }) {
  const [shares, setShares] = useState<OwnedBriefShare[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string>()
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    fetch('/api/workspace/brief-shares', {
      cache: 'no-store',
      headers: { 'X-Workspace-Owner': owner },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error()
        const body = await response.json()
        if (active) setShares(body.shares)
      })
      .catch(() => {
        if (active) setError('Shared briefs could not be loaded. Try again.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [owner, refresh])
  async function revoke(id: string) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/workspace/brief-shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Owner': owner },
        body: JSON.stringify({ type: 'revoke', id }),
      })
      if (!response.ok) throw new Error()
      setShares((rows) => rows.filter((row) => row.id !== id))
      setConfirm(undefined)
      setSelected(undefined)
    } catch {
      setError('Revocation is not confirmed. Retry to check this link again.')
    } finally {
      setBusy(false)
    }
  }
  const stored = shares.find((share) => share.id === selected)
  return (
    <WorkspaceDialog
      open
      wide
      onClose={() => {
        if (!busy) onClose()
      }}
      title="Shared briefs"
      description="Each link opens the copy you selected when you created it. Revoke a link to stop future access. Saved or printed copies stay with their recipients."
    >
      {loading && <p role="status">Loading shared briefs…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className={styles.list}>
        {!loading && !shares.length && <p>No active shared briefs.</p>}
        {shares.map((share) => (
          <article key={share.id} className={styles.row}>
            <h3>Shared {new Date(share.createdAt).toLocaleString()}</h3>
            <p>Expires {new Date(share.expiresAt).toLocaleString()}</p>
            <p>
              {share.lastOpenedAt
                ? `Last accessed ${new Date(share.lastOpenedAt).toLocaleString()}`
                : 'Link has not been accessed yet.'}
            </p>
            <ShareLink token={share.token} />
            <div className={styles.actions}>
              <button className="button button-outline" onClick={() => setSelected(share.id)}>
                View shared copy
              </button>
              {confirm === share.id ? (
                <>
                  <button
                    className="button button-danger"
                    disabled={busy}
                    onClick={() => void revoke(share.id)}
                  >
                    Revoke this link
                  </button>
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() => setConfirm(undefined)}
                  >
                    Keep link
                  </button>
                </>
              ) : (
                <button className="text-link" disabled={busy} onClick={() => setConfirm(share.id)}>
                  Revoke link
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className={styles.actions}>
        <button
          className="text-link"
          disabled={busy || loading}
          onClick={() => {
            setLoading(true)
            setError('')
            setRefresh((value) => value + 1)
          }}
        >
          Refresh shared briefs
        </button>
      </div>
      {stored && (
        <div className={`${paperStyles.builder} ${styles.stored}`}>
          <div className={styles.actions}>
            <p>Shared copy created {new Date(stored.createdAt).toLocaleString()}</p>
            <button className="button button-outline" onClick={() => window.print()}>
              <Printer size={15} /> Print shared copy
            </button>
          </div>
          <VisitBriefPaper brief={stored.brief} />
        </div>
      )}
    </WorkspaceDialog>
  )
}
