import { z } from 'zod'
import { workspaceSession } from '@/lib/server/auth'
import { getDatabase } from '@/lib/server/database'
import { readDocument } from '@/lib/server/documents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = (await workspaceSession(request.headers))?.user.id
  if (!userId)
    return Response.json({ error: 'Sign in to open this document.' }, { status: 401, headers })
  if (request.headers.get('x-workspace-owner') !== userId)
    return Response.json(
      { error: 'The account changed. Reload this workspace.' },
      { status: 403, headers },
    )
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: 'Document not found.' }, { status: 404, headers })
  try {
    const document = readDocument(getDatabase(), userId, id)
    if (!document) return Response.json({ error: 'Document not found.' }, { status: 404, headers })
    const { record, bytes } = document
    const filename = encodeURIComponent(record.source.label).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16)}`,
    )
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...headers,
        'Content-Type': record.source.document!.mediaType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="document"; filename*=UTF-8''${filename}`,
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    })
  } catch {
    return Response.json(
      { error: 'This document could not be opened. Please retry.' },
      { status: 500, headers },
    )
  }
}
