import { expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'

async function calendarDownload(page: Page) {
  const waiting = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: 'Download calendar file' }).click()
  const download = await waiting
  expect(download.suggestedFilename()).toBe('aether-calendar.ics')
  const contents = await readFile((await download.path())!, 'utf8')
  return contents.replace(/\r\n[ \t]/g, '')
}

export async function checkVisitCalendar(page: Page) {
  await page.getByRole('button', { name: 'Export calendar dates', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Calendar dates' })
  const plan = dialog.getByRole('checkbox', { name: /Visit plan/ })
  const preview = dialog.getByRole('article', { name: 'Calendar preview' })
  await expect(plan).toBeChecked()
  await expect(preview).toContainText('Health visit')
  await expect(preview).not.toContainText('Test clinic')
  await expect(preview).not.toContainText('Discuss my questions')
  const generic = await calendarDownload(page)
  expect(generic.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  expect(generic).toContain('DTSTART;VALUE=DATE:20261203\r\n')
  expect(generic).toContain('DTEND;VALUE=DATE:20261204\r\n')
  expect(generic).toContain('SUMMARY:Health visit\r\n')
  expect(generic).not.toMatch(
    /Test clinic|Test Explorer|Discuss my questions|What should I keep track|Question after my walk|VALARM/,
  )
  await dialog.getByRole('checkbox', { name: 'Include names and details', exact: true }).check()
  await dialog
    .getByRole('checkbox', { name: 'Request a reminder at 9am the day before', exact: true })
    .check()
  await expect(preview).toContainText('Test clinic')
  const detailed = await calendarDownload(page)
  expect(detailed).toContain('Test clinic')
  expect(detailed).toContain('Discuss my questions')
  expect(detailed).toContain('BEGIN:VALARM')
  expect(detailed).toContain('TRIGGER:-PT15H\r\n')
  expect(detailed.match(/^UID:(.+)$/m)?.[1]).toBe(generic.match(/^UID:(.+)$/m)?.[1])
  expect(detailed).not.toMatch(/What should I keep track|Question after my walk|Last journal line/)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await plan.uncheck()
  await expect(dialog.getByRole('button', { name: 'Download calendar file' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Export calendar dates', exact: true }).click()
  await expect(
    dialog.getByRole('checkbox', { name: 'Include names and details', exact: true }),
  ).not.toBeChecked()
  await expect(
    dialog.getByRole('checkbox', { name: 'Request a reminder at 9am the day before', exact: true }),
  ).not.toBeChecked()
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
}

export async function checkFollowUpCalendar(page: Page) {
  await page.getByRole('button', { name: 'Export calendar dates', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Calendar dates' })
  await expect(dialog.getByRole('checkbox', { name: /Bring my journal/ })).toHaveCount(0)
  await expect(dialog.getByRole('checkbox', { name: /File the receipt/ })).toHaveCount(0)
  await expect(dialog.getByRole('checkbox', { name: /Visit plan/ })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Download calendar file' })).toBeDisabled()
  const step = dialog.getByRole('checkbox', { name: /Find my previous report/ })
  await expect(step).not.toBeChecked()
  await step.check()
  const preview = dialog.getByRole('article', { name: 'Calendar preview' })
  await expect(preview).toContainText('Personal follow-up')
  await expect(preview).not.toContainText('Find my previous report')
  const generic = await calendarDownload(page)
  expect(generic.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  expect(generic).toContain('DTSTART;VALUE=DATE:20260120\r\n')
  expect(generic).toContain('DTEND;VALUE=DATE:20260121\r\n')
  expect(generic).toContain('SUMMARY:Personal follow-up\r\n')
  expect(generic).not.toMatch(
    /Test clinic|Find my previous report|Bring my journal|Contact the clinic|Last journal line|walking journal/,
  )
  await dialog.getByRole('checkbox', { name: 'Include names and details', exact: true }).check()
  const detailed = await calendarDownload(page)
  expect(detailed).toContain('Find my previous report')
  expect(detailed).not.toMatch(
    /Bring my journal|Contact the clinic|Last journal line|walking journal|What should I keep track/,
  )
  expect(detailed.match(/^UID:(.+)$/m)?.[1]).toBe(generic.match(/^UID:(.+)$/m)?.[1])
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
}
