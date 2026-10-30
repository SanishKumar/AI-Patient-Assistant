import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/workspace/AuthForm'
import { authConfigured, localAccountsEnabled, workspaceSession } from '@/lib/server/auth'
import { mailConfigured } from '@/lib/server/mail.mjs'
export const dynamic = 'force-dynamic'
export default async function LoginPage() {
  if (await workspaceSession(await headers())) redirect('/workspace')
  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/">
        aether<span>HEALTH</span>
      </Link>
      <AuthForm
        configured={authConfigured()}
        local={localAccountsEnabled()}
        mail={mailConfigured()}
      />
      <Link href="/demo">Take a look around the demo →</Link>
    </main>
  )
}
