# Aether Health

A personal health record workspace: keep original sources, trace measurements, write a journal, and prepare for a better conversation with your clinician.

## What works

- Personal accounts start empty. The fictional demo at `/demo` is completely separate.
- Import your own supported lab CSVs, review values, and inspect exact source lines and original file fingerprints.
- Upload PDF reports and PNG/JPEG images, browse their pages, download unchanged originals, and enter readings linked to the page you checked.
- Keep self-reported journal entries, dated separately from when you saved them.
- Keep a patient-reported medication and allergy list, link entries to owned records, and choose entries for a visit brief.
- Search your records, explore historical snapshots, and compare measurements with matching units and methods.
- Save a visit plan and questions, then choose which details, reports, and journal entries to bring. Preview the brief, print it, save a PDF through the browser, or download plain text.
- Record the outcome of an appointment, keep its original questions, and track follow-up steps with optional due dates.
- Create an expiring link to a selected visit brief, preview its saved copy, and revoke it from your account.
- Export workspace data, delete individual records, erase the workspace, or delete the account.
- Public accounts use email verification and password recovery. Password reset revokes existing sessions.

The product organizes user-supplied information; it does not diagnose, prescribe, verify clinical accuracy, sign clinician notes, or book appointments. Caregiver sharing, cloud integrations, and model-generated answers are not implemented. The retired clinical chat endpoint remains disabled.

## Run locally

Use Node.js 24:

```sh
npm ci
npm run setup:local
npm run dev
```

Open **http://127.0.0.1:3000**. The landing page links to sign-in and the separate demo. Local setup creates private `.env.local` secrets and a SQLite database in `.data/`; rerunning preserves existing data. Local account verification is intentionally bypassed on loopback only. Use test information in development. Email recovery requires a configured SMTP service and running mail worker.

```sh
npm run check
npm run build
npm run start
npm run test:e2e
```

Playwright needs Chromium (`npx playwright install chromium`). The suite covers desktop/mobile journeys, source anchors, demo separation, account isolation, interrupted and conflicting saves, export/deletion, and accessibility checks. Unit and integration tests exercise authenticated encryption, rollback, email verification, one-time reset links, session revocation, and mail retries. CI also builds and starts the deployment container. Automated checks do not establish clinical suitability or certify a deployment.

## Self-host

The repository includes Docker Compose with a web process, a durable email worker, Caddy HTTPS, persistent database storage, startup validation, migrations, and a consistent SQLite backup command. See [the deployment guide](deploy/README.md) for setup, SMTP, data keys, backups, restore rehearsals, and operating limits.

```sh
npm run setup:deployment -- health.your-domain.com
# Fill in the SMTP settings in .env.production.
docker compose up --build -d
```

This is a single-host deployment. Keep the database on persistent local storage, retain the data key separately, and configure protected off-host backups. Deployment requires your own domain, host, and SMTP provider. Publish operator details and retention terms before inviting users. The included privacy page explains application behavior; it is not a jurisdiction-specific legal policy or compliance certification.

## Original documents

Use **Upload a document** for PDFs, PNGs, and JPEGs up to 5 MiB each. PDFs may contain up to 20 pages; images are limited to 20 megapixels. Password-protected PDFs, forms, scripts, embedded attachments, and animated images are rejected. Validation checks signatures, parses the document, and decodes images in a separate process with a time limit and restricted inherited environment. This is resource-bounded validation, not an antivirus service or an OS sandbox.

Each workspace allows 50 MiB of original files within the shared 100-record limit. Identical file contents cannot be uploaded twice to the same workspace. The original bytes are encrypted separately from workspace metadata and included in SQLite backups. Deleting a record, erasing a workspace, or deleting an account removes its live original files transactionally.

The viewer renders PDF pages in the browser and supports selectable PDF text. You can enter one HbA1c, LDL, and systolic reading per document with explicit units and a source page. Choose **Include measurement method** to enter the method as printed. A reading with an unrecorded method stays separate in comparisons. Search covers titles, providers, and saved readings.

Choose **Read text on this page** on a scanned PDF, PNG, or JPEG to recognize printed English on your device. When a line contains one supported metric, number, and unit, **Use draft** opens an editable reading and highlights its source. Check the line and column headings before saving. Ambiguous lines, ranges, and other measurements stay available as text for manual review. The full transcript lives in memory until you leave the page or close the viewer. Saving a draft stores its source line and region with the checked value in the encrypted workspace. The visit brief identifies readings reviewed this way.

Download originals from their viewers. The workspace JSON export contains their metadata, fingerprints, and entered readings, but not the binary files.

## Supported CSV format

```csv
date,provider,author,metric,value,unit,method
2026-10-27,Example Laboratory,Laboratory team,hba1c,6.7,%,HPLC
2026-10-27,Example Laboratory,Laboratory team,ldl,101,mg/dL,Direct assay
```

Each file represents one report: the date, provider, and author must match. Include one HbA1c (`hba1c`) and/or LDL (`ldl`) value. HbA1c accepts `%` or `mmol/mol`; LDL accepts `mg/dL` or `mmol/L`. Supply explicit units and methods. Files must be UTF-8, at most 16 KB and 50 physical lines. A workspace holds up to 100 records, including journal entries. Formulas, multiline CSV fields, invalid dates, and duplicate measurements are rejected. Importing the same contents twice does not create another record.

Files are checked in the browser, then independently parsed on the server. An import is always unreviewed. The original decoded text, line endings, SHA-256 fingerprint, and line references stay attached. The fingerprint identifies contents, not authenticity. Charts plot up to six recent readings with matching units and methods; other readings remain accessible as sources. No units are silently converted. Import does not establish patient identity or clinical accuracy; the owner confirms that each file belongs to them.

