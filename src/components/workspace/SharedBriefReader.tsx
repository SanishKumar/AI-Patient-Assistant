'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, Printer } from 'lucide-react'
import { briefText } from '@/lib/records/personal-brief'
import type { SharedBrief } from '@/lib/records/brief-sharing'
import { VisitBriefPaper } from './VisitBriefPaper'
import { downloadText } from './downloads'
import styles from './BriefSharing.module.css'
import paperStyles from './VisitBriefDialog.module.css'

export function SharedBriefReader() {
  const [data, setData] = useState<{ brief: SharedBrief; expiresAt: string }>()
  const [status, setStatus] = useState<'ready' | 'loading' | 'unavailable' | 'retry'>('ready')
  const started = useRef(false)
  const running = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    const counter = generation
    return () => {
      counter.current++
    }
  }, [])
  const load = useCallback(async () => {
    if (running.current) return
    started.current = true
    running.current = true
    const current = ++generation.current
    setData(undefined)
    setStatus('loading')
    try {
      const response = await fetch('/api/shared-brief', {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: window.location.hash.slice(1) }),
        signal: AbortSignal.timeout(15000),
      })
      if (current !== generation.current) return
      if (!response.ok) {
        setStatus(response.status === 404 ? 'unavailable' : 'retry')
        return
      }
      const body: { brief: SharedBrief; expiresAt: string } = await response.json()
      if (current !== generation.current) return
      if (Date.parse(body.expiresAt) <= Date.now()) {
        setStatus('unavailable')
        return
      }
      setData(body)
      setStatus('ready')
    } catch {
      if (current === generation.current) setStatus('retry')
    } finally {
      running.current = false
    }
  }, [])
  useEffect(() => {
    const refresh = () => {
      if (started.current && document.visibilityState === 'visible') void load()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    const interval = window.setInterval(refresh, 60000)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(interval)
    }
  }, [load])
  useEffect(() => {
    if (!data) return
    const timer = window.setTimeout(
      () => {
        generation.current++
        setData(undefined)
        setStatus('unavailable')
      },
      Math.max(0, Date.parse(data.expiresAt) - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [data])
  return (
    <main className={styles.reader}>
      <header>
        <Link className="auth-brand" href="/">
          aether<span>HEALTH</span>
        </Link>
        <h1>Shared visit brief</h1>
        {data && (
          <>
            <p>
              A copy prepared by the patient. Access expires{' '}
              {new Date(data.expiresAt).toLocaleString()}.
            </p>
            <div className={styles.actions}>
              <button className="button button-primary" onClick={() => window.print()}>
                <Printer size={16} /> Print / save PDF
              </button>
              <button
                className="button button-outline"
                onClick={() =>
                  downloadText(
                    briefText(data.brief),
                    'aether-shared-visit-brief.txt',
                    'text/plain;charset=utf-8',
                  )
                }
              >
                <Download size={16} /> Download text
              </button>
            </div>
          </>
        )}
      </header>
      {data ? (
        <div className={`${paperStyles.builder} ${styles.readerBody}`}>
          <VisitBriefPaper brief={data.brief} fullPage />
        </div>
      ) : (
        <section className={styles.readerState} aria-live="polite">
          {status === 'loading' ? (
            <p>Checking access…</p>
          ) : status === 'unavailable' ? (
            <p>This link is unavailable. Ask the person who shared it for a new link.</p>
          ) : status === 'retry' ? (
            <>
              <p>Access could not be checked. Try again when your connection is available.</p>
              <button className="button button-primary" onClick={() => void load()}>
                Check access again
              </button>
            </>
          ) : (
            <>
              <p>Open the copy selected by the person who sent you this link.</p>
              <button className="button button-primary" onClick={() => void load()}>
                Open shared brief
              </button>
              <p>Use the full link sent to you to open a brief.</p>
            </>
          )}
        </section>
      )}
    </main>
  )
}
