import { isAbsolute } from 'node:path'
import { vaultKey } from '../lib/server/vault.mjs'
import { mailConfigured } from '../lib/server/mail.mjs'

vaultKey()
const origin = new URL(process.env.BETTER_AUTH_URL || '')
if (origin.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  throw new Error('A public HTTPS origin is required')
if (origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash)
  throw new Error('Use an origin without a path or credentials')
if ((process.env.BETTER_AUTH_SECRET?.length ?? 0) < 32)
  throw new Error('Set a strong BETTER_AUTH_SECRET')
if (process.env.AETHER_LOCAL_ACCOUNTS === '1')
  throw new Error('Disable local account bypass before deployment')
if (process.env.AETHER_PUBLIC_ACCOUNTS !== '1')
  throw new Error('Explicitly enable public accounts for this deployment')
if (!mailConfigured()) throw new Error('Configure SMTP for verification and recovery')
if (!['465', '587'].includes(process.env.SMTP_PORT || '587'))
  throw new Error('Use SMTP over TLS on port 465 or STARTTLS on port 587')
if (!process.env.AETHER_DATABASE_PATH || !isAbsolute(process.env.AETHER_DATABASE_PATH))
  throw new Error('Set an absolute database path on persistent storage')
console.log('Deployment configuration passed validation.')