## Bring a brief to a visit

In **Visit preparation**, choose **Build visit brief**. Each new brief starts with your saved visit details and questions. Reports and journal entries are opt-in. Selecting a report includes its saved readings and a numbered source reference. A report with no saved readings contributes its source reference only. Selecting a journal entry includes its full text.

The preview, printout, and text download use the same selection. Readings cite the original page or CSV line. Comparisons use selected reports with matching units and known methods. An omitted source is also omitted from comparisons and question references. Review your question text separately since it appears as written.

Choose **Print / save PDF** to open the browser’s print dialog or **Download text** for a plain-text copy. Closing the builder discards these choices. The account export under **My account** still contains the full workspace.

Choose **Share this brief** to create a link lasting one hour, 24 hours, or seven days. Review the preview and confirm the sharing choice. Anyone who holds the link can read and save that fixed copy. Its content stays as it was when shared. Original files are downloaded separately from the private workspace.

Open **Shared briefs** in Visit preparation to copy a link, view its saved copy, check when it was last accessed, or revoke it. Access checks also update the access time. Deleting a selected record, question, past visit, medication, or allergy concern revokes the affected links. Workspace erasure and account deletion disable all its links. Downloads, recipient copies, and backups have their own retention. A local installation produces links reachable on that computer. Sharing across devices requires the public self-hosted installation.

Shared snapshots and their tokens are encrypted on the server. Tokens travel in the URL fragment and in the body of an explicit request to open the brief. Link pages and responses use no-store caching and no-referrer headers. Each account can hold ten active links, with up to 256 KiB of text per snapshot. Expiry stops access immediately, and encrypted contents are cleared on subsequent share operations. Minimal request receipts prevent retries from reviving revoked links.

## After an appointment

Choose **Past visits → Record a visit** to enter the actual visit date, your notes, and up to 12 personal follow-up steps. To finish your current plan, select **Move my current plan and questions into this visit**. Its details and questions go into the history entry together. You can choose which questions also carry into your next plan. You can also record an unrelated past appointment while keeping a future visit in preparation.

Overview shows the first three open steps, with dated items first. Expand the list to see every open step across appointments. Open a past visit to edit your notes and steps, mark a step complete, reopen it, or delete the entry. Due dates appear in your workspace. Each workspace holds up to 100 past visits. In the brief builder, choosing a past visit includes its date, clinic, notes, and step statuses. Each new brief starts with past visits unselected.

Choose **Export calendar dates** in Visit preparation, Past visits, or the Overview follow-up list. Select your saved visit date and open steps with due dates, then download the calendar file and import it into your calendar app. The entries cover whole days and leave those days available. Add an appointment time in your calendar when needed.

The preview starts with generic titles. **Include names and details** adds the selected clinic, location, saved local visit time, visit reason, or follow-up text. Calendar providers and anyone with calendar access may see those details. **Request a reminder at 9am the day before** adds a display alarm request. Review notification settings in the calendar receiving the file.

Update or remove imported copies after rescheduling a visit, editing a step, or marking it complete. Calendar apps handle repeated imports differently. The export preserves each item's identifier across edits, while a fresh visit plan gets a new identifier. The file format follows [iCalendar](https://www.rfc-editor.org/rfc/rfc5545.html).

## Medications and allergy concerns

Open **Medications & allergies** to add medications with directions as written and a usage status of Taking, Not taking, or Unsure. New medication entries start as Unsure. Allergy concerns hold a substance or medicine and an optional reaction. Each list holds up to 50 entries. Names, directions, reactions, and statuses are entered by the patient, with a last-updated date and an optional linked record.

Choose individual entries in the visit brief builder to include them. Each new brief starts with both lists unselected. Include a linked record separately to add its numbered reference. Existing shared copies keep the selected content and update dates from when the link was created. Deleting an entry revokes links containing it. Removing a linked source detaches the link and preserves the patient's entry text.

## Storage and ownership

Every private read/write requires a session. Public sessions must have a verified email. Mutations check origin, account identity, expected revision, and a unique request ID. Retried requests are idempotent; state and activity commit together. Conflicts return the current version instead of silently overwriting another tab.

Personal workspace payloads are encrypted using AES-256-GCM, with an owner-bound context and random nonce. The server holds the key, so this is not end-to-end encryption. Account identity and action metadata remain readable to the operator. Queued account email is encrypted and processed with retries. Source text, questions, and mail contents are kept out of action metadata and worker logs.

Account-based synthetic preview data from earlier versions stays in the old tables and is excluded from personal workspaces. Owners can retrieve it in a workspace export under `retiredSyntheticPreview`; workspace erasure and account deletion remove it. Anonymous demo storage remains local to its browser tab.

Workspace erasure removes live content and previous activity but preserves a revision and deletion receipt against stale writes. Deleting a record detaches its question links, preserving question text. Account deletion cascades through owned records and sessions. User downloads and server backups require separate retention/erasure. JSON exports are not an automated restore format. SQLite backups must be paired with the original data key; see the restore procedure before relying on them.

## Structure

- `lib/records`: record contracts, import validation, personal workspace commands, comparisons, visit briefs, and isolated demo fixtures.
- `lib/server`: authentication, ownership, encrypted storage, and encrypted mail queue.
- `src/components/workspace`: personal workspace, account flows, and reusable source/timeline components.
- `migrations`: idempotent application schemas alongside Better Auth migrations.
- `scripts`: setup, deployment checks, mail worker, migrations, and backup.
- `deploy`: reverse proxy and operator documentation.
- `tests`: domain, authentication, persistence, and browser verification.

The legacy numeric patient routes return `404`; `/dashboard` redirects to the product entry point. The old unauthenticated clinical chat endpoint returns `503` without calling a model.
