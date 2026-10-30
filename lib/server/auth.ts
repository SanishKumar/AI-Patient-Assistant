import { betterAuth } from 'better-auth'
import { getDatabase } from './database'
import { enqueueMail, mailConfigured } from './mail.mjs'
import { vaultKey } from './vault.mjs'

let instance: ReturnType<typeof createAuth> | undefined

export function authConfigured() {
  return Boolean(
    process.env.BETTER_AUTH_URL &&
    process.env.AETHER_DATA_KEY &&
    (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32,
  )
}

export function localAccountsEnabled() {
  const url = new URL(process.env.BETTER_AUTH_URL || 'https://unconfigured.invalid')
  return (
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    process.env.AETHER_LOCAL_ACCOUNTS === '1'
  )
}

export async function workspaceSession(headers: Headers) {
  if (!authConfigured()) return null
  const session = await getAuth().api.getSession({ headers })
  return session && (localAccountsEnabled() || session.user.emailVerified) ? session : null
}

export function getAuth() {
  if (!authConfigured()) throw new Error('Account service is not configured')
  return (instance ??= createAuth())
}

export function createAuth(database = getDatabase()) {
  const baseURL = process.env.BETTER_AUTH_URL!
  const url = new URL(baseURL)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (!loopback && url.protocol !== 'https:') throw new Error('Public accounts require HTTPS')
  vaultKey()
  const localAccounts = localAccountsEnabled()
  const publicAccounts = process.env.AETHER_PUBLIC_ACCOUNTS === '1'
  if (publicAccounts && (loopback || !mailConfigured()))
    throw new Error('Public accounts require a public HTTPS origin and SMTP configuration')
  return betterAuth({
    appName: 'Aether Health',
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    database,
    trustedOrigins: [url.origin],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      disableSignUp: !(localAccounts || publicAccounts),
      requireEmailVerification: !localAccounts,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        if (!mailConfigured()) throw new Error('Email delivery is not configured')
        enqueueMail(
          database,
          user.email,
          'Reset your Aether password',
          `Reset your password using this link within one hour:\n\n${url}\n\nIf you did not request this, ignore this email.`,
        )
      },
    },
    emailVerification: {
      sendOnSignUp: !localAccounts,
      sendOnSignIn: !localAccounts,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        if (!mailConfigured()) throw new Error('Email delivery is not configured')
        enqueueMail(
          database,
          user.email,
          'Verify your Aether email',
          `Verify your email address using this link within one hour:\n\n${url}\n\nIf you did not create an account, ignore this email.`,
        )
      },
    },
    user: { deleteUser: { enabled: true } },
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
        '/request-password-reset': { window: 60, max: 3 },
        '/send-verification-email': { window: 60, max: 3 },
        '/delete-user': { window: 60, max: 3 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
      useSecureCookies: url.protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
  })
}
