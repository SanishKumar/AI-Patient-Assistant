import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import renderer from 'pdfjs-dist/package.json'

export const runtime = 'nodejs'
const patterns = {
  cmaps: /^[a-zA-Z0-9_-]+\.bcmap$/,
  standard_fonts: /^[a-zA-Z0-9_-]+\.(?:pfb|ttf)$/,
  wasm: /^[a-zA-Z0-9_-]+\.(?:wasm|js)$/,
}

// Public, versioned renderer assets only. This route never reads uploaded files.
export async function GET(
  _request: Request,
  context: { params: Promise<{ version: string; kind: string; name: string }> },
) {
  const params = await context.params
  const pattern = Object.hasOwn(patterns, params.kind)
    ? patterns[params.kind as keyof typeof patterns]
    : undefined
  if (params.version !== renderer.version || !pattern?.test(params.name))
    return new Response(null, { status: 404 })
  try {
    const data = await readFile(
      join(process.cwd(), 'node_modules', 'pdfjs-dist', params.kind, params.name),
    )
    return new Response(data, {
      headers: {
        'Content-Type': params.name.endsWith('.wasm')
          ? 'application/wasm'
          : params.name.endsWith('.js')
            ? 'text/javascript'
            : 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
