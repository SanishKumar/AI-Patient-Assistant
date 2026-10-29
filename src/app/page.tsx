import { HealthWorkspace } from '@/components/workspace/HealthWorkspace'
import { headers } from 'next/headers'
import { authConfigured, getAuth } from '@/lib/server/auth'
import { getDatabase } from '@/lib/server/database'
import { readWorkspace } from '@/lib/server/workspaces'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const configured = authConfigured()
  const session = configured ? await getAuth().api.getSession({ headers: await headers() }) : null
  return (
    <HealthWorkspace
      accountsEnabled={configured}
      viewer={
        session
          ? { id: session.user.id, name: session.user.name, email: session.user.email }
          : undefined
      }
      saved={session ? readWorkspace(getDatabase(), session.user.id) : undefined}
    />
  )
}
