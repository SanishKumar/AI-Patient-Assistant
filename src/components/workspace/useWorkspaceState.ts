'use client'
import { useEffect, useReducer } from 'react'
import { emptySession, restoreSession, sessionReducer } from '@/lib/records/demo-session'
const storageKey = 'aether.synthetic-workspace.v1'
export function useWorkspaceState() {
  const [session, dispatch] = useReducer(sessionReducer, emptySession)
  const [ready, finishHydration] = useReducer(() => true, false)
  const [storageWarning, reportStorageWarning] = useReducer(() => true, false)
  useEffect(() => {
    try {
      dispatch({ type: 'restore', session: restoreSession(sessionStorage.getItem(storageKey)) })
    } catch {
      reportStorageWarning()
    }
    finishHydration()
  }, [])
  useEffect(() => {
    if (!ready) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, ...session }))
    } catch {
      reportStorageWarning()
    }
  }, [session, ready])
  return { session, dispatch, storageWarning }
}
