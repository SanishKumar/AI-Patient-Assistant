import { workspaceSession } from '@/lib/server/auth'
import { getDatabase } from '@/lib/server/database'
import { exportWorkspace } from '@/lib/server/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  const session = await workspaceSession(request.headers)
  if (!session)
    return Response.json({ error: 'Sign in to export your workspace.' }, { status: 401, headers })
  if (request.headers.get('x-workspace-owner') !== session.user.id)
    return Response.json(
      { error: 'The account changed. Reload before exporting.' },
      { status: 403, headers },
    )
  return Response.json(exportWorkspace(getDatabase(), session.user.id), {
    headers: { ...headers, 'Content-Disposition': 'attachment; filename="aether-workspace.json"' },
  })
}
