import { authConfigured, getAuth } from '@/lib/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(request: Request) {
  if (!authConfigured())
    return Response.json(
      { error: 'Accounts are not configured on this installation.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  return getAuth().handler(request)
}

export { handle as GET, handle as POST }
