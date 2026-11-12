import { expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()

export async function checkBriefSharing(page: Page, mobile: boolean) {
  await page.getByRole('button', { name: 'Build visit brief' }).click()
  const dialog = page.getByRole('dialog')
  if (mobile) await dialog.getByRole('button', { name: 'View preview' }).click()
  const preview = await dialog.getByRole('article', { name: 'Brief preview' }).innerText()
  await dialog.getByRole('button', { name: 'Share this brief' }).click()
  await expect(dialog.getByRole('button', { name: 'Create share link' })).toBeDisabled()
  await dialog
    .getByRole('checkbox', { name: 'I reviewed this preview and want to share it.' })
    .check()
  await page.route(
    '**/api/workspace/brief-shares',
    async (route) => {
      await route.fetch()
      await route.abort('connectionfailed')
    },
    { times: 1 },
  )
  await dialog.getByRole('button', { name: 'Create share link' }).click()
  await expect(dialog.getByRole('alert')).toContainText('not confirmed created')
  await dialog.getByRole('button', { name: 'Retry creating link' }).click()
  const shareLink = await dialog.getByLabel('Share link', { exact: true }).inputValue()
  const parsed = new URL(shareLink)
  expect(parsed.pathname).toBe('/shared-brief')
  expect(parsed.search).toBe('')
  expect(/^[A-Za-z0-9_-]{43}$/.test(parsed.hash.slice(1))).toBe(true)
  await dialog.getByRole('button', { name: 'Close dialog' }).click()

  const recipient = await page
    .context()
    .browser()!
    .newContext({
      baseURL: 'http://127.0.0.1:3000',
      viewport: mobile ? { width: 393, height: 851 } : { width: 1280, height: 900 },
    })
  try {
    await recipient.addCookies([
      { name: 'sharing_test_cookie', value: 'local-only', domain: '127.0.0.1', path: '/' },
    ])
    const reader = await recipient.newPage()
    const response = await reader.goto(shareLink)
    expect(response?.headers()['referrer-policy']).toBe('no-referrer')
    expect(await response!.text()).not.toContain('Test Explorer')
    await expect(reader.getByRole('article')).toHaveCount(0)
    const publicRequest = reader.waitForRequest(
      (request) => request.url().endsWith('/api/shared-brief') && request.method() === 'POST',
    )
    const publicResponse = reader.waitForResponse(
      (result) =>
        result.url().endsWith('/api/shared-brief') && result.request().method() === 'POST',
    )
    await reader.getByRole('button', { name: 'Open shared brief' }).click()
    const request = await publicRequest
    expect(request.url().includes(parsed.hash.slice(1))).toBe(false)
    expect(request.headers().cookie).toBeUndefined()
    const opened = await publicResponse
    expect(opened.status()).toBe(200)
    expect(opened.headers()['cache-control']).toContain('no-store')
    const paper = reader.getByRole('article', { name: 'Brief preview' })
    await expect(paper).toContainText('Test clinic')
    expect(normalize(await paper.innerText())).toBe(normalize(preview))
    await expect(paper).not.toContainText('Last journal line')
    await expect(paper).not.toContainText('Question after my walk')
    expect(
      (await new AxeBuilder({ page: reader }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    const download = reader.waitForEvent('download')
    await reader.getByRole('button', { name: 'Download text' }).click()
    expect(normalize(await readFile((await (await download).path())!, 'utf8'))).toBe(
      normalize(preview),
    )

    const expiryContext = await page.context().browser()!.newContext()
    try {
      const expiringReader = await expiryContext.newPage()
      await expiringReader.clock.install()
      await expiringReader.goto(shareLink)
      await expiringReader.getByRole('button', { name: 'Open shared brief' }).click()
      await expect(expiringReader.getByRole('article', { name: 'Brief preview' })).toBeVisible()
      await expiringReader.clock.fastForward(24 * 60 * 60 * 1000 + 60000)
      await expect(expiringReader.getByRole('article', { name: 'Brief preview' })).toHaveCount(0)
      await expect(
        expiringReader.getByText('This link is unavailable.', { exact: false }),
      ).toBeVisible()
    } finally {
      await expiryContext.close()
    }

    await page.getByRole('button', { name: 'Edit visit details' }).click()
    await page.getByLabel('What brings you in?').fill('Changed after the link was created')
    await page.getByRole('button', { name: 'Save visit details' }).click()
    await expect(page.locator('.save-status')).toContainText('Saved to your account')
    await reader.evaluate(() => window.dispatchEvent(new Event('pageshow')))
    await expect(paper).toContainText('Discuss my questions')
    await expect(paper).not.toContainText('Changed after the link was created')
    await page.getByRole('button', { name: 'Shared briefs', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Revoke link', exact: true })).toHaveCount(1)
    await dialog.getByRole('button', { name: 'View shared copy' }).click()
    await expect(dialog.getByRole('article', { name: 'Brief preview' })).toContainText(
      'Discuss my questions',
    )
    await expect(dialog.getByRole('article', { name: 'Brief preview' })).not.toContainText(
      'Changed after the link was created',
    )
    await dialog.getByRole('button', { name: 'Revoke link', exact: true }).click()
    await dialog.getByRole('button', { name: 'Revoke this link', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Revoke link', exact: true })).toHaveCount(0)
    await reader.evaluate(() => window.dispatchEvent(new Event('pageshow')))
    await expect(paper).toHaveCount(0)
    await expect(reader.getByText('This link is unavailable.', { exact: false })).toBeVisible()
    await reader.reload()
    await reader.getByRole('button', { name: 'Open shared brief' }).click()
    await expect(reader.getByText('This link is unavailable.', { exact: false })).toBeVisible()
    await dialog.getByRole('button', { name: 'Close dialog' }).click()
  } finally {
    await recipient.close()
  }
  await page.getByRole('button', { name: 'Edit visit details' }).click()
  await page.getByLabel('What brings you in?').fill('Discuss my questions')
  await page.getByRole('button', { name: 'Save visit details' }).click()
  await expect(page.locator('.save-status')).toContainText('Saved to your account')
}
