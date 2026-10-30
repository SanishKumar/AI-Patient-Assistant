'use client'
import { useState } from 'react'
import { Download, LogOut, Trash2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { WorkspaceDialog } from './WorkspaceDialog'
import { downloadText } from './downloads'

export function AccountDialog({
  open,
  onClose,
  viewer,
  onErase,
}: {
  open: boolean
  onClose: () => void
  viewer: { id: string; name: string; email: string }
  onErase: () => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletion, setDeletion] = useState<'workspace' | 'account' | null>(null)
  const [confirmation, setConfirmation] = useState('')
  async function exportSaved() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/workspace/export', {
        headers: { 'X-Workspace-Owner': viewer.id },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error()
      downloadText(await response.text(), 'aether-workspace.json')
    } catch {
      setError('Could not export your data. Check your connection and sign-in, then retry.')
    } finally {
      setBusy(false)
    }
  }
  async function signOut() {
    setBusy(true)
    setError('')
    try {
      const result = await authClient.signOut()
      if (result.error) throw new Error()
      window.location.replace('/')
    } catch {
      setError('Could not sign out. Please try again.')
      setBusy(false)
    }
  }
  async function remove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (confirmation !== 'DELETE') return
    const password = String(new FormData(event.currentTarget).get('password') || '')
    setBusy(true)
    setError('')
    try {
      if (deletion === 'account') {
        const result = await authClient.deleteUser({ password, callbackURL: '/' })
        if (result.error) throw new Error()
        window.location.replace('/')
      } else if (await onErase()) {
        setDeletion(null)
        setConfirmation('')
        onClose()
      }
    } catch {
      setError('Deletion failed. Check your password and connection, then try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <WorkspaceDialog
      open={open}
      onClose={() => {
        if (!busy) {
          setDeletion(null)
          setConfirmation('')
          onClose()
        }
      }}
      title="Your account, your control."
      description={viewer.email}
    >
      <div className="account-summary">
        <h3>{viewer.name}</h3>
        <p>
          Your records belong to this account. Downloads contain private information; store them
          somewhere you trust.
        </p>
        <div className="account-data-controls">
          <button className="button button-primary" disabled={busy} onClick={exportSaved}>
            <Download size={16} /> Export workspace data
          </button>
          <button className="button button-outline" disabled={busy} onClick={signOut}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
        <div className="account-delete">
          {!deletion ? (
            <>
              <button
                className="text-link"
                disabled={busy}
                onClick={() => setDeletion('workspace')}
              >
                <Trash2 size={14} /> Delete saved workspace data
              </button>
              <button className="text-link" disabled={busy} onClick={() => setDeletion('account')}>
                <Trash2 size={14} /> Delete my account
              </button>
            </>
          ) : (
            <form className="account-form" onSubmit={remove}>
              <h3>
                {deletion === 'account'
                  ? 'Permanently delete your account?'
                  : 'Delete your saved workspace data?'}
              </h3>
              <p>
                {deletion === 'account'
                  ? 'Removes your account, active sessions, saved records, journal, and visit preparation.'
                  : 'Removes saved records, journal entries, visit details, questions, and previous workspace activity. Your account stays open.'}{' '}
                Downloaded copies and server backups are not removed by this action.
              </p>
              <label>
                Type DELETE to confirm
                <input
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  pattern="DELETE"
                />
              </label>
              {deletion === 'account' && (
                <label>
                  Current password
                  <input name="password" type="password" autoComplete="current-password" required />
                </label>
              )}
              <div className="import-footer">
                <button
                  type="button"
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => setDeletion(null)}
                >
                  Keep my data
                </button>
                <button
                  className="button button-danger"
                  disabled={busy || confirmation !== 'DELETE'}
                >
                  {busy
                    ? 'Deleting…'
                    : deletion === 'account'
                      ? 'Delete account permanently'
                      : 'Delete workspace data'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </WorkspaceDialog>
  )
}
