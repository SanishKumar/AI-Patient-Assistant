# Aether Health

A connected health record workspace built around one question: what changed, and where did that information come from?

This version is an interactive **synthetic-data preview**. Every patient, provider, measurement, document, and appointment in the workspace is fictional. It is not ready for real patient information or clinical use.

## Explore the workspace

- Compare recorded measurements and open the exact source line behind each result.
- Explore a clickable source map ordered by record date.
- Move through historical snapshots that distinguish event dates from record arrival dates.
- Inspect conflicting allergy histories without silently replacing either entry.
- Search and filter the original record text.
- Add a sample vitals note, keeping its review status visible.
- Prepare and export a visit brief with questions, source references, and unresolved information.

Guests can explore without an account. Their changes use browser-tab session storage and survive reloads in that tab. A local account opens a separate saved workspace with sample additions, visit questions, and review progress stored on the server. Guest changes are not copied into an account automatically.

Every workspace read and write checks the authenticated session. Writes also check the expected account and revision, so switching accounts or editing from another tab cannot silently overwrite a workspace. Retried requests are idempotent; workspace state and action metadata commit in one transaction. Source verification badges describe the fictional scenario, not real clinical sign-off.

## Run locally

Use Node.js 22.12 or later; Node.js 24 is recommended for this project.

```sh
npm ci
npm run setup:local
npm run dev
```

Open **http://127.0.0.1:3000**. Use this exact origin for local account cookies and save requests. No external service or API key is required. `setup:local` creates a random authentication secret in `.env.local`, initializes Better Auth's tables, and applies the workspace schema to `.data/aether.sqlite`. Rerunning it preserves existing configuration and saved workspaces. Both files are ignored by Git.

Development and production builds use Webpack because the Turbopack CSS worker failed to initialize in the tested Windows environment. Without account configuration, the guest preview remains available.

The local account flow includes email/password registration, sign-in, and sign-out. Passwords require at least 12 characters and are hashed by Better Auth. Signup without email verification requires explicit local-preview configuration and a loopback base URL. Email delivery, verification, and password recovery are not configured. Keep accounts and record content fictional.

SQLite persistence is for a single local server. Do not deploy this configuration to ephemeral or shared hosting, or use it as a patient vault. Public deployment still needs a production data-storage and backup strategy, email verification/recovery, access-policy review, and operational security work. Changing `BETTER_AUTH_URL` alone does not complete that work.

```sh
npm run check
npm run build
npm run start
```

## Browser checks

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

The browser suite exercises desktop and mobile layouts, source anchors, historical visibility, conflict review, sample import, guest/account separation, account isolation, interrupted saves, conflicting writes, export contents, keyboard focus, and automated accessibility checks. Account checks create fictional users on the test server. Automated accessibility checks do not replace a manual accessibility review.

## Project structure

- `lib/records`: typed source records, synthetic fixtures, historical projections, comparisons, and demo-session transitions.
- `lib/server`: session configuration, database access, and account-scoped workspace commands.
- `migrations`: the workspace schema, applied by `scripts/setup-local.mjs` alongside Better Auth's migrations.
- `src/components/workspace`: overview, timeline, source viewer, record library, and visit preparation.
- `tests/lib`: record integrity and state-transition tests.
- `tests/playwright`: browser workflows and accessibility checks.

The old unauthenticated clinical chat endpoint returns `503` and never calls a model. Numeric patient URLs return `404`; the prototype's file-based patient storage has been retired. `/dashboard` redirects to the workspace.

Real uploads, OCR, model-generated answers, clinician signing, account recovery/deletion, cloud synchronization, sharing, scheduling, and clinical integrations are not implemented in this preview. The activity table records local action metadata; it is not a tamper-evident clinical audit system.
