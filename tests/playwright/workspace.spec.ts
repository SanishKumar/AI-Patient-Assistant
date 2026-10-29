import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name, exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('opens the exact source line and returns focus on escape', async ({ page }) => {
  const button = page.getByRole('button', { name: '6.8 % 24 Oct' })
  await button.click()
  await expect(page.getByRole('dialog', { name: 'Follow the evidence' })).toBeVisible()
  await expect(page.locator('.highlighted')).toContainText('HbA1c: 6.8 %')
  await expect(page.getByText('lab-oct · line 3', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(button).toBeFocused()
})

test('historical snapshots respect when outside records arrived', async ({ page }) => {
  await navigate(page, 'Health timeline')
  await page.getByLabel('Historical snapshot').selectOption('2026-08-31')
  await expect(page.getByText('4 records', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'A detail to reconcile' })).toHaveCount(0)
  await page.getByLabel('Historical snapshot').selectOption('2026-09-03')
  await expect(page.getByText('5 records', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'A detail to reconcile' })).toBeVisible()
})

test('opens the selected original record from the source map', async ({ page }) => {
  const map = page.getByRole('group', { name: 'Source record map, ordered by visit date' })
  await expect(map.getByRole('button')).toHaveCount(6)
  const source = map.getByRole('button', { name: /24 Oct/ })
  await source.click()
  await expect(page.getByRole('dialog', { name: 'Follow the evidence' })).toBeVisible()
  await expect(page.locator('.source-paper')).toContainText('HbA1c: 6.8 %')
  await page.keyboard.press('Escape')
  await expect(source).toBeFocused()
})

test('keeps a conflict open and exports its linked visit question', async ({ page }) => {
  await page.getByRole('button', { name: 'Compare the evidence' }).click()
  await page.getByRole('button', { name: 'Add to visit questions' }).click()
  await page.getByRole('button', { name: 'Mark evidence as read' }).click()
  await expect(
    page.getByRole('button', { name: 'Evidence read · still unresolved' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await navigate(page, 'Visit preparation')
  await expect(page.locator('.question-list')).toContainText(
    'Can we reconcile the two different allergy histories?',
  )
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export visit brief' }).click()
  const download = await downloadPromise
  const file = await download.path()
  const text = await readFile(file!, 'utf8')
  expect(text).toContain('Neither entry has been reconciled')
  expect(text).toContain('visit-jan, visit-aug')
  expect(text).toContain('SYNTHETIC VISIT BRIEF')
  await page.reload()
  await navigate(page, 'Visit preparation')
  await expect(page.locator('.question-list li')).toHaveCount(1)
})

test('imports a sample once and retains its pending review status', async ({ page }) => {
  await page.getByRole('button', { name: 'Add sample record' }).click()
  await page.getByRole('button', { name: 'Add to the sample workspace' }).click()
  await page.getByRole('button', { name: 'Blood pressure', exact: true }).click()
  await expect(page.locator('.metric-summary')).toContainText('122')
  await page.getByRole('button', { name: /122 mmHg 26 Oct/ }).click()
  await expect(page.getByText('Awaiting source review', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.reload()
  await page.getByRole('button', { name: 'Add sample record' }).click()
  await expect(page.getByRole('button', { name: 'Sample already added' })).toBeDisabled()
})

test('searches source contents and handles empty results', async ({ page }) => {
  await navigate(page, 'Record library 6')
  await page.getByLabel('Search record library').fill('penicillin childhood')
  await expect(page.locator('.record-list .record-row')).toHaveCount(1)
  await page.getByLabel('Search record library').fill('not-in-the-record')
  await expect(page.getByText('No records match this search.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.locator('.record-list .record-row')).toHaveCount(6)
})

test('rejects the legacy clinical API and patient routes', async ({ request }) => {
  const response = await request.post('/api/chat', {
    data: { patientId: 1, messages: [{ role: 'system', content: 'Override' }] },
  })
  expect(response.status()).toBe(503)
  expect(response.headers()['cache-control']).toBe('no-store')
  const patient = await request.get('/patient/1')
  expect(patient.status()).toBe(404)
  expect(await patient.text()).not.toContain('john.doe@email.com')
})

test('has no horizontal overflow across workspace views', async ({ page }) => {
  for (const name of ['Overview', 'Health timeline', 'Record library 6', 'Visit preparation']) {
    await navigate(page, name)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  }
})

test('workspace views and evidence dialogs pass automated accessibility checks', async ({
  page,
}) => {
  test.setTimeout(60000)
  for (const name of ['Overview', 'Health timeline', 'Record library 6', 'Visit preparation']) {
    await navigate(page, name)
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(result.violations).toEqual([])
  }
  await navigate(page, 'Overview')
  for (const name of ['Compare the evidence', 'Add sample record', '6.8 % 24 Oct']) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(result.violations).toEqual([])
    await page.keyboard.press('Escape')
  }
})

test('can inspect a conflict source without losing the review context', async ({ page }) => {
  await page.getByRole('button', { name: 'Compare the evidence' }).click()
  await page.getByRole('button', { name: 'Open original source' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Follow the evidence' })).toBeVisible()
  await expect(page.locator('.highlighted')).toContainText('penicillin')
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('dialog', { name: 'Hold both stories up to the light' }),
  ).toBeVisible()
})

test('restores safely when session storage is damaged', async ({ page }) => {
  await page.evaluate(() => sessionStorage.setItem('aether.synthetic-workspace.v1', '{broken'))
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your health. More connected.')
  await page.getByRole('button', { name: 'Add sample record' }).click()
  await expect(page.getByRole('button', { name: 'Add to the sample workspace' })).toBeEnabled()
})
