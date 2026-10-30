'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Mail } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export function AuthForm({
  configured,
  local,
  mail,
  resetToken,
}: {
  configured: boolean
  local: boolean
  mail: boolean
  resetToken?: string
}) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'recover'>(
    resetToken !== undefined ? 'recover' : 'signin',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') || '')
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (resetToken !== undefined) {
        const result = await authClient.resetPassword({ token: resetToken, newPassword: password })
        if (result.error) {
          setError('This reset link is invalid or expired. Request a new link.')
          return
        }
        setMessage(
          'Password updated. Sign in with your new password. Your previous sessions have ended.',
        )
      } else if (mode === 'recover') {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: '/reset-password',
        })
        if (result.error) {
          setError('Could not request a reset. Please try again shortly.')
          return
        }
        setMessage(
          'If an account exists for that address, a password reset link will arrive by email.',
        )
      } else if (mode === 'signup') {
        const result = await authClient.signUp.email({
          name: String(form.get('name')).trim(),
          email,
          password,
          callbackURL: '/login?verified=1',
        })
        if (result.error) {
          setError(
            'Could not create this account. If you already have one, sign in or reset your password.',
          )
          return
        }
        if (local) window.location.replace('/workspace')
        else setMessage('Check your inbox for a verification link, then return here to sign in.')
      } else {
        const result = await authClient.signIn.email({ email, password })
        if (result.error) {
          setError(
            'Sign-in failed. Check your credentials and verify your email before trying again.',
          )
          return
        }
        window.location.replace('/workspace')
      }
    } catch {
      setError('The account service could not be reached. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  async function resend() {
    if (!email || busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: '/login?verified=1',
      })
      if (result.error) {
        setError('Could not request verification. Try again shortly.')
        return
      }
      setMessage('If this address needs verification, a new link will arrive by email.')
    } catch {
      setError('Could not reach the email service.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth-card">
      <span className="eyebrow">YOUR SPACE TO COME BACK TO</span>
      <h1>
        {resetToken !== undefined
          ? 'A fresh start.'
          : mode === 'signup'
            ? 'Make room for your story.'
            : mode === 'recover'
              ? 'Let’s get you back in.'
              : 'Welcome back.'}
      </h1>
      {!configured ? (
        <p role="status">
          Accounts are not configured on this server yet. <Link href="/demo">Explore the demo</Link>{' '}
          while the administrator completes setup.
        </p>
      ) : (
        <>
          {local && (
            <p className="local-development-note">
              Local development account · use test details. Email verification is disabled on this
              installation.
            </p>
          )}
          {resetToken === undefined && mode !== 'recover' && (
            <div className="account-mode" role="group" aria-label="Account action">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  disabled={busy}
                  onClick={() => {
                    setMode(m)
                    setError('')
                    setMessage('')
                  }}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          )}
          <form className="account-form" onSubmit={submit}>
            {mode === 'signup' && (
              <label>
                Display name
                <input name="name" autoComplete="nickname" required maxLength={80} />
              </label>
            )}
            {resetToken === undefined && (
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {(mode !== 'recover' || resetToken !== undefined) && (
              <label>
                {resetToken !== undefined ? 'New password' : 'Password'}
                <input
                  name="password"
                  aria-label={resetToken !== undefined ? 'New password' : 'Password'}
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
                <small>At least 12 characters.</small>
              </label>
            )}
            {mode === 'signup' && (
              <p className="small-note">
                Your account starts empty. Records are never copied from the demo. Read{' '}
                <Link href="/privacy">how your data is handled</Link> before adding information.
              </p>
            )}
            <button
              className="button button-primary full-width"
              disabled={busy || (mode === 'recover' && resetToken === undefined && !mail)}
            >
              {busy
                ? 'One moment…'
                : resetToken !== undefined
                  ? 'Set new password'
                  : mode === 'recover'
                    ? 'Send reset link'
                    : mode === 'signup'
                      ? 'Create my space'
                      : 'Sign in to my space'}
              <ArrowRight size={16} />
            </button>
          </form>
          {mode === 'signin' && (
            <div className="auth-secondary">
              <button
                className="text-link"
                disabled={busy}
                onClick={() => {
                  setMode('recover')
                  setMessage('')
                  setError('')
                }}
              >
                Forgot password?
              </button>
              {mail && (
                <button className="text-link" disabled={busy || !email} onClick={resend}>
                  Resend verification email
                </button>
              )}
            </div>
          )}
          {mode === 'recover' && !mail && resetToken === undefined && (
            <p className="small-note">
              Email delivery is not configured on this server. Contact the administrator to enable
              recovery.
            </p>
          )}
          {mode === 'recover' && (
            <Link
              className="text-link"
              href="/login"
              onClick={() => {
                setMode('signin')
                setMessage('')
                setError('')
              }}
            >
              Back to sign in
            </Link>
          )}
          {message && (
            <p className="auth-success" role="status">
              {resetToken ? <Check size={18} /> : <Mail size={18} />}
              <span>{message}</span>
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  )
}
