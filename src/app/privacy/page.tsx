import Link from 'next/link'
export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <Link className="auth-brand" href="/">
        aether<span>HEALTH</span>
      </Link>
      <article className="auth-card">
        <span className="eyebrow">DATA & PRIVACY</span>
        <h1>Know what you’re saving.</h1>
        <h2>What this installation stores</h2>
        <p>
          Your account stores your name, email address, a password hash, and sessions. Your
          workspace stores the records you import, original CSV text, encrypted PDF/image files,
          your page-linked readings, journal entries, visit details, questions, and action metadata.
          The separate demo uses fictional content stored in your browser tab.
        </p>
        <h2>Where it goes</h2>
        <p>
          Workspace contents are stored on the server running this installation, encrypted with its
          data key. This is server-side encryption; the server operator can decrypt the data.
          Account identity and action metadata are not encrypted by the application. Verification
          and recovery emails are sent through the operator’s SMTP provider. Records are not sent to
          a model, advertising service, or analytics provider.
        </p>
        <h2>Your controls</h2>
        <p>
          Open My account to export your workspace, erase its contents, or delete the account. The
          JSON export includes document details and readings; download original PDFs and images from
          each document viewer. Individual records can be deleted from the record library. Deleting
          a record removes its original file and links from questions while preserving the question
          text. Workspace erasure retains a revision and deletion receipt to reject stale writes.
          Account deletion removes saved workspaces and sessions.
        </p>
        <h2>Copies and backups</h2>
        <p>
          Downloads stay wherever you saved them. Server backups are managed by the operator and may
          retain deleted data until those backups expire. Ask the operator about their retention
          period, hosting location, and contact process before using an installation with sensitive
          information.
        </p>
        <h2>What records mean</h2>
        <p>
          Imported values, manually transcribed readings, and journal entries are not clinically
          verified. File fingerprints identify contents, not authenticity. Visit plans are personal
          notes, not bookings. The app is for organizing information and preparing conversations,
          and does not provide diagnosis or treatment.
        </p>
        <h2>For the operator</h2>
        <p>
          Before inviting users, publish your operator identity, contact information, retention
          policy, and applicable terms. Configure HTTPS, verified email, protected persistent
          storage, and tested backups. The source project does not certify a deployment’s legal
          compliance or clinical suitability.
        </p>
        <Link className="button button-primary" href="/workspace">
          Back to your space
        </Link>
      </article>
    </main>
  )
}
