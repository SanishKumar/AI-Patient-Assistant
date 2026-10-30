import { existsSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const domain = process.argv[2]
if (
  !domain ||
  !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
)
  throw new Error('Usage: npm run setup:deployment -- health.your-domain.com')
if (existsSync('.env.production'))
  throw new Error('.env.production already exists; it will not be overwritten')
writeFileSync(
  '.env.production',
  [
    `AETHER_DOMAIN=${domain}`,
    `BETTER_AUTH_URL=https://${domain}`,
    `BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}`,
    `AETHER_DATA_KEY=${randomBytes(32).toString('base64')}`,
    'AETHER_DATABASE_PATH=/data/aether.sqlite',
    'AETHER_LOCAL_ACCOUNTS=0',
    'AETHER_PUBLIC_ACCOUNTS=1',
    'SMTP_HOST=',
    'SMTP_PORT=587',
    'SMTP_USER=',
    'SMTP_PASSWORD=',
    'SMTP_FROM=',
    '',
  ].join('\n'),
  { flag: 'wx', mode: 0o600 },
)
console.log(
  'Created .env.production with unique secrets. Fill in SMTP settings before starting. Keep this file private and back up the data key separately.',
)
