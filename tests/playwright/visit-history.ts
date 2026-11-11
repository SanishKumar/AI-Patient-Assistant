import { expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

export async function checkVisitHistory(page: Page, mobile: boolean) {
  const nav = page.getByRole('navigation', { name: 'Workspace navigation' })
  await nav.getByRole('button', { name: 'Past visits' }).click()
  await page.getByRole('button', { name: 'Record a visit' }).click()
  const dialog = page.getByRole('dialog')
  const attach = dialog.getByRole('checkbox', { name: /Move my current plan/ })
  await expect(attach).not.toBeChecked()
  await attach.check()
  await dialog.getByRole('checkbox', { name: 'What should I keep track of?' }).check()
  await dialog.getByLabel('Date of visit').fill('2026-01-19')
  await expect(dialog.getByLabel('Clinic or clinician')).toHaveValue('Test clinic')
  await dialog.getByLabel('Your visit notes').fill('We looked at the walking journal.')
  await dialog.getByRole('button', { name: 'Add a step' }).click()
  await dialog.getByLabel('Step 1', { exact: true }).fill('Bring my journal')
  await dialog.getByLabel('Due date 1').fill('2026-02-07')
  for (const [index, text, due] of [
    ['2', 'File the receipt', ''],
    ['3', 'Find my previous report', '2026-01-20'],
    ['4', 'Contact the clinic', '2026-02-17'],
  ]) {
    await dialog.getByRole('button', { name: 'Add a step' }).click()
    await dialog.getByLabel(`Step ${index}`, { exact: true }).fill(text)
    if (due) await dialog.getByLabel(`Due date ${index}`).fill(due)
  }
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.route(
    '**/api/workspace',
    async (route) => {
      await route.fetch()
      await route.abort('connectionfailed')
    },
    { times: 1 },
  )
  await dialog.getByRole('button', { name: 'Save visit notes' }).click()
  await dialog.getByRole('button', { name: 'Retry save' }).click()
  await expect(dialog).toHaveCount(0)
  const summary = page.getByRole('button', { name: /Test clinic.*19 January 2026/ })
  await expect(summary).toHaveCount(1)
  await page.reload()
  const openSteps = page.getByRole('region', { name: 'Open follow-up steps' })
  await expect(openSteps).toContainText('Bring my journal')
  await expect(openSteps.getByRole('checkbox')).toHaveCount(3)
  await expect(openSteps.getByRole('checkbox').first()).toHaveAccessibleName(
    /Find my previous report/,
  )
  await openSteps.getByRole('button', { name: 'Show all 4 steps' }).click()
  await expect(openSteps.getByRole('checkbox').last()).toHaveAccessibleName(/File the receipt/)
  await openSteps.getByRole('button', { name: 'Test clinic' }).first().click()
  await expect(summary).toHaveAttribute('aria-expanded', 'true')
  const step = page.getByRole('checkbox', { name: /Bring my journal/ })
  await step.click()
  await expect(step).toBeChecked()
  await expect(summary).toContainText('3 open / 4 steps')
  await page.getByRole('button', { name: 'Edit past visit' }).click()
  await dialog.getByLabel('Your visit notes').fill('We reviewed the walking journal together.')
  await dialog.getByRole('button', { name: 'Save visit notes' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(step).toBeChecked()
  if (!mobile) {
    await page.getByRole('button', { name: 'Edit past visit' }).click()
    const other = await page.context().newPage()
    try {
      await other.goto('/workspace')
      await other.getByRole('button', { name: 'Past visits', exact: true }).click()
      await other.getByRole('button', { name: /Test clinic.*19 January 2026/ }).click()
      const receipt = other.getByRole('checkbox', { name: 'File the receipt' })
      await receipt.click()
      await expect(receipt).toBeChecked()
      await dialog.getByLabel('Your visit notes').fill('A stale edit')
      await dialog.getByRole('button', { name: 'Save visit notes' }).click()
      await expect(dialog.getByRole('alert')).toContainText('workspace changed')
      await expect(dialog.getByRole('button', { name: 'Save visit notes' })).toBeDisabled()
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(page.getByRole('checkbox', { name: 'File the receipt' })).toBeChecked()
    } finally {
      await other.close()
    }
  }
  await page.getByRole('button', { name: 'Question after my walk', exact: true }).click()
  await expect(dialog).toContainText('Last journal line')
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await nav.getByRole('button', { name: 'Visit preparation' }).click()
  await expect(page.locator('.visit-plan-summary')).toContainText('No visit date set')
  await expect(page.locator('.question-list')).toContainText('What should I keep track of?')
  await page.getByRole('button', { name: 'Build visit brief' }).click()
  const prior = dialog.getByRole('checkbox', { name: /19 January 2026 · Test clinic/ })
  await expect(prior).not.toBeChecked()
  await prior.check()
  if (mobile) await dialog.getByRole('button', { name: 'View preview' }).click()
  const paper = dialog.getByRole('article', { name: 'Brief preview' })
  await expect(paper).toContainText('We reviewed the walking journal together.')
  await expect(paper).toContainText('Completed · Bring my journal')
  await expect(paper).not.toContainText('Last journal line')
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
}
