import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { sampleLabCsv } from '../../lib/records/import-csv'

const content = sampleLabCsv.replaceAll('\n', '\r\n')
const file = { name: 'fictional-labs.csv', mimeType: 'text/csv', buffer: Buffer.from(content) }
async function preview(page: Page) {
  await page.getByRole('button', { name: 'Import a record', exact: true }).click()
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles(file)
  await expect(page.getByRole('table')).toContainText('6.7 %')
}
async function confirmImport(page: Page) {
  await page
    .getByRole('checkbox', { name: /confirm this file contains fictional information/ })
    .check()
  await page.getByRole('button', { name: 'Import reviewed file' }).click()
  await expect(page.locator('.metric-summary')).toContainText('6.7')
}

test('validates locally, reviews a file, preserves original source bytes, and prevents duplicate imports', async ({
  page,
}) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Import a record', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page
    .getByLabel('Choose CSV file', { exact: true })
    .setInputFiles({ ...file, buffer: Buffer.from(sampleLabCsv.replace('6.7', 'NaN')) })
  await expect(page.getByRole('alert')).toContainText('Line 2 · value')
  await expect(page.getByRole('button', { name: 'Import reviewed file' })).toHaveCount(0)
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles(file)
  await expect(page.getByRole('button', { name: 'Import reviewed file' })).toBeDisabled()
  await page.getByText('Read the original file', { exact: true }).click()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByText('Read the original file', { exact: true }).click()
  await confirmImport(page)
  await page.getByRole('button', { name: '6.7 % 27 Oct · unreviewed' }).click()
  await expect(page.locator('.highlighted')).toContainText('hba1c,6.7,%,HPLC')
  await expect(page.locator('.source-integrity code')).toHaveText(
    createHash('sha256').update(content).digest('hex'),
  )
  const original = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download original CSV' }).click()
  expect(await readFile((await (await original).path())!)).toEqual(file.buffer)
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator('.metric-summary')).toContainText('6.7')
  await page.getByRole('button', { name: 'Import a record', exact: true }).click()
  await page
    .getByLabel('Choose CSV file', { exact: true })
    .setInputFiles({ ...file, name: 'renamed.csv' })
  await expect(page.getByText(/This exact file is already in your workspace/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import reviewed file' })).toBeDisabled()
})

test('saves, exports, and deletes imported workspace data without reviving it from a stale tab', async ({
  page,
  context,
}) => {
  const signup = await context.request.post('/api/auth/sign-up/email', {
    headers: { Origin: 'http://127.0.0.1:3000' },
    data: {
      name: 'Fictional Importer',
      email: `import-${randomUUID()}@example.invalid`,
      password: 'Fictional-import-4829!',
    },
  })
  expect(signup.status()).toBe(200)
  const owner = (await signup.json()).user.id
  await page.goto('/workspace')
  await preview(page)
  await page.getByRole('checkbox', { name: /record belongs to me/ }).check()
  await page.getByRole('button', { name: 'Import reviewed file' }).click()
  await expect(page.locator('.save-status')).toContainText('Saved to your account')
  await page.reload()
  await expect(page.locator('.metric-summary')).toContainText('6.7')
  await page.getByRole('button', { name: 'My account' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export workspace data' }).click()
  const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'))
  expect(exported.format).toBe('aether.workspace-export.v2')
  expect(exported.records).toHaveLength(1)
  expect(exported.state.records[0].source.importedCsv.text).toBe(content)
  expect(exported.activity).toHaveLength(1)
  expect(exported).not.toHaveProperty('session')
  await page.getByRole('button', { name: 'Delete saved workspace data' }).click()
  await expect(
    page.getByRole('button', { name: 'Delete workspace data', exact: true }),
  ).toBeDisabled()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByLabel('Type DELETE to confirm').fill('DELETE')
  await page.getByRole('button', { name: 'Delete workspace data', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No HbA1c readings yet.' })).toBeVisible()
  await expect(page.locator('.save-status')).toContainText('Saved to your account')
  const stale = await context.request.post('/api/workspace', {
    headers: { Origin: 'http://127.0.0.1:3000', 'X-Workspace-Owner': owner },
    data: {
      revision: 1,
      requestId: randomUUID(),
      command: { type: 'question', text: 'Stale edit', sourceIds: [] },
    },
  })
  expect(stale.status()).toBe(409)
  const after = await context.request.get('/api/workspace/export', {
    headers: { 'X-Workspace-Owner': owner },
  })
  expect(after.status()).toBe(200)
  const erased = await after.json()
  expect(erased.records).toHaveLength(0)
  expect(erased.state.questions).toEqual([])
  expect(erased.activity).toMatchObject([{ kind: 'erase' }])
  await page.reload()
  await expect(page.getByRole('heading', { name: 'No HbA1c readings yet.' })).toBeVisible()
})

test('shows incompatible readings as sources without mixing them into the same chart', async ({
  page,
}) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Import a record', exact: true }).click()
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({
    ...file,
    buffer: Buffer.from(sampleLabCsv.replace('6.7,%,HPLC', '50,mmol/mol,HPLC')),
  })
  await page
    .getByRole('checkbox', { name: /confirm this file contains fictional information/ })
    .check()
  await page.getByRole('button', { name: 'Import reviewed file' }).click()
  await expect(page.locator('.metric-summary')).toContainText('50')
  await expect(page.locator('.metric-summary')).toContainText('No newer comparable measurement')
  await expect(page.locator('.trend-chart > svg')).toHaveAttribute('aria-label', /50 mmol\/mol/)
  await expect(page.locator('.trend-chart > svg')).not.toHaveAttribute('aria-label', /6\.8/)
  await expect(page.locator('.measurement-links button')).toHaveCount(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})
