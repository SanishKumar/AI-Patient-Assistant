'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  emptySession,
  restoreSession,
  sessionReducer,
  type SessionAction,
} from '@/lib/records/demo-session'
import type { SavedWorkspace } from '@/lib/server/workspaces'

const storageKey = 'aether.synthetic-workspace.v1'
type PendingChange = { action: Exclude<SessionAction, { type: 'restore' }>; requestId: string }

export function useWorkspaceState(saved?: SavedWorkspace, ownerId?: string) {
  const [session, localDispatch] = useReducer(sessionReducer, saved?.state ?? emptySession)
  const [ready, finishHydration] = useReducer(() => true, false)
  const [storageWarning, reportStorageWarning] = useReducer(() => true, false)
  const [sync, setSync] = useState<'saved' | 'saving' | 'error'>('saved')
  const [syncError, setSyncError] = useState('')
  const [canRetry, setCanRetry] = useState(false)
  const revision = useRef(saved?.revision ?? 0)
  const queue = useRef<PendingChange[]>([])
  const running = useRef(false)
  const paused = useRef(false)

  useEffect(() => {
    const protectPendingChanges = (event: BeforeUnloadEvent) => {
      if (!queue.current.length) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', protectPendingChanges)
    return () => window.removeEventListener('beforeunload', protectPendingChanges)
  }, [])

  useEffect(() => {
    if (saved) return
    try {
      localDispatch({
        type: 'restore',
        session: restoreSession(sessionStorage.getItem(storageKey)),
      })
    } catch {
      reportStorageWarning()
    }
    finishHydration()
  }, [saved])

  useEffect(() => {
    if (saved || !ready) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, ...session }))
    } catch {
      reportStorageWarning()
    }
  }, [saved, session, ready])

  const flush = useCallback(async () => {
    if (running.current || paused.current) return
    running.current = true
    setSync('saving')
    setSyncError('')
    setCanRetry(false)
    try {
      while (queue.current.length) {
        const entry = queue.current[0]
        const action = entry.action
        const command =
          action.type === 'question'
            ? {
                type: action.type,
                text: action.question.text,
                sourceIds: action.question.sourceIds,
              }
            : action.type === 'review'
              ? { type: action.type, action: action.event.action }
              : action
        const response = await fetch('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Workspace-Owner': ownerId! },
          body: JSON.stringify({ revision: revision.current, requestId: entry.requestId, command }),
        })
        if (response.status === 409) {
          const latest = (await response.json()) as SavedWorkspace
          revision.current = latest.revision
          localDispatch({ type: 'restore', session: latest.state })
          queue.current = []
          setSync('error')
          setSyncError(
            'Another tab changed this workspace. The latest version is shown; your pending changes were not saved. Review it before trying again.',
          )
          return
        }
        if ([400, 401, 403].includes(response.status)) {
          queue.current = []
          setSync('error')
          setSyncError(
            response.status === 401
              ? 'Your session ended. Reload and sign in again to save changes.'
              : 'This change was not saved. Reload the workspace and try again.',
          )
          return
        }
        if (!response.ok) throw new Error('Save failed')
        const latest = (await response.json()) as SavedWorkspace
        revision.current = latest.revision
        localDispatch({ type: 'restore', session: latest.state })
        queue.current.shift()
      }
      setSync('saved')
    } catch {
      paused.current = true
      setSync('error')
      setSyncError(
        'Connection interrupted. Your latest changes are not confirmed saved. Keep this tab open and retry.',
      )
      setCanRetry(true)
    } finally {
      running.current = false
    }
  }, [ownerId])

  const dispatch = useCallback(
    (action: SessionAction) => {
      if (!saved) {
        localDispatch(action)
        return
      }
      if (action.type === 'restore') return
      queue.current.push({ action, requestId: crypto.randomUUID() })
      void flush()
    },
    [saved, flush],
  )

  const retry = () => {
    paused.current = false
    void flush()
  }
  return { session, dispatch, storageWarning, sync, syncError, canRetry, retry }
}
