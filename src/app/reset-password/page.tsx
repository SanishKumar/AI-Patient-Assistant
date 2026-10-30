import Link from 'next/link'
import { AuthForm } from '@/components/workspace/AuthForm'
import { authConfigured, localAccountsEnabled } from '@/lib/server/auth'
import { mailConfigured } from '@/lib/server/mail.mjs'
export const dynamic = 'force-dynamic'
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/">
        aether<span>HEALTH</span>
      </Link>
      {token ? (
        <AuthForm
          configured={authConfigured()}
          local={localAccountsEnabled()}
          mail={mailConfigured()}
          resetToken={token}
        />
      ) : (
        <div className="auth-card">
          <h1>This link is incomplete.</h1>
          <p>Request a new password reset link from the sign-in page.</p>
          <Link href="/login">Return to sign in</Link>
        </div>
      )}
    </main>
  )
}
