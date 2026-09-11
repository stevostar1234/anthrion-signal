import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Dataset, Signal } from '../src/types'
import {
  recordDataset,
  recordTitle as title,
  recordDescription as description,
} from './fixtures/record'

async function fixture(page: Page, overrides: Partial<Signal> = {}) {
  const dataset: Dataset = await (await page.request.get('./data/current.json')).json()
  await page.route('**/data/current.json', (route) =>
    route.fulfill({ json: recordDataset(dataset, overrides) }),
  )
}

async function preview(page: Page) {
  await page.goto('./?view=live')
  await expect(page.locator('.row-select').first()).toBeVisible()
  if (page.viewportSize()!.width <= 900) await page.locator('.row-select').first().click()
  const panel = page.locator('.console-detail:visible')
  await expect(panel).toBeVisible()
  return panel
}

async function dockInViewport(page: Page, panel: Locator) {
  const dock = panel.locator('.record-action-dock')
  const viewport = page.viewportSize()!
  for (const control of [dock, dock.locator('button'), dock.locator('a')]) {
    const box = (await control.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  }
  return dock.boundingBox()
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date('2026-09-11T12:00:00Z'))
})

test('selected design presents compact source facts before untruncated text', async ({
  page,
}, info) => {
  await fixture(page)
  const panel = await preview(page)
  await expect(panel.locator('.inspector-facts dt')).toHaveText([
    'Notice type',
    'Value',
    'Deadline',
  ])
  await expect(panel.locator('.inspector-capabilities')).toContainText('Case management & service')
  await expect(panel.locator('.inspector-summary p')).toHaveText(description.split('\n\n'))
  expect(
    await panel
      .locator('.inspector-summary p')
      .first()
      .evaluate((el) => getComputedStyle(el).webkitLineClamp),
  ).toBe('none')
  const facts = (await panel.locator('.inspector-facts').boundingBox())!
  const capabilities = (await panel.locator('.inspector-capabilities').boundingBox())!
  const prose = (await panel.locator('.inspector-summary').boundingBox())!
  expect(capabilities.y).toBeGreaterThanOrEqual(facts.y + facts.height - 1)
  expect(prose.y).toBeGreaterThanOrEqual(capabilities.y + capabilities.height)
  await dockInViewport(page, panel)
  await page.screenshot({ path: `../artifacts/record-panel-${info.project.name}.png` })
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})

test('long records keep the dock visible before and after scrolling at compact and short sizes', async ({
  page,
}, info) => {
  await fixture(page, {
    title: `${title} ${title}`,
    buyer_name:
      'A public buyer with a long organisation name and multiple participating departments',
    description: Array.from(
      { length: 45 },
      (_, index) => `Paragraph ${index + 1}. ${description}`,
    ).join('\n\n'),
  })
  const sizes =
    info.project.name === 'desktop'
      ? [
          [997, 600],
          [980, 480],
          [1440, 400],
          [1139, 920],
          [1440, 720],
        ]
      : [
          [320, 568],
          [390, 844],
          [844, 390],
        ]
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height })
    const panel = await preview(page)
    const before = await dockInViewport(page, panel)
    const scroller = panel.locator('.inspector-scroll')
    await scroller.focus()
    await page.keyboard.press('PageDown')
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect(panel.locator('.inspector-summary p').last()).toBeInViewport()
    expect(await dockInViewport(page, panel)).toEqual(before)
    const last = (await panel.locator('.inspector-summary p').last().boundingBox())!
    expect(last.y + last.height).toBeLessThanOrEqual(before!.y)
    await expect(panel.getByRole('button', { name: 'Full details', exact: true })).toBeEnabled()
    await page.screenshot({ path: `../artifacts/record-panel-long-${width}x${height}.png` })
    await panel.getByRole('button', { name: 'Full details', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dockInViewport(page, dialog)
    await dialog.locator('.detail-content').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await dockInViewport(page, dialog)
    await dialog.getByRole('button', { name: 'Back to record' }).click()
    if (width <= 900) await expect(page.locator('.console-detail:visible')).toBeVisible()
    else await expect(dialog).toHaveCount(0)
  }
})

test('dock actions preserve source navigation, detail tabs, calendar, bookmarks and return flow', async ({
  page,
}) => {
  await fixture(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const panel = await preview(page)
  await panel.getByRole('button', { name: 'Save selected opportunity', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Unsave selected opportunity' })).toBeVisible()
  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Add deadline to calendar' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.ics$/)
  await page
    .context()
    .route('https://example.com/tender/**', (route) => route.fulfill({ body: 'Source notice' }))
  const opened = page.waitForEvent('popup')
  await panel.getByRole('link', { name: 'Open source notice' }).click()
  const source = await opened
  await expect(source).toHaveURL('https://example.com/tender/a')
  await source.close()
  await panel.getByRole('button', { name: 'Full details', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: 'Sources & timeline' }).click()
  await expect(dialog.getByRole('tabpanel')).toContainText('Source provenance')
  await dockInViewport(page, dialog)
  await dialog.getByRole('button', { name: 'Back to record' }).click()
  if (page.viewportSize()!.width <= 900)
    await page.getByRole('button', { name: 'Close panel' }).click()
  await page.locator('.row-select').nth(1).click()
  const next = page.locator('.console-detail:visible')
  await expect(next.locator('.inspector-heading h2')).toHaveText('Customer platform implementation')
  await expect.poll(() => next.locator('.inspector-scroll').evaluate((el) => el.scrollTop)).toBe(0)
  await expect(next.getByRole('link', { name: 'Open source notice' })).toHaveAttribute(
    'href',
    'https://example.com/tender/b',
  )
  await next.getByRole('checkbox', { name: 'Hide selected opportunity', exact: true }).click()
  await expect(page.locator('[data-signal-id="panel-b"]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('missing descriptions, capabilities and deadlines retain usable dock controls', async ({
  page,
}) => {
  await fixture(page, { description: '  \n ', deadline_at: null, matched_capabilities: [] })
  const panel = await preview(page)
  await expect(panel.locator('.inspector-facts')).toContainText('Deadline not published')
  await expect(panel.locator('.inspector-capabilities')).toContainText('Not specified')
  await expect(panel.locator('.inspector-summary')).toContainText('No description was published')
  await dockInViewport(page, panel)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})

test('capture the selected panel at its natural design dimensions', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Reference is a desktop component')
  await fixture(page)
  await page.setViewportSize({ width: 1600, height: 1352 })
  await preview(page)
  await page.evaluate(() => document.fonts.ready)
  await page
    .locator('.console-inspector')
    .screenshot({ path: '../artifacts/record-panel-design.png' })
})
