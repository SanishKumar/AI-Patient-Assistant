import { workspaceSession } from '@/lib/server/auth'
import { getDatabase } from '@/lib/server/database'
import { allowWorkspaceWrite } from '@/lib/server/workspaces'
import { boundedJson, RequestBodyError } from '@/lib/server/bounded-json'
import {
  BriefShareError,
  createBriefShare,
  listBriefShares,
  revokeBriefShare,
} from '@/lib/server/brief-shares'
import { briefShareCommandSchema } from '@/lib/records/brief-sharing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

async function owner(request: Request) {
  const session = await workspaceSession(request.headers)
  if (!session) return null
  return session
}
export async function GET(request: Request) {
  const session = await owner(request)
  if (!session)
    return Response.json({ error: 'Sign in to manage shared briefs.' }, { status: 401, headers })
  if (request.headers.get('x-workspace-owner') !== session.user.id)
    return Response.json(
      { error: 'The account changed. Reload before continuing.' },
      { status: 403, headers },
    )
  return Response.json({ shares: listBriefShares(getDatabase(), session.user.id) }, { headers })
}
export async function POST(request: Request) {
  const session = await owner(request)
  if (!session)
    return Response.json({ error: 'Sign in to manage shared briefs.' }, { status: 401, headers })
  if (
    request.headers.get('x-workspace-owner') !== session.user.id ||
    request.headers.get('origin') !== new URL(process.env.BETTER_AUTH_URL!).origin
  )
    return Response.json(
      { error: 'Reload this workspace before continuing.' },
      { status: 403, headers },
    )
  if (!allowWorkspaceWrite(getDatabase(), session.user.id))
    return Response.json(
      { error: 'Too many changes. Wait a minute and retry.' },
      { status: 429, headers: { ...headers, 'Retry-After': '60' } },
    )
  try {
    const result = briefShareCommandSchema.safeParse(await boundedJson(request, 32 * 1024))
    if (!result.success)
      return Response.json({ error: 'Invalid brief sharing request.' }, { status: 400, headers })
    const command = result.data
    if (command.type === 'revoke') {
      revokeBriefShare(getDatabase(), session.user.id, command.id)
      return Response.json({ ok: true }, { headers })
    }
    return Response.json(
      { share: createBriefShare(getDatabase(), session.user, command) },
      { headers },
    )
  } catch (error) {
    if (error instanceof BriefShareError || error instanceof RequestBodyError)
      return Response.json({ error: error.message }, { status: error.status, headers })
    return Response.json(
      { error: 'Could not save this link. Keep this page open and retry.' },
      { status: 500, headers },
    )
  }
}
