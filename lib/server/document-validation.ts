import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { MAX_DOCUMENT_BYTES, type DocumentInfo, type DocumentMediaType } from '../records/documents'

export class DocumentValidationError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message)
  }
}
export function detectDocumentType(name: string, bytes: Uint8Array): DocumentMediaType {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES)
    throw new DocumentValidationError('Choose a document between 1 byte and 5 MB.', 413)
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f\\/]/.test(name))
    throw new DocumentValidationError(
      'Use a filename of up to 120 characters without path separators.',
    )
  const data = Buffer.from(bytes)
  if (/\.pdf$/i.test(name) && data.subarray(0, 5).toString('ascii') === '%PDF-')
    return 'application/pdf'
  if (
    /\.png$/i.test(name) &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png'
  if (/\.jpe?g$/i.test(name) && data[0] === 255 && data[1] === 216 && data[2] === 255)
    return 'image/jpeg'
  throw new DocumentValidationError('The file contents must match a PDF, PNG, or JPEG filename.')
}

let active = 0
export async function inspectDocument(name: string, bytes: Uint8Array): Promise<DocumentInfo> {
  const type = detectDocumentType(name, bytes)
  if (active >= 2)
    throw new DocumentValidationError('The document checker is busy. Please retry shortly.', 503)
  active++
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--max-old-space-size=192', join(process.cwd(), 'scripts/inspect-document.mjs'), type],
        {
          windowsHide: true,
          env: {
            NODE_ENV: process.env.NODE_ENV,
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            TEMP: process.env.TEMP,
          },
          stdio: ['pipe', 'pipe', 'ignore'],
        },
      )
      let output = ''
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, 10000)
      child.stdout.on('data', (chunk) => {
        output += chunk.toString('utf8')
        if (output.length > 1024) child.kill()
      })
      child.stdin.on('error', () => {
        /* Early rejection closes stdin. */
      })
      child.once('error', () => {
        clearTimeout(timeout)
        reject(new DocumentValidationError('The document checker is unavailable.', 503))
      })
      child.once('close', (code) => {
        clearTimeout(timeout)
        if (timedOut) {
          reject(
            new DocumentValidationError(
              'This document took too long to check. Try a smaller or simpler file.',
            ),
          )
          return
        }
        try {
          if (code !== 0) throw new Error()
          const result = JSON.parse(output) as DocumentInfo
          if (
            result.mediaType !== type ||
            !Number.isInteger(result.pages) ||
            result.pages < 1 ||
            result.pages > 20
          )
            throw new Error()
          resolve(result)
        } catch {
          reject(
            new DocumentValidationError(
              'This file could not be accepted. Use a readable, unencrypted PDF of up to 20 pages without forms, scripts, or attachments, or a single PNG/JPEG image up to 20 megapixels.',
            ),
          )
        }
      })
      child.stdin.end(bytes)
    })
  } finally {
    active--
  }
}
