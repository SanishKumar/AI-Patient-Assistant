import { getDatabase } from '@/lib/server/database'
import { vaultKey } from '@/lib/server/vault.mjs'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    vaultKey()
    getDatabase().prepare('SELECT user_id FROM personal_workspace LIMIT 1').get()
    getDatabase().prepare('SELECT id FROM record_document LIMIT 1').get()
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
