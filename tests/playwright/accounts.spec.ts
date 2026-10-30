import { test, expect, type APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { sampleLabCsv } from '../../lib/records/import-csv'
const origin = 'http://127.0.0.1:3000'
const password = 'Fictional-preview-4829!'
async function createAccount(request: APIRequestContext) {
  const email = `preview-${randomUUID()}@example.invalid`
  const response = await request.post('/api/auth/sign-up/email', {
    headers: { Origin: origin },
    data: { name: 'Test Owner', email, password },
  })
  expect(response.status()).toBe(200)
  return { email, id: (await response.json()).user.id as string }
}

test('creates an empty personal workspace, saves a journal and visit, and keeps the demo separate', async ({
  page,
  context,
}) => {
  test.setTimeout(60000)
  await page.goto('/demo')
  await page.evaluate(() =>
    sessionStorage.setItem(
      'aether.synthetic-workspace.v1',
      JSON.stringify({ version: 1, imported: true, questions: [], reviews: [] }),
    ),
  )
  await page.goto('/login')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  const email = `ui-${randomUUID()}@example.invalid`
  await page.getByLabel('Display name').fill('Test Explorer')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create my space' }).click()
  await expect(page).toHaveURL('/workspace')
  await expect(page.getByRole('heading', { name: 'No HbA1c readings yet.' })).toBeVisible()
  await expect(page.locator('main')).not.toContainText('Ananya')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Write a journal entry', exact: true }).click()
  await page.getByLabel('Entry title').fill('Question after my walk')
  await page.getByLabel('Your notes').fill('A fictional observation for testing.')
  await page.getByRole('button', { name: 'Save journal entry' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Visit preparation', exact: true }).click()
  await page.getByRole('button', { name: 'Edit visit details' }).click()
  await page.getByLabel('Visit date', { exact: true }).fill('2026-12-03')
  await page.getByLabel('Clinician or clinic').fill('Test clinic')
  await page.getByLabel('What brings you in?').fill('Discuss my questions')
  await page.getByRole('button', { name: 'Save visit details' }).click()
  await expect(page.locator('.visit-plan-summary')).toContainText('Test clinic')
  await page.getByLabel('Add a question', { exact: true }).fill('What should I keep track of?')
  await page
    .getByLabel('Link a source (optional)')
    .selectOption({ label: 'Question after my walk' })
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(page.locator('.question-list')).toContainText('What should I keep track of?')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export visit brief' }).click()
  const brief = await readFile((await (await download).path())!, 'utf8')
  expect(brief).toContain('Test Explorer')
  expect(brief).toContain('Test clinic')
  expect(brief).toContain('A fictional observation for testing.')
  expect(brief).not.toContain('Ananya')
  await page.reload()
  await page.getByRole('button', { name: 'Visit preparation', exact: true }).click()
  await expect(page.locator('.question-list')).toContainText('What should I keep track of?')
  expect((await context.cookies()).find((c) => c.name.includes('session_token'))?.httpOnly).toBe(
    true,
  )
  await page.getByRole('button', { name: 'My account' }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL('/')
  expect((await context.request.get('/api/workspace')).status()).toBe(401)
  await page.goto('/demo')
  await expect(page.locator('.patient-context')).toContainText('Ananya Rao')
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in to my space' }).click()
  await expect(page).toHaveURL('/workspace')
  await page.getByRole('button', { name: 'Record library', exact: false }).click()
  await page.getByRole('button', { name: 'Delete record: Question after my walk' }).click()
  await page.getByRole('button', { name: 'Delete record', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Visit preparation', exact: true }).click()
  await expect(page.locator('.question-list')).toContainText('What should I keep track of?')
  await expect(page.locator('.question-list .text-link')).toHaveCount(0)
  await page.getByRole('button', { name: 'My account' }).click()
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click()
  await page.getByLabel('Type DELETE to confirm').fill('DELETE')
  await page.getByLabel('Current password').fill(password)
  await page.getByRole('button', { name: 'Delete account permanently' }).click()
  await expect(page).toHaveURL('/')
  expect((await context.request.get('/api/workspace')).status()).toBe(401)
})

test('separates owners and rejects forged identity, bad origins, stale revisions, and clinical claims', async ({
  playwright,
  request,
  isMobile,
}) => {
  test.skip(isMobile, 'API ownership checks are shared across viewport sizes')
  expect((await request.get('/api/workspace')).status()).toBe(401)
  const a = await playwright.request.newContext({ baseURL: origin }),
    b = await playwright.request.newContext({ baseURL: origin })
  try {
    const ownerA = await createAccount(a),
      ownerB = await createAccount(b)
    const headers = { Origin: origin, 'X-Workspace-Owner': ownerA.id }
    const data = {
      revision: 0,
      requestId: randomUUID(),
      command: { type: 'question', text: 'My question', sourceIds: [] },
    }
    const saved = await a.post('/api/workspace', { headers, data })
    expect(saved.status()).toBe(200)
    expect((await saved.json()).revision).toBe(1)
    expect((await (await a.post('/api/workspace', { headers, data })).json()).revision).toBe(1)
    expect((await (await b.get('/api/workspace')).json()).state.questions).toEqual([])
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
    for (const command of [{ type: 'import' }, { type: 'review', action: 'clinically-signed' }])
      expect(
        (await a.post('/api/workspace', { headers, data: { ...data, command } })).status(),
      ).toBe(400)
    expect(
      (
        await a.post('/api/workspace', { headers, data: { ...data, padding: 'x'.repeat(40000) } })
      ).status(),
    ).toBe(413)
    expect(
      (
        await a.post('/api/auth/sign-in/email', {
          headers: { Origin: origin },
          data: { email: ownerA.email, password: 'Incorrect-password!' },
        })
      ).status(),
    ).toBe(401)
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
          belongsToMe: true,
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
    expect(
      (
        await (
          await b.get('/api/workspace/export', { headers: { 'X-Workspace-Owner': ownerB.id } })
        ).json()
      ).state.records,
    ).toEqual([])
  } finally {
    await a.dispose()
    await b.dispose()
  }
})

test('recovers a lost response once and rejects another tab overwriting the workspace', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, 'Transport recovery is shared across viewport sizes')
  await createAccount(context.request)
  await page.goto('/workspace')
  await page.getByRole('button', { name: 'Visit preparation', exact: true }).click()
  let interrupt = true
  await page.route('**/api/workspace', async (route) => {
    if (interrupt) {
      await route.fetch()
      await route.abort('connectionfailed')
    } else await route.continue()
  })
  await page.getByLabel('Add a question', { exact: true }).fill('Retry this question')
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(page.locator('.save-status')).toContainText('not confirmed saved')
  interrupt = false
  await page.getByRole('button', { name: 'Retry save' }).click()
  await expect(page.locator('.save-status')).toContainText('Saved to your account')
  await expect(page.locator('.question-list li')).toHaveCount(1)
  const second = await context.newPage()
  await second.goto('/workspace')
  await second.getByRole('button', { name: 'Visit preparation', exact: true }).click()
  await second.getByLabel('Add a question', { exact: true }).fill('Another tab question')
  await second.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(second.locator('.save-status')).toContainText('Saved to your account')
  await page.getByLabel('Add a question', { exact: true }).fill('Stale question must not overwrite')
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(page.locator('.save-status')).toContainText('Another tab changed this workspace')
  await expect(page.locator('.question-list li')).toHaveCount(2)
  await expect(page.locator('.question-list')).not.toContainText('Stale question')
})
