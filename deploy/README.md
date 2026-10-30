# Self-hosting Aether

This deployment runs one Next.js server, a mail worker, and Caddy. SQLite uses a persistent Docker volume. It is intended for a single host; do not scale web replicas or put the database on a network filesystem. Plan a database migration before scaling across hosts.

## Set up a host

Use a supported Linux host with Docker Engine and Compose, a domain pointing to its public IP, and ports 80/443 available. A transactional SMTP account must support authenticated TLS on port 465 or STARTTLS on port 587. Set the sender domain's SPF/DKIM/DMARC records with that provider. No cloud account is bundled with the repository.

Clone the repository and check out the release you intend to run. Generate unique secrets with Node.js 24, locally or on the host:

```sh
npm run setup:deployment -- health.your-domain.com
```

Edit `.env.production` to set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. Use a sender address verified with your provider. Quote values containing `#`, spaces, or `$` according to Docker Compose env-file syntax. Keep the file outside version control and restrict access to the host operator. Do not copy `.env.local` from development.

```sh
docker compose up --build -d
docker compose ps
```

Caddy obtains HTTPS certificates for `AETHER_DOMAIN`. The web process validates configuration and runs idempotent database migrations before accepting requests. The worker begins after the web health check passes. Public signup requires email verification; loopback-only development bypass is disabled in Compose. A public hostname, working DNS, reachable certificate authority, and working SMTP are required to complete first signup.

Check `https://health.your-domain.com/api/health`, create a test account, receive its verification email, sign in, import a test report, and exercise password reset before inviting anyone. Confirm that reset invalidates the old session and that a second account cannot see the first account's records. The fictional demo is at `/demo`; it never seeds personal accounts.

## Persistence and keys

The `records` volume contains the database, including account identity, password hashes, sessions, rate limits, encrypted personal workspaces, and encrypted queued email payloads. Workspace encryption uses AES-256-GCM with a random nonce and an owner-bound context. It is server-side encryption, not end-to-end encryption. The operator has the key. Account identity and activity metadata are not encrypted by the application; protect the host disk and backups accordingly.

Keep `AETHER_DATA_KEY` separately in a password/secrets manager. Losing or replacing it makes existing records unreadable. There is no automatic key rotation. A failed decryption stops the read; it never silently creates an empty workspace. `BETTER_AUTH_SECRET` is a separate secret used for account authentication.

## Back up and rehearse a restore

The backup command uses SQLite's online backup API, so it includes committed WAL data, and runs an integrity check. It refuses to overwrite an existing file. Choose a new timestamped name each time:

```sh
docker compose exec web npm run backup -- /data/backup-2026-10-30.sqlite
docker compose cp web:/data/backup-2026-10-30.sqlite ./backup-2026-10-30.sqlite
```

Copy the backup to encrypted off-host storage with an explicit retention schedule. The temporary copy in the `records` volume is not off-host protection. Back up the matching data key separately. The application does not automatically schedule backups or purge your backup storage.

To restore, stop the web and mail services and take an operator snapshot of the current volume first. Use a **new empty volume** with the backup at `/data/aether.sqlite`, owned by UID/GID 1000, and the original data key. Do not overwrite a live database or mix a restored main file with old `-wal`/`-shm` files. Start a restricted test deployment first, confirm `PRAGMA integrity_check`, decrypt a test workspace, and verify signin, import, export, and deletion before switching production traffic. A filesystem integrity check alone does not prove a usable recovery.

## Mail and operations

Account email is queued durably and encrypted. The worker claims one job at a time, retries with backoff up to eight times, and discards links after an hour. Successful delivery removes the queued payload. SMTP acceptance does not guarantee inbox delivery; monitor provider delivery and bounce information. A crash after SMTP acceptance can cause a duplicate email on retry; links remain single-use where applicable. The worker does not log email addresses, message bodies, reset links, or provider responses. Check `docker compose logs mail` for delivery failures. No automated paging is configured.

The health endpoint checks the database schema and key format. It does not verify SMTP delivery, off-host backups, disk capacity, TLS expiry, or the ability to decrypt every workspace. Configure monitoring for those separately. Only Caddy publishes host ports; forwarded client IPs are replaced by Caddy before reaching authentication rate limits. Do not expose the web port directly. Access logs containing verification URLs or health data should not be enabled.

Stop services before maintenance that changes the data key or database schema. Back up before upgrades. Build and deploy a reviewed commit, and retain the previous image and a matching backup for rollback. Do not run two releases against the same database during a migration.

## Before inviting users

Publish the operator's name, contact process, hosting region, retention/deletion policy, and applicable terms. The built-in data page explains application behavior but is not a jurisdiction-specific legal policy. Workspace deletion removes live contents and old activity, preserving a revision/deletion receipt; account deletion removes account-owned records and sessions. Backups and user downloads require their own retention and erasure procedures.

This release supports adult self-managed record organization and visit preparation. It does not offer caregiver delegation, clinical sign-off, emergency response, diagnosis, prescribing, appointment booking, PDF/OCR ingestion, or clinical integrations. Deployment configuration is not a compliance certification or a substitute for review of your real operating environment.

Implementation references: [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Better Auth email verification](https://better-auth.com/docs/concepts/email).
