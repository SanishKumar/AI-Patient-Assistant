// Each request gets a dedicated worker so closing a page also stops engine initialization.
self.onmessage = async ({ data: { image, width, height } }) => {
  const assets = self.location.origin + '/ocr-assets'
  let engine
  function fail() {
    self.postMessage({ type: 'error' })
  }
  try {
    self.importScripts(assets + '/tesseract.min.js')
    engine = await self.Tesseract.createWorker('eng', 1, {
      workerPath: assets + '/worker.min.js',
      corePath: assets,
      langPath: assets,
      workerBlobURL: false,
      cacheMethod: 'none',
      errorHandler: fail,
      logger: ({ status, progress }) => {
        if (status === 'recognizing text')
          self.postMessage({ type: 'progress', percent: Math.round(progress * 100) })
      },
    })
    const { data } = await engine.recognize(image, {}, { text: true, blocks: true })
    const lines = []
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const { text, bbox } of paragraph.lines) {
          const trimmed = text.trim()
          if (!trimmed || trimmed.length > 160 || lines.length >= 250) continue
          lines.push({
            text: trimmed,
            left: bbox.x0 / width,
            top: bbox.y0 / height,
            right: bbox.x1 / width,
            bottom: bbox.y1 / height,
          })
        }
      }
    }
    self.postMessage({ type: 'result', text: data.text.trim().slice(0, 40000), lines })
  } catch {
    fail()
  } finally {
    await engine?.terminate()
  }
}
