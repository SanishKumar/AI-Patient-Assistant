import type { buildPersonalBrief } from '@/lib/records/personal-brief'
import styles from './VisitBriefDialog.module.css'

export function VisitBriefPaper({
  brief,
  fullPage = false,
}: {
  brief: ReturnType<typeof buildPersonalBrief>
  fullPage?: boolean
}) {
  return (
    <article
      className={`${styles.paper} ${fullPage ? styles.fullPage : ''}`}
      aria-label="Brief preview"
      tabIndex={0}
    >
      {brief.sections.length ? (
        <>
          <header>
            <h3>{brief.title}</h3>
            <p>{brief.byline}</p>
            <p>{brief.context}</p>
          </header>
          {brief.sections.map((section) => (
            <section key={section.title}>
              <h4>{section.title}</h4>
              {section.entries.map((entry, i) => (
                <p key={i}>{entry}</p>
              ))}
            </section>
          ))}
        </>
      ) : (
        <p className={styles.empty}>Select something to include in your brief.</p>
      )}
    </article>
  )
}
