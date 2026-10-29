import { authConfigured, getAuth } from '@/lib/server/auth'
import { getDatabase } from '@/lib/server/database'
import {
  applyWorkspaceCommand,
  commandSchema,
  readWorkspace,
  RevisionConflict,
  WorkspaceInputError,
} from '@/lib/server/workspaces'
import { ImportValidationError } from '@/lib/records/import-csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'no-store' }

async function identify(request: Request) {
  if (!authConfigured()) return null
  return (await getAuth().api.getSession({ headers: request.headers }))?.user.id ?? null
}

export async function GET(request: Request) {
  const userId = await identify(request)
  if (!userId)
    return Response.json(
      { error: 'Sign in to open your saved workspace.' },
      { status: 401, headers: noStore },
    )
  return Response.json(readWorkspace(getDatabase(), userId), { headers: noStore })
}

export async function POST(request: Request) {
  const userId = await identify(request)
  if (!userId)
    return Response.json({ error: 'Sign in to save changes.' }, { status: 401, headers: noStore })
  // A tab opened under another account must never write into the current account.
  if (request.headers.get('x-workspace-owner') !== userId)
    return Response.json(
      { error: 'The account changed. Reload before saving.' },
      { status: 403, headers: noStore },
    )
  const origin = request.headers.get('origin')
  const allowedOrigin = new URL(process.env.BETTER_AUTH_URL!).origin
  if (origin !== allowedOrigin)
    return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers: noStore })
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return Response.json({ error: 'JSON required.' }, { status: 415, headers: noStore })
  // Bound the stream rather than trusting a caller-controlled Content-Length header.
  const reader = request.body?.getReader()
  if (!reader)
    return Response.json({ error: 'Request body required.' }, { status: 400, headers: noStore })
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 32 * 1024) {
      await reader.cancel()
      return Response.json({ error: 'Request too large.' }, { status: 413, headers: noStore })
    }
    chunks.push(value)
  }
  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400, headers: noStore })
  }
  const result = commandSchema.safeParse(body)
  if (!result.success)
    return Response.json({ error: 'Invalid workspace command.' }, { status: 400, headers: noStore })
  try {
    return Response.json(applyWorkspaceCommand(getDatabase(), userId, result.data), {
      headers: noStore,
    })
  } catch (error) {
    if (error instanceof ImportValidationError)
      return Response.json(
        { error: error.message, issues: error.issues },
        { status: 422, headers: noStore },
      )
    if (error instanceof WorkspaceInputError)
      return Response.json({ error: error.message }, { status: 422, headers: noStore })
    if (error instanceof RevisionConflict)
      return Response.json(
        { error: error.message, ...readWorkspace(getDatabase(), userId) },
        { status: 409, headers: noStore },
      )
    return Response.json(
      { error: 'Could not save this change. Please try again.' },
      { status: 500, headers: noStore },
    )
  }
}
