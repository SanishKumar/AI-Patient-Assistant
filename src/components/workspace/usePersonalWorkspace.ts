'use client'
import { useRef, useState } from 'react'
import type { WorkspaceCommand, WorkspaceSnapshot } from '@/lib/records/workspace'

export function usePersonalWorkspace(initial: WorkspaceSnapshot, owner: string) {
  const [saved, setSaved] = useState(initial)
  const latest = useRef(initial)
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState('')
  const [canRetry, setCanRetry] = useState(false)
  const pending = useRef<{ revision: number; requestId: string; command: WorkspaceCommand } | null>(
    null,
  )
  const running = useRef(false)
  async function flush() {
    if (running.current || !pending.current) return false
    running.current = true
    setStatus('saving')
    setError('')
    setCanRetry(false)
    try {
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Owner': owner },
        body: JSON.stringify(pending.current),
      })
      const body = await response.json()
      if (response.status === 409) {
        latest.current = body
        setSaved(body)
        pending.current = null
        setStatus('error')
        setError(
          'Another tab changed this workspace. The latest version is shown. Review your change and try again.',
        )
        return false
      }
      if ([400, 401, 403, 413, 422].includes(response.status)) {
        pending.current = null
        setStatus('error')
        setError(body.error || 'This change could not be saved. Reload and try again.')
        return false
      }
      if (!response.ok) throw new Error('Save unavailable')
      latest.current = body
      setSaved(body)
      pending.current = null
      setStatus('saved')
      return true
    } catch {
      setStatus('error')
      setCanRetry(true)
      setError(
        'Connection interrupted. Your change is not confirmed saved. Keep this tab open and retry.',
      )
      return false
    } finally {
      running.current = false
    }
  }
  async function send(command: WorkspaceCommand) {
    if (running.current || pending.current) return false
    pending.current = { command, revision: latest.current.revision, requestId: crypto.randomUUID() }
    return flush()
  }
  return {
    state: saved.state,
    status,
    error,
    canRetry,
    send,
    retry: flush,
    busy: status === 'saving' || canRetry,
  }
}
