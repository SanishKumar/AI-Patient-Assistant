import { getDatabase } from '@/lib/server/database'
import { boundedJson, RequestBodyError } from '@/lib/server/bounded-json'
import { allowSharedBriefRead, readSharedBrief } from '@/lib/server/brief-shares'
import { sharedBriefRequestSchema } from '@/lib/records/brief-sharing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(process.env.BETTER_AUTH_URL!).origin)
    return Response.json(
      { error: 'Open the brief from this installation.' },
      { status: 403, headers },
    )
  try {
    const result = sharedBriefRequestSchema.safeParse(await boundedJson(request, 2048))
    if (!allowSharedBriefRead(getDatabase(), result.success ? result.data.token : undefined))
      return Response.json(
        { error: 'Brief access is busy. Wait a minute and retry.' },
        { status: 429, headers: { ...headers, 'Retry-After': '60' } },
      )
    const shared = result.success ? readSharedBrief(getDatabase(), result.data.token) : null
    if (!shared)
      return Response.json(
        { error: 'This link is unavailable. Ask the patient for a new brief.' },
        { status: 404, headers },
      )
    return Response.json(shared, { headers })
  } catch (error) {
    if (error instanceof RequestBodyError)
      return Response.json({ error: error.message }, { status: error.status, headers })
    return Response.json(
      { error: 'Could not open this brief. Please retry.' },
      { status: 503, headers },
    )
  }
}
