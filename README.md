# Aether Health

A personal health record workspace: keep original sources, trace measurements, write a journal, and prepare for a better conversation with your clinician.

## What works

- Personal accounts start empty. The fictional demo at `/demo` is completely separate.
- Import your own supported lab CSVs, review values, and inspect exact source lines and original file fingerprints.
- Keep self-reported journal entries, dated separately from when you saved them.
- Search your records, explore historical snapshots, and compare measurements with matching units and methods.
- Save a visit plan, add questions with optional source links, and download a brief with your actual records and notes.
- Export workspace data, delete individual records, erase the workspace, or delete the account.
- Public accounts use email verification and password recovery. Password reset revokes existing sessions.

The product organizes user-supplied information; it does not diagnose, prescribe, verify clinical accuracy, sign clinician notes, or book appointments. PDF/image uploads, OCR, caregiver sharing, cloud integrations, and model-generated answers are not implemented. The retired clinical chat endpoint remains disabled.

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

## Supported CSV format

```csv
date,provider,author,metric,value,unit,method
2026-10-27,Example Laboratory,Laboratory team,hba1c,6.7,%,HPLC
2026-10-27,Example Laboratory,Laboratory team,ldl,101,mg/dL,Direct assay
```

Each file represents one report: the date, provider, and author must match. Include one HbA1c (`hba1c`) and/or LDL (`ldl`) value. HbA1c accepts `%` or `mmol/mol`; LDL accepts `mg/dL` or `mmol/L`. Supply explicit units and methods. Files must be UTF-8, at most 16 KB and 50 physical lines. A workspace holds up to 100 records, including journal entries. Formulas, multiline CSV fields, invalid dates, and duplicate measurements are rejected. Importing the same contents twice does not create another record.

Files are checked in the browser, then independently parsed on the server. An import is always unreviewed. The original decoded text, line endings, SHA-256 fingerprint, and line references stay attached. The fingerprint identifies contents, not authenticity. Charts plot up to six recent readings with matching units and methods; other readings remain accessible as sources. No units are silently converted. Import does not establish patient identity or clinical accuracy; the owner confirms that each file belongs to them.

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
