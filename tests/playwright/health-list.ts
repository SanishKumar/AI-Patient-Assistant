import { expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const origin = 'http://127.0.0.1:3000'

export async function checkHealthList(page: Page, mobile: boolean) {
  const nav = page.getByRole('navigation', { name: 'Workspace navigation' })
  await nav.getByRole('button', { name: 'Medications & allergies', exact: true }).click()
  await page.getByRole('button', { name: 'Add medication', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Medication name', { exact: true }).fill('Example supplement')
  await dialog
    .getByLabel('Directions as written (optional)', { exact: true })
    .fill('As written on my package')
  await expect(
    dialog.getByRole('combobox', { name: 'How are you using it?', exact: true }),
  ).toHaveValue('unsure')
  await dialog
    .getByRole('combobox', { name: 'Linked record (optional)', exact: true })
    .selectOption({ label: 'Question after my walk' })
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.route(
    '**/api/workspace',
    async (route) => {
      await route.fetch()
      await route.abort('connectionfailed')
    },
    { times: 1 },
  )
  await dialog.getByRole('button', { name: 'Save medication', exact: true }).click()
  await expect(page.locator('.save-status')).toContainText('not confirmed saved')
  await dialog.getByRole('button', { name: 'Retry save', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const medication = page.getByRole('article', { name: 'Medication: Example supplement' })
  await expect(medication).toHaveCount(1)
  await expect(medication).toContainText('Unsure')
  await expect(medication).toContainText('As written on my package')
  await medication
    .getByRole('button', { name: 'Open linked record: Question after my walk', exact: true })
    .click()
  await expect(dialog).toContainText('Last journal line')
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await medication
    .getByRole('button', { name: 'Edit medication: Example supplement', exact: true })
    .click()
  await dialog
    .getByRole('combobox', { name: 'How are you using it?', exact: true })
    .selectOption('taking')
  await dialog.getByRole('button', { name: 'Save medication', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(medication).toContainText('Taking')

  await page.getByRole('button', { name: 'Add allergy concern', exact: true }).click()
  await dialog.getByLabel('Substance or medicine', { exact: true }).fill('Example ingredient')
  await dialog.getByRole('button', { name: 'Save allergy concern', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const allergy = page.getByRole('article', { name: 'Allergy concern: Example ingredient' })
  await expect(allergy).toContainText('Reaction not entered')
  await allergy
    .getByRole('button', { name: 'Edit allergy concern: Example ingredient', exact: true })
    .click()
  await dialog
    .getByLabel('Reaction (optional)', { exact: true })
    .fill('A reaction I want to discuss')
  await dialog.getByRole('button', { name: 'Save allergy concern', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await nav.getByRole('button', { name: 'Medications & allergies', exact: true }).click()
  await expect(medication).toContainText('Taking')
  await expect(allergy).toContainText('A reaction I want to discuss')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])

  await nav.getByRole('button', { name: 'Visit preparation', exact: true }).click()
  await page.getByRole('button', { name: 'Build visit brief', exact: true }).click()
  const medChoice = dialog.getByRole('checkbox', { name: /Example supplement/ })
  const allergyChoice = dialog.getByRole('checkbox', { name: /Example ingredient/ })
  const journalChoice = dialog.getByRole('checkbox', { name: /Question after my walk/ })
  const paper = dialog.getByRole('article', { name: 'Brief preview' })
  await expect(medChoice).not.toBeChecked()
  await expect(allergyChoice).not.toBeChecked()
  if (mobile) await dialog.getByRole('button', { name: 'View preview' }).click()
  await expect(paper).not.toContainText('Example supplement')
  await expect(paper).not.toContainText('Example ingredient')
  if (mobile) await dialog.getByRole('button', { name: 'Choose contents' }).click()
  await medChoice.check()
  await allergyChoice.check()
  if (mobile) await dialog.getByRole('button', { name: 'View preview' }).click()
  await expect(paper).toContainText('Example supplement')
  await expect(paper).toContainText('As written on my package')
  await expect(paper).toContainText('A reaction I want to discuss')
  await expect(paper).toContainText(/patient-reported/i)
  await expect(paper).not.toContainText('Question after my walk')
  await expect(paper).not.toContainText('Last journal line')
  await expect(paper).not.toContainText('Source index')
  if (mobile) await dialog.getByRole('button', { name: 'Choose contents' }).click()
  await journalChoice.check()
  if (mobile) await dialog.getByRole('button', { name: 'View preview' }).click()
  await expect(paper).toContainText('Source index')
  await expect(paper).toContainText('Question after my walk')
  if (mobile) await dialog.getByRole('button', { name: 'Choose contents' }).click()
  await journalChoice.uncheck()
  if (mobile) await dialog.getByRole('button', { name: 'View preview' }).click()
  await dialog.getByRole('button', { name: 'Share this brief', exact: true }).click()
  await dialog
    .getByRole('checkbox', { name: 'I reviewed this preview and want to share it.', exact: true })
    .check()
  await dialog.getByRole('button', { name: 'Create share link', exact: true }).click()
  const share = dialog.getByLabel('Share link', { exact: true })
  await expect(share).toBeVisible()
  const token = new URL(await share.inputValue()).hash.slice(1)
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  const recipient = await page.context().browser()!.newContext({ baseURL: origin })
  try {
    const opened = await recipient.request.post('/api/shared-brief', {
      headers: { Origin: origin },
      data: { token },
    })
    expect(opened.status()).toBe(200)
    const sharedText = JSON.stringify((await opened.json()).brief)
    expect(sharedText).toContain('As written on my package')
    expect(sharedText).toContain('A reaction I want to discuss')
    expect(sharedText).not.toContain('Last journal line')
    await nav.getByRole('button', { name: 'Medications & allergies', exact: true }).click()
    await medication
      .getByRole('button', { name: 'Delete medication: Example supplement', exact: true })
      .click()
    await dialog.getByRole('button', { name: 'Delete medication', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(medication).toHaveCount(0)
    expect(
      (
        await recipient.request.post('/api/shared-brief', {
          headers: { Origin: origin },
          data: { token },
        })
      ).status(),
    ).toBe(404)
  } finally {
    await recipient.close()
  }
  await allergy
    .getByRole('button', { name: 'Delete allergy concern: Example ingredient', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Delete allergy concern', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(allergy).toHaveCount(0)
  await nav.getByRole('button', { name: 'Visit preparation', exact: true }).click()
}
