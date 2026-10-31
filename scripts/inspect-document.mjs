import { PDFDocument, PDFDict, PDFArray, PDFStream, PDFName } from 'pdf-lib'
import sharp from 'sharp'

// Bytes arrive through stdin; no database handles or application secrets are passed in.
const parts = []
let size = 0
for await (const chunk of process.stdin) {
  size += chunk.length
  if (size > 5 * 1024 * 1024) process.exit(1)
  parts.push(chunk)
}
const bytes = Buffer.concat(parts)
try {
  const type = process.argv[2]
  if (type === 'application/pdf') {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true })
    if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 20) throw new Error()
    const blocked = new Set([
      'JS',
      'JavaScript',
      'Launch',
      'EmbeddedFiles',
      'EmbeddedFile',
      'RichMedia',
      'OpenAction',
      'AA',
      'AcroForm',
      'XFA',
    ])
    const visited = new Set()
    let nodes = 0
    function inspect(object, depth = 0) {
      if (++nodes > 100000 || depth > 50) throw new Error()
      if (visited.has(object)) return
      visited.add(object)
      if (object instanceof PDFName && blocked.has(object.decodeText())) throw new Error()
      if (object instanceof PDFStream) inspect(object.dict, depth + 1)
      if (object instanceof PDFDict) {
        for (const [key, value] of object.entries()) {
          if (blocked.has(key.decodeText())) throw new Error()
          inspect(value, depth + 1)
        }
      } else if (object instanceof PDFArray) {
        for (const value of object.asArray()) inspect(value, depth + 1)
      }
    }
    for (const [, object] of pdf.context.enumerateIndirectObjects()) inspect(object)
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize()
      if (![width, height].every((value) => Number.isFinite(value) && value > 0 && value <= 14400))
        throw new Error()
    }
    process.stdout.write(JSON.stringify({ mediaType: type, pages: pdf.getPageCount() }))
  } else {
    if (type === 'image/png') {
      // Reject animation explicitly; some decoders expose only its first frame.
      for (let offset = 8; offset + 12 <= bytes.length;) {
        const length = bytes.readUInt32BE(offset)
        if (offset + length + 12 > bytes.length) throw new Error()
        const chunkType = bytes.toString('ascii', offset + 4, offset + 8)
        if (chunkType === 'acTL') throw new Error()
        offset += length + 12
        if (chunkType === 'IEND') break
      }
    }
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: 'warning' })
    const metadata = await image.metadata()
    const expected = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpeg' : ''
    if (!expected || metadata.format !== expected || (metadata.pages ?? 1) !== 1) throw new Error()
    // Decode all pixels to reject truncated files; keep the original bytes for storage.
    await image.raw().toBuffer()
    process.stdout.write(JSON.stringify({ mediaType: type, pages: 1 }))
  }
} catch {
  process.exitCode = 1
}
