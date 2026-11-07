import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { PDFDocument } from 'pdf-lib'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { version } from 'pdfjs-dist/package.json'

test('uploads originals, recovers an interrupted save, and follows a transcribed reading to its page', async ({
  page,
  context,
  isMobile,
}) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const signup = await context.request.post('/api/auth/sign-up/email', {
    headers: { Origin: 'http://127.0.0.1:3000' },
    data: {
      name: 'Document Explorer',
      email: `document-${randomUUID()}@example.invalid`,
      password: 'Fictional-document-4829!',
    },
  })
  expect(signup.status()).toBe(200)
  const owner = (await signup.json()).user.id
  // Both uploads contain the same rasterized page. The PDF has no text layer on page one.
  const png = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 960
      canvas.height = 480
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, 960, 480)
      ctx.fillStyle = 'black'
      ctx.font = '40px Arial'
      ctx.fillText('Fictional laboratory', 70, 110)
      ctx.fillText('LDL 101 mg/dL', 70, 245)
      return canvas.toDataURL('image/png').split(',')[1]
    }),
    'base64',
  )
  const pdf = await PDFDocument.create()
  pdf
    .addPage([480, 240])
    .drawImage(await pdf.embedPng(png), { x: 0, y: 0, width: 480, height: 240 })
  pdf.addPage().drawText('HbA1c 6.7 % - HPLC - fictional test only', { x: 40, y: 720 })
  const bytes = Buffer.from(await pdf.save())
  await page.goto('/workspace')
  await page.getByRole('button', { name: 'Upload a document', exact: true }).click()
  await page
    .getByLabel('Document file', { exact: true })
    .setInputFiles({ name: 'my-report.pdf', mimeType: 'application/pdf', buffer: bytes })
  await page.getByLabel('Document title', { exact: true }).fill('My October report')
  await page.getByLabel('Document date', { exact: true }).fill('2026-10-01')
  await page.getByLabel('Clinic or laboratory', { exact: true }).fill('Fictional clinic')
  await page.getByRole('checkbox', { name: 'This is my own health document.' }).check()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  let interrupted = false
  await page.route('**/api/workspace/documents', async (route) => {
    if (!interrupted) {
      interrupted = true
      await route.fetch()
      await route.abort('connectionfailed')
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Save document', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('not confirmed saved')
  await page.getByRole('button', { name: 'Retry upload', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const snapshot = await (await context.request.get('/api/workspace')).json()
  expect(snapshot.state.records).toHaveLength(1)
  const id = snapshot.state.records[0].id
  await page.getByRole('button', { name: 'Record library', exact: false }).click()
  await page.getByRole('button', { name: /^my-report.pdf/ }).click()
  await expect(page.getByRole('img', { name: 'Original document, page 1' })).toBeVisible()
  const requestsToOtherHosts: string[] = []
  await context.route(/^https?:\/\//, async (route) => {
    const { origin, hostname } = new URL(route.request().url())
    if (origin !== 'http://127.0.0.1:3000') {
      requestsToOtherHosts.push(hostname)
      await route.abort()
    } else await route.fallback()
  })
  const recognize = page.getByRole('button', { name: 'Read text on this page' })
  const candidate = page.getByRole('button', { name: /Use draft · LDL cholesterol 101 mg\/dL/i })
  await recognize.click()
  await expect(candidate).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(candidate).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Original document, page 2' })).toBeVisible()
  await page.getByLabel('Document zoom', { exact: true }).selectOption('2')
  await expect(page.locator('.document-raster')).toHaveAttribute('style', /width: 200%/)
  await page.getByLabel('Document zoom', { exact: true }).selectOption('1')
  await page.getByText('Text on this page', { exact: true }).click()
  await expect(page.locator('.document-page-text')).toContainText('HbA1c 6.7 %')
  await page.getByRole('button', { name: 'Add a reading', exact: true }).click()
  await page.getByLabel('Value 1', { exact: true }).fill('6.7')
  await page.getByRole('checkbox', { name: 'Include measurement method' }).check()
  await page.getByLabel('Method 1', { exact: true }).fill('HPLC')
  await expect(page.getByLabel('Source page 1', { exact: true })).toHaveValue('2')
  await expect(page.getByRole('button', { name: 'Save readings', exact: true })).toBeDisabled()
  await page
    .getByRole('checkbox', {
      name: 'I checked these readings, units, and page references against the original.',
    })
    .check()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Save readings', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Readings saved. The original is unchanged.')
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Original', exact: true }).click()
  expect(await readFile((await (await download).path())!)).toEqual(bytes)
  const original = await context.request.get(`/api/workspace/documents/${id}`, {
    headers: { 'X-Workspace-Owner': owner },
  })
  expect(original.headers()['cache-control']).toBe('no-store')
  expect(original.headers()['content-disposition']).toContain('attachment;')
  expect(original.headers()['content-security-policy']).toContain('sandbox')
  expect(await original.body()).toEqual(bytes)
  expect((await context.request.get(`/api/workspace/documents/${id}`)).status()).toBe(403)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.reload()
  await expect(page.locator('.metric-summary')).toContainText('6.7')
  await page.locator('.measurement-links button').click()
  await expect(page.getByRole('img', { name: 'Original document, page 2' })).toBeVisible()
  expect(
    await page
      .locator('[role="dialog"]')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Upload a document', exact: true }).click()
  await page
    .getByLabel('Document file', { exact: true })
    .setInputFiles({ name: 'report-image.png', mimeType: 'image/png', buffer: png })
  await page.getByLabel('Document title', { exact: true }).fill('My report image')
  await page.getByLabel('Document date', { exact: true }).fill('2026-10-02')
  await page.getByLabel('Clinic or laboratory', { exact: true }).fill('Fictional clinic')
  await page.getByRole('checkbox', { name: 'This is my own health document.' }).check()
  await page.getByRole('button', { name: 'Save document', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Record library', exact: false }).click()
  await page.getByRole('button', { name: /^report-image.png/ }).click()
  await expect(page.getByRole('img', { name: 'Original document: My report image' })).toBeVisible()
  await context.route('**/recognize-page.js', (route) => route.fulfill({ status: 503, body: '' }), {
    times: 1,
  })
  await recognize.click()
  await expect(page.getByRole('alert')).toContainText('Text recognition could not finish')
  await recognize.click()
  await page.getByRole('button', { name: 'Cancel recognition' }).click()
  await recognize.click()
  await expect(candidate).toBeVisible({ timeout: 30000 })
  await candidate.click()
  await expect(page.getByLabel('Value 1', { exact: true })).toHaveValue('101')
  await expect(page.locator('.recognized-line-marker')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save readings', exact: true })).toBeDisabled()
  const before = await (await context.request.get('/api/workspace')).json()
  expect(before.state.records[1].observations).toEqual([])
  await page.getByLabel('Value 1', { exact: true }).fill('100')
  await page.getByRole('checkbox', { name: /I checked these readings/ }).check()
  await page.getByRole('button', { name: 'Save readings', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Readings saved')
  const after = await (await context.request.get('/api/workspace')).json()
  expect(after.state.records[1].observations[0]).toMatchObject({
    origin: 'ocr-assisted',
    value: 100,
    page: 1,
    recognizedLine: { text: 'LDL 101 mg/dL' },
  })
  expect(after.state.records[1].status).toBe('unreviewed')
  expect(JSON.stringify(after.state)).not.toMatch(/Fictional laboratory/i)
  expect(requestsToOtherHosts).toEqual([])
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.reload()
  await page.getByLabel('Measurement', { exact: true }).selectOption('ldl')
  await page.locator('.measurement-links button').click()
  await expect(page.locator('.recognized-line-marker')).toBeVisible()
  await expect(page.getByLabel('Value 1', { exact: true })).toHaveValue('100')
  await expect(page.locator('.reading-source')).toContainText('LDL 101 mg/dL')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Visit preparation', exact: true }).click()
  await page.getByRole('button', { name: 'Build visit brief' }).click()
  const recordChoice = page.getByRole('checkbox', { name: /report-image\.png/ })
  await expect(recordChoice).not.toBeChecked()
  await recordChoice.check()
  if (isMobile) await page.getByRole('button', { name: 'View preview' }).click()
  const brief = page.getByRole('article', { name: 'Brief preview' })
  await expect(brief).toContainText('LDL cholesterol: 100 mg/dL')
  await expect(brief).toContainText(
    'Source: [1], page 1. Recognized from the page and checked by the patient.',
  )
  await expect(brief).not.toContainText('my-report.pdf')
  await expect(brief).not.toContainText('101 mg/dL')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Record library', exact: false }).click()
  await page.getByRole('button', { name: 'Delete record: my-report.pdf', exact: true }).click()
  await page.getByRole('button', { name: 'Delete record', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(
    (
      await context.request.get(`/api/workspace/documents/${id}`, {
        headers: { 'X-Workspace-Owner': owner },
      })
    ).status(),
  ).toBe(404)
  expect(errors).toEqual([])
  for (const asset of [
    'cmaps/UniJIS-UTF16-H.bcmap',
    'standard_fonts/LiberationSans-Regular.ttf',
    'wasm/openjpeg.wasm',
  ]) {
    const response = await context.request.get(`/api/document-assets/${version}/${asset}`)
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toContain('immutable')
    expect((await response.body()).length).toBeGreaterThan(0)
  }
  expect(
    (await context.request.get(`/api/document-assets/${version}/unknown/package.json`)).status(),
  ).toBe(404)
})
