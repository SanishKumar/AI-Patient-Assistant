export class RequestBodyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function boundedJson(request: Request, limit: number): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new RequestBodyError(415, 'JSON required.')
  const reader = request.body?.getReader()
  if (!reader) throw new RequestBodyError(400, 'Request body required.')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new RequestBodyError(413, 'Request too large.')
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new RequestBodyError(400, 'Invalid JSON.')
  }
}
