import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ArrowRight, FileText, Link2, ListChecks } from 'lucide-react'
import { workspaceSession } from '@/lib/server/auth'
export const dynamic = 'force-dynamic'
export default async function Home() {
  if (await workspaceSession(await headers())) redirect('/workspace')
  return (
    <div className="landing-page">
      <header className="product-header">
        <Link href="/" className="auth-brand">
          aether<span>HEALTH</span>
        </Link>
        <Link className="button button-outline" href="/login">
          Sign in <ArrowRight size={16} />
        </Link>
      </header>
      <main>
        <section className="landing-hero">
          <div>
            <span className="eyebrow">YOUR HEALTH STORY, WITH THE CONTEXT ATTACHED</span>
            <h1>
              All the pieces.
              <br />
              <em>A little more peace.</em>
            </h1>
            <p>
              A personal space for your lab records, your observations, and the questions you want
              to bring to your next visit.
            </p>
            <div className="welcome-actions">
              <Link className="button button-primary" href="/login">
                Start your own space <ArrowRight size={17} />
              </Link>
              <Link className="text-link" href="/demo">
                Explore the demo <ArrowRight size={17} />
              </Link>
            </div>
            <small>Your space starts empty. You decide what belongs.</small>
          </div>
          <div className="landing-art" aria-hidden="true">
            <div className="landing-disc" />
            <div className="floating-source">
              <FileText size={23} />
              <div>
                <strong>The original report</strong>
                <span>Every detail has a beginning.</span>
              </div>
            </div>
            <div className="floating-link">
              <Link2 size={23} />
            </div>
            <div className="floating-brief">
              <ListChecks size={24} />
              <strong>Your next conversation</strong>
              <span>Notes. Questions. A clearer picture.</span>
            </div>
            <span className="landing-art-label">CONNECTED, BY YOU.</span>
          </div>
        </section>
        <section className="landing-features" aria-label="What you can do">
          <article>
            <span>01 / COLLECT</span>
            <h2>A home for the details.</h2>
            <p>
              Import supported lab CSVs and keep your own journal. Your original source stays
              attached to each reading.
            </p>
          </article>
          <article>
            <span>02 / UNDERSTAND</span>
            <h2>Follow the evidence.</h2>
            <p>
              Compare matching measurements over time. Open the exact source, including its units
              and method.
            </p>
          </article>
          <article>
            <span>03 / PREPARE</span>
            <h2>Walk in with questions.</h2>
            <p>
              Plan your visit and download a brief with your questions, journal entries, and record
              references.
            </p>
          </article>
        </section>
        <section className="landing-boundary">
          <h2>Built for a better conversation.</h2>
          <p>
            Aether organizes what you add. It does not diagnose, prescribe, verify clinical
            accuracy, or book appointments. You stay in control of what you save, export, and
            delete.
          </p>
          <Link href="/privacy">
            How your data is handled <ArrowRight size={15} />
          </Link>
        </section>
      </main>
      <footer className="personal-footer">
        <span>Aether Health</span>
        <Link href="/privacy">Data & privacy</Link>
        <Link href="/demo">Fictional demo</Link>
      </footer>
    </div>
  )
}
