import { workspaceSession } from '@/lib/server/auth'
import { getDatabase } from '@/lib/server/database'
import {
  allowWorkspaceWrite,
  readWorkspace,
  RevisionConflict,
  WorkspaceInputError,
} from '@/lib/server/workspaces'
import { documentUploadSchema, MAX_DOCUMENT_BYTES } from '@/lib/records/documents'
import { DocumentValidationError } from '@/lib/server/document-validation'
import { uploadDocument } from '@/lib/server/documents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
const fail = (error: string, status: number) =>
  Response.json(
    { error },
    { status, headers: { ...headers, ...(status === 413 ? { Connection: 'close' } : {}) } },
  )

export async function POST(request: Request) {
  const userId = (await workspaceSession(request.headers))?.user.id
  if (!userId) return fail('Sign in to upload a document.', 401)
  if (request.headers.get('x-workspace-owner') !== userId)
    return fail('The account changed. Reload before uploading.', 403)
  if (request.headers.get('origin') !== new URL(process.env.BETTER_AUTH_URL!).origin)
    return fail('Origin not allowed.', 403)
  const db = getDatabase()
  if (!allowWorkspaceWrite(db, userId))
    return fail('Too many changes. Wait a minute and retry.', 429)
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.startsWith('multipart/form-data;'))
    return fail('A multipart file upload is required.', 415)
  const reader = request.body?.getReader()
  if (!reader) return fail('Choose a document to upload.', 400)
  const chunks: Uint8Array[] = []
  let size = 0
  let form: FormData
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_DOCUMENT_BYTES + 16 * 1024) {
        // Cancellation closes the underlying HTTP/1 stream; do not let clients reuse it.
        await reader.cancel()
        return fail('Choose a document no larger than 5 MB.', 413)
      }
      chunks.push(value)
    }
    form = await new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': contentType },
    }).formData()
  } catch {
    return fail('The upload could not be read. Please choose the file again.', 400)
  }
  const file = form.get('file')
  const metadata = form.get('metadata')
  if (
    Array.from(form.keys()).length !== 2 ||
    !(file instanceof File) ||
    typeof metadata !== 'string'
  )
    return fail('Send one file and its details.', 400)
  let input: unknown
  try {
    input = JSON.parse(metadata)
  } catch {
    return fail('Invalid document details.', 400)
  }
  const parsed = documentUploadSchema.safeParse(input)
  if (!parsed.success)
    return fail('Check the document title, date, provider, and ownership confirmation.', 400)
  try {
    const saved = await uploadDocument(
      db,
      userId,
      file.name,
      new Uint8Array(await file.arrayBuffer()),
      parsed.data,
    )
    return Response.json(saved, { headers })
  } catch (error) {
    if (error instanceof RevisionConflict)
      return Response.json(
        { error: error.message, ...readWorkspace(db, userId) },
        { status: 409, headers },
      )
    if (error instanceof DocumentValidationError) return fail(error.message, error.status)
    if (error instanceof WorkspaceInputError) return fail(error.message, 422)
    return fail('The document could not be saved. Please retry.', 500)
  }
}
