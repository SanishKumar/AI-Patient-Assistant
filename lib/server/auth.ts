import { betterAuth } from 'better-auth'
import { getDatabase } from './database'

let instance: ReturnType<typeof createAuth> | undefined

export function authConfigured() {
  return Boolean(process.env.BETTER_AUTH_URL && (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32)
}

export function getAuth() {
  if (!authConfigured()) throw new Error('Account service is not configured')
  return (instance ??= createAuth())
}

function createAuth() {
  const baseURL = process.env.BETTER_AUTH_URL!
  const url = new URL(baseURL)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (!loopback && url.protocol !== 'https:') throw new Error('Public accounts require HTTPS')
  // Unverified signup is restricted to a deliberately enabled, loopback-only synthetic preview.
  const localAccounts = loopback && process.env.AETHER_LOCAL_ACCOUNTS === '1'
  return betterAuth({
    appName: 'Aether Health',
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: getDatabase(),
    trustedOrigins: [url.origin],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      disableSignUp: !localAccounts,
      requireEmailVerification: !localAccounts,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 10 },
      },
    },
    advanced: {
      useSecureCookies: url.protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
  })
}
