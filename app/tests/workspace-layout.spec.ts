import { test, expect, type Locator, type Page } from '@playwright/test'
import { recordDataset } from './fixtures/record'

async function contained(child: Locator, parent: Locator) {
  const bounds = (await parent.boundingBox())!
  const box = (await child.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1)
  expect(box.y).toBeGreaterThanOrEqual(bounds.y - 1)
  expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1)
  return box
}

async function ready(page: Page) {
  await page.goto('./?view=all')
  await expect(page.locator('.row-select').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date('2026-09-11T12:00:00Z'))
  const dataset = await (await page.request.get('./data/current.json')).json()
  await page.route('**/data/current.json', (route) =>
    route.fulfill({ json: recordDataset(dataset) }),
  )
})

test('the header owns search, filters and sort without colliding with brand or saved controls', async ({
  page,
}, info) => {
  const widths =
    info.project.name === 'desktop'
      ? [901, 997, 1100, 1101, 1139, 1220, 1484, 1920]
      : [320, 360, 390, 620, 621, 768, 900]
  for (const width of widths) {
    await page.setViewportSize({ width, height: 920 })
    await ready(page)
    const header = page.locator('.workspace-header')
    const search = header.getByRole('search')
    await expect(search.getByRole('textbox', { name: 'Search opportunities' })).toBeVisible()
    await expect(search.getByRole('button', { name: 'Filters', exact: true })).toBeVisible()
    await expect(search.getByRole('button', { name: /Sort opportunities:/ })).toBeVisible()
    await expect(page.locator('.console-toolbar')).toHaveCount(0)
    await expect(page.locator('.feed-heading')).toHaveCSS('clip-path', 'inset(50%)')
    expect((await page.locator('.feed-heading').boundingBox())!.height).toBe(1)
    const boxes = []
    for (const selector of [
      '.workspace-brand',
      '.workspace-search',
      '.workspace-nav',
      '.workspace-tools',
    ])
      boxes.push(await contained(header.locator(selector), header))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j]
        const intersectionWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const intersectionHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        expect(intersectionWidth > 1 && intersectionHeight > 1).toBe(false)
      }
    }
    if (width > 900) {
      expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width)
      expect(boxes[1].x + boxes[1].width).toBeLessThan(boxes[2].x)
      expect(boxes[0].y + boxes[0].height).toBeLessThanOrEqual(66)
    }
    for (const control of [
      search.locator('.search-box'),
      search.getByRole('button', { name: 'Filters', exact: true }),
      search.locator('.sort-trigger'),
    ])
      await contained(control, search)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('export is centred beside the refiners and remains clear of carousel navigation', async ({
  page,
}, info) => {
  const width = info.project.name === 'desktop' ? 1484 : 320
  await page.setViewportSize({ width, height: 920 })
  await ready(page)
  const exportButton = page.getByRole('button', { name: 'Export signals', exact: true })
  const exportBox = await contained(exportButton, page.locator('.discovery-band'))
  const glass = (await page.locator('.discovery-viewport').boundingBox())!
  expect(Math.abs(exportBox.y + exportBox.height / 2 - glass.y - glass.height / 2)).toBeLessThan(1)
  expect(exportBox.x).toBeGreaterThan(glass.x + glass.width)
  for (const arrow of await page.locator('.carousel-arrow').all()) {
    const box = (await arrow.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(exportBox.x)
  }
  await page.getByRole('textbox', { name: 'Search opportunities' }).fill('Vanguard')
  await expect(page.locator('.row-select').first()).toBeVisible()
  const download = page.waitForEvent('download')
  await exportButton.click()
  expect((await download).suggestedFilename()).toMatch(/\.csv$/)
  await page.getByRole('button', { name: /Sort opportunities:/ }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Show hidden' }).click()
  await expect(exportButton).toBeDisabled()
  await expect(page.getByText('No hidden signals', { exact: true })).toBeVisible()
})

test('the slim action dock increases reading space while keeping both controls usable', async ({
  page,
}, info) => {
  const desktop = info.project.name === 'desktop'
  await page.setViewportSize({ width: desktop ? 1484 : 390, height: desktop ? 920 : 844 })
  await ready(page)
  if (!desktop) await page.locator('.row-select').first().click()
  const panel = page.locator('.console-detail:visible')
  const dock = panel.locator('.record-action-dock')
  const before = (await dock.boundingBox())!
  expect(before.height).toBe(57)
  expect(before.y + before.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  const reading = (await panel.locator('.inspector-scroll').boundingBox())!
  if (desktop) {
    expect(reading.y).toBeLessThanOrEqual(305)
    expect(reading.height).toBeGreaterThanOrEqual(545)
    await expect(page.locator('.console-inspector')).toHaveCSS('border-top-left-radius', '6px')
    await expect(page.locator('.console-inspector')).toHaveCSS('border-bottom-left-radius', '6px')
    await expect(page.locator('.market-section')).toHaveCSS('height', '66px')
    await expect(panel.locator('.inspector-summary')).toHaveCSS('margin-top', '20px')
    await expect(panel.locator('.inspector-summary')).toHaveCSS('padding-left', '24px')
    await expect(panel.locator('.inspector-summary p').first()).toHaveCSS('font-size', '18px')
  }
  await expect(panel.locator('.inspector-facts')).toHaveCSS('margin-top', '12px')
  for (const button of [dock.getByRole('button'), dock.getByRole('link')]) {
    expect((await contained(button, dock)).height).toBeGreaterThanOrEqual(44)
  }
  await panel.locator('.inspector-scroll').evaluate((el) => el.scrollTo(0, el.scrollHeight))
  expect(await dock.boundingBox()).toEqual(before)
  await expect(panel.locator('.inspector-summary p').last()).toBeInViewport()
  await dock.getByRole('button', { name: 'Full details', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Sources & timeline' })).toBeVisible()
  const fullDock = page.getByRole('dialog').locator('.record-action-dock')
  expect((await fullDock.boundingBox())!.height).toBeLessThanOrEqual(61)
})
