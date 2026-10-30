import { existsSync, appendFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'

const envPath = resolve('.env.local')
if (!existsSync(envPath)) {
  writeFileSync(
    envPath,
    [
      'BETTER_AUTH_URL=http://127.0.0.1:3000',
      `BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}`,
      'AETHER_DATABASE_PATH=.data/aether.sqlite',
      'AETHER_LOCAL_ACCOUNTS=1',
      '',
    ].join('\n'),
    { flag: 'wx', mode: 0o600 },
  )
}
process.loadEnvFile(envPath)
if (!process.env.AETHER_DATA_KEY) {
  const key = randomBytes(32).toString('base64')
  appendFileSync(envPath, `\nAETHER_DATA_KEY=${key}\n`)
  process.env.AETHER_DATA_KEY = key
}
await import('./migrate.mjs')
console.log(
  'Local development is ready at http://127.0.0.1:3000. Email verification is bypassed locally; use test data.',
)
