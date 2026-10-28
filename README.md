# Aether Health

A connected health record workspace built around one question: what changed, and where did that information come from?

This version is an interactive **synthetic-data preview**. Every patient, provider, measurement, document, and appointment in the workspace is fictional. It is not ready for real patient information or clinical use.

## Explore the workspace

- Compare recorded measurements and open the exact source line behind each result.
- Move through historical snapshots that distinguish event dates from record arrival dates.
- Inspect conflicting allergy histories without silently replacing either entry.
- Search and filter the original record text.
- Add a sample vitals note, keeping its review status visible.
- Prepare and export a visit brief with questions, source references, and unresolved information.

Sample additions and questions use browser-tab session storage. They survive reloads in that tab and can be cleared with **About this preview → Reset sample workspace**. This is not server persistence, authentication, consent enforcement, or an audit ledger. Source verification badges describe the fictional scenario, not real clinical sign-off.

## Run locally

Use Node.js 22.12 or later; Node.js 24 is recommended for this project.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. No API key, database, or external account is required. Development and production builds use Webpack because the Turbopack CSS worker failed to initialize in the tested Windows environment.

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

The browser suite exercises desktop and mobile layouts, source anchors, historical visibility, conflict review, sample import, reload persistence, export contents, keyboard focus, and automated accessibility checks. Automated accessibility checks do not replace a manual accessibility review.

## Project structure

- `lib/records`: typed source records, synthetic fixtures, historical projections, comparisons, and demo-session transitions.
- `src/components/workspace`: overview, timeline, source viewer, record library, and visit preparation.
- `tests/lib`: record integrity and state-transition tests.
- `tests/playwright`: browser workflows and accessibility checks.

The old unauthenticated clinical chat endpoint returns `503` and never calls a model. Numeric patient URLs return `404`; the prototype's file-based patient storage has been retired. `/dashboard` redirects to the workspace.

Real uploads, OCR, model-generated answers, clinician signing, account management, cross-device storage, sharing, scheduling, and clinical integrations are not implemented in this preview.
