import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { sampleLabCsv } from '../../lib/records/import-csv'

const origin = 'http://127.0.0.1:3000'
const password = 'Fictional-preview-4829!'
async function createAccount(request: APIRequestContext) {
  const email = `preview-${randomUUID()}@example.invalid`
  const response = await request.post('/api/auth/sign-up/email', {
    headers: { Origin: origin },
    data: { name: 'Fictional Reviewer', email, password },
  })
  expect(response.status()).toBe(200)
  return { email, id: (await response.json()).user.id as string }
}
async function visitPreparation(page: Page) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Visit preparation', exact: true }).click()
}

test('creates an account, saves across sessions, and restores the separate guest workspace', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await visitPreparation(page)
  await page
    .getByLabel('Add a question to this fictional scenario')
    .fill('Guest question stays here')
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  await page.getByRole('button', { name: 'Save my space' }).click()
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(accessibility.violations).toEqual([])
  const email = `ui-${randomUUID()}@example.invalid`
  await page.getByLabel('Display name').fill('Fictional Explorer')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create my space' }).click()
  await expect(page.getByRole('button', { name: 'My account' })).toBeVisible()
  await visitPreparation(page)
  await expect(page.locator('.question-list li')).toHaveCount(0)
  await page
    .getByLabel('Add a question to this fictional scenario')
    .fill('A saved fictional question')
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(page.locator('.save-status')).toContainText('Saved to your account')
  await expect(page.locator('.question-list')).toContainText('A saved fictional question')
  const cookies = await context.cookies()
  expect(cookies.find((cookie) => cookie.name.includes('session_token'))?.httpOnly).toBe(true)
  await page.getByRole('button', { name: 'My account' }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save my space' })).toBeVisible()
  expect((await context.request.get('/api/workspace')).status()).toBe(401)
  await visitPreparation(page)
  await expect(page.locator('.question-list')).toContainText('Guest question stays here')
  await expect(page.locator('.question-list')).not.toContainText('A saved fictional question')
  await page.getByRole('button', { name: 'Save my space' }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in to my space' }).click()
  await expect(page.getByRole('button', { name: 'My account' })).toBeVisible()
  await visitPreparation(page)
  await expect(page.locator('.question-list')).toContainText('A saved fictional question')
})

test('separates owners and rejects forged identity, bad origins, stale revisions, and signed claims', async ({
  playwright,
  request,
  isMobile,
}) => {
  test.skip(isMobile, 'API ownership checks are shared across viewport sizes')
  expect((await request.get('/api/workspace')).status()).toBe(401)
  const a = await playwright.request.newContext({ baseURL: origin })
  const b = await playwright.request.newContext({ baseURL: origin })
  try {
    const ownerA = await createAccount(a),
      ownerB = await createAccount(b)
    const headers = { Origin: origin, 'X-Workspace-Owner': ownerA.id }
    const data = { revision: 0, requestId: randomUUID(), command: { type: 'import' } }
    const saved = await a.post('/api/workspace', { headers, data })
    expect(saved.status()).toBe(200)
    expect((await saved.json()).revision).toBe(1)
    expect((await (await a.post('/api/workspace', { headers, data })).json()).revision).toBe(1)
    expect((await (await b.get('/api/workspace')).json()).state.imported).toBe(false)
    expect((await a.get('/api/workspace')).headers()['cache-control']).toBe('no-store')
    expect(
      (
        await a.post('/api/workspace', { headers, data: { ...data, requestId: randomUUID() } })
      ).status(),
    ).toBe(409)
    expect(
      (
        await a.post('/api/workspace', {
          headers: { ...headers, Origin: 'https://untrusted.invalid' },
          data,
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await a.post('/api/workspace', {
          headers: { ...headers, 'X-Workspace-Owner': ownerB.id },
          data,
        })
      ).status(),
    ).toBe(403)
    expect(
      (await a.post('/api/workspace', { headers, data: { ...data, userId: ownerB.id } })).status(),
    ).toBe(400)
    expect(
      (
        await a.post('/api/workspace', {
          headers,
          data: { ...data, command: { type: 'review', action: 'clinically-signed' } },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await a.post('/api/workspace', { headers, data: { ...data, padding: 'x'.repeat(40000) } })
      ).status(),
    ).toBe(413)
    const denial = await a.post('/api/auth/sign-in/email', {
      headers: { Origin: origin },
      data: { email: ownerA.email, password: 'Incorrect-password!' },
    })
    expect(denial.status()).toBe(401)
    expect((await request.get('/api/workspace/export')).status()).toBe(401)
    const imported = await a.post('/api/workspace', {
      headers,
      data: {
        revision: 1,
        requestId: randomUUID(),
        command: {
          type: 'import-file',
          name: 'private.csv',
          content: sampleLabCsv,
          fictional: true,
        },
      },
    })
    expect(imported.status()).toBe(200)
    const exported = await a.get('/api/workspace/export', {
      headers: { 'X-Workspace-Owner': ownerA.id },
    })
    expect(exported.headers()['cache-control']).toBe('no-store')
    expect((await exported.json()).state.records).toHaveLength(1)
    expect(
      (
        await b.get('/api/workspace/export', { headers: { 'X-Workspace-Owner': ownerA.id } })
      ).status(),
    ).toBe(403)
    const other = await b.get('/api/workspace/export', {
      headers: { 'X-Workspace-Owner': ownerB.id },
    })
    expect((await other.json()).state.records).toBeUndefined()
  } finally {
    await a.dispose()
    await b.dispose()
  }
})

test('recovers an interrupted save once and detects another tab changing the workspace', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, 'Transport recovery is shared across viewport sizes')
  await createAccount(context.request)
  await page.goto('/')
  await visitPreparation(page)
  let interrupt = true
  await page.route('**/api/workspace', async (route) => {
    if (interrupt) {
      // Lose the response after the server commits, not merely before sending the request.
      await route.fetch()
      await route.abort('connectionfailed')
      return
    }
    await route.continue()
  })
  await page
    .getByLabel('Add a question to this fictional scenario')
    .fill('Retry this fictional question')
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(page.locator('.save-status')).toContainText('not confirmed saved')
  interrupt = false
  await page.getByRole('button', { name: 'Retry save' }).click()
  await expect(page.locator('.save-status')).toContainText('Saved to your account')
  await expect(page.locator('.question-list li')).toHaveCount(1)
  const second = await context.newPage()
  await second.goto('/')
  await second.getByRole('button', { name: 'Add sample record' }).click()
  await second.getByRole('button', { name: 'Add to the sample workspace' }).click()
  await expect(second.locator('.save-status')).toContainText('Saved to your account')
  await page
    .getByLabel('Add a question to this fictional scenario')
    .fill('Stale question must not overwrite')
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(page.locator('.save-status')).toContainText('Another tab changed this workspace')
  await expect(page.locator('.question-list li')).toHaveCount(1)
  await page.reload()
  await visitPreparation(page)
  await expect(page.locator('.question-list')).toContainText('Retry this fictional question')
})
