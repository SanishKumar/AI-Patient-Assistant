import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { workspaceSession, localAccountsEnabled } from '@/lib/server/auth'
import { getDatabase } from '@/lib/server/database'
import { readWorkspace } from '@/lib/server/workspaces'
import { PersonalWorkspace } from '@/components/workspace/PersonalWorkspace'
export const dynamic = 'force-dynamic'
export default async function WorkspacePage() {
  const session = await workspaceSession(await headers())
  if (!session) redirect('/login')
  return (
    <PersonalWorkspace
      viewer={{ id: session.user.id, name: session.user.name, email: session.user.email }}
      saved={readWorkspace(getDatabase(), session.user.id)}
      local={localAccountsEnabled()}
    />
  )
}
