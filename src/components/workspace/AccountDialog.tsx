'use client'

import { useState } from 'react'
import { ArrowRight, Download, LockKeyhole, LogOut, Trash2 } from 'lucide-react'
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
  viewer?: { id: string; name: string; email: string }
  onErase: () => void
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [exporting, setExporting] = useState(false)
  async function exportSaved() {
    setExporting(true)
    setError('')
    try {
      const response = await fetch('/api/workspace/export', {
        headers: { 'X-Workspace-Owner': viewer!.id },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Export failed')
      downloadText(await response.text(), 'aether-workspace.json')
    } catch {
      setError(
        'Could not export this workspace. Check your connection and sign-in, then try again.',
      )
    } finally {
      setExporting(false)
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const credentials = { email: String(form.get('email')), password: String(form.get('password')) }
    setBusy(true)
    setError('')
    try {
      const result =
        mode === 'signup'
          ? await authClient.signUp.email({ ...credentials, name: String(form.get('name')) })
          : await authClient.signIn.email(credentials)
      if (result.error) {
        setError(
          mode === 'signin'
            ? 'Sign-in failed. Check your email and password, then try again.'
            : 'Could not create this account. Try signing in if you already have one.',
        )
        return
      }
      window.location.reload()
    } catch {
      setError('The account service is unavailable. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  async function signOut() {
    setBusy(true)
    setError('')
    try {
      const result = await authClient.signOut()
      if (result.error) {
        setError('Could not sign out. Please try again.')
        return
      }
      window.location.reload()
    } catch {
      setError('Could not sign out. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <WorkspaceDialog
      open={open}
      onClose={() => {
        if (!busy && !exporting) {
          setDeleteOpen(false)
          setConfirmation('')
          onClose()
        }
      }}
      title={
        viewer
          ? 'Your saved space'
          : mode === 'signup'
            ? 'A space to come back to.'
            : 'Welcome back.'
      }
      description="Local account preview · fictional records only"
    >
      {viewer ? (
        <div className="account-summary">
          <div className="account-emblem">
            <LockKeyhole size={28} />
          </div>
          <h3>{viewer.name}</h3>
          <p>{viewer.email}</p>
          <p>
            Your sample records, questions, and review progress are saved to this account on this
            local server.
          </p>
          <div className="account-data-controls">
            <button
              className="button button-primary"
              disabled={busy || exporting}
              onClick={exportSaved}
            >
              <Download size={16} />
              {exporting ? 'Preparing export…' : 'Export workspace data'}
            </button>
            <p className="account-export-note">
              Includes original imported files, source references, questions, and workspace
              activity. Exported files are yours to keep or delete.
            </p>
            <button
              className="button button-outline"
              disabled={busy || exporting}
              onClick={signOut}
            >
              <LogOut size={16} /> {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
          <div className="account-delete">
            {!deleteOpen ? (
              <button
                className="text-link"
                disabled={busy || exporting}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={14} /> Delete saved workspace data
              </button>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (confirmation !== 'DELETE') return
                  setDeleteOpen(false)
                  setConfirmation('')
                  onErase()
                }}
              >
                <h3>Delete your saved workspace data?</h3>
                <p>
                  Removes imported files, questions, review progress, and previous workspace
                  activity. Your account and bundled fictional records remain. Downloaded copies are
                  not deleted.
                </p>
                <label>
                  Type DELETE to confirm
                  <input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                    required
                    pattern="DELETE"
                  />
                </label>
                <div className="import-footer">
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => {
                      setDeleteOpen(false)
                      setConfirmation('')
                    }}
                  >
                    Keep my data
                  </button>
                  <button
                    className="button button-danger"
                    disabled={confirmation !== 'DELETE' || busy || exporting}
                  >
                    Delete workspace data
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        <form className="account-form" onSubmit={submit}>
          <div className="account-mode" role="group" aria-label="Account action">
            <button
              type="button"
              aria-pressed={mode === 'signup'}
              onClick={() => {
                setMode('signup')
                setError('')
              }}
            >
              Create account
            </button>
            <button
              type="button"
              aria-pressed={mode === 'signin'}
              onClick={() => {
                setMode('signin')
                setError('')
              }}
            >
              Sign in
            </button>
          </div>
          {mode === 'signup' && (
            <label>
              Display name
              <input
                name="name"
                autoComplete="nickname"
                required
                maxLength={80}
                placeholder="How should we address you?"
              />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={12}
              maxLength={128}
              aria-describedby="password-hint"
            />
          </label>
          <small id="password-hint">
            At least 12 characters. Use a password just for this preview.
          </small>
          <p className="account-note">
            Start a separate saved workspace. Guest changes stay in your browser tab. Email
            verification and password recovery are not available in this local preview.
          </p>
          <button className="button button-primary full-width" disabled={busy}>
            {busy ? 'One moment…' : mode === 'signup' ? 'Create my space' : 'Sign in to my space'}
            <ArrowRight size={16} />
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </WorkspaceDialog>
  )
}
