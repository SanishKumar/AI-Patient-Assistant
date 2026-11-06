import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const target = join('public', 'ocr-assets')
await mkdir(target, { recursive: true })
const assets = {
  'tesseract.js/dist': [
    'worker.min.js',
    'worker.min.js.LICENSE.txt',
    'tesseract.min.js',
    'tesseract.min.js.LICENSE.txt',
  ],
  'tesseract.js': ['LICENSE.md'],
  '@tesseract.js-data/eng': ['README.md'],
  'tesseract.js-core': [
    'LICENSE',
    'tesseract-core-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js',
    'tesseract-core-relaxedsimd-lstm.wasm.js',
  ],
  '@tesseract.js-data/eng/4.0.0_best_int': ['eng.traineddata.gz'],
}
for (const [source, names] of Object.entries(assets)) {
  for (const name of names) await copyFile(join('node_modules', source, name), join(target, name))
}
