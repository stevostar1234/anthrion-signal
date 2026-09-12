import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Dataset } from '../src/types'

async function fixture(page: Page) {
  const data: Dataset = await (await page.request.get('./data/current.json')).json()
  const base = data.signals[0]
  const now = Date.now()
  data.generated_at = new Date(now).toISOString()
  data.signals = ['a', 'b', 'c', 'd'].map((id, index) => ({
    ...base,
    id: `visibility-${id}`,
    title: `CRM implementation ${id.toUpperCase()}`,
    description: `Source details for customer platform ${id.toUpperCase()}.`,
    countries: [id === 'd' ? 'DE' : 'GB'],
    status: 'active',
    signal_type: 'LIVE_TENDER',
    procurement_stage: 'tender',
    lifecycle_state: 'OPEN',
    delivery_priority: 'platform',
    published_at: new Date(now - index * 86400000).toISOString(),
    first_seen_at: new Date(now - (id === 'c' ? 48 * 3600000 : 0)).toISOString(),
    last_material_update: new Date(now).toISOString(),
    deadline_at: '2099-01-01T00:00:00Z',
    analysis: null,
    exclusion_reasons: [],
  }))
  await page.route('**/data/current.json', (route) => route.fulfill({ json: data }))
  return data
}
const row = (page: Page, id: string) => page.locator(`[data-signal-id="visibility-${id}"]`)

async function observeDeparture(target: Locator) {
  return target.evaluateHandle((element) => {
    const article = element.querySelector('article')!
    const startX = article.getBoundingClientRect().x
    const samples = { dustVisible: false, dustNonblank: false, leftwardTravel: 0, removed: false }
    let frame = 0
    // Observe each paint in the browser; protocol polling can miss a short animation.
    const sample = () => {
      if (!element.isConnected) {
        samples.removed = true
        return
      }
      samples.leftwardTravel = Math.max(
        samples.leftwardTravel,
        startX - article.getBoundingClientRect().x,
      )
      const canvas = element.querySelector<HTMLCanvasElement>('.dismiss-dust')
      if (canvas && !samples.dustNonblank) {
        const bounds = canvas.getBoundingClientRect()
        samples.dustVisible ||= bounds.width > 0 && bounds.height > 0
        const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        samples.dustNonblank = pixels.some((value, index) => index % 4 === 3 && value > 0)
      }
      frame = requestAnimationFrame(sample)
    }
    frame = requestAnimationFrame(sample)
    return { samples, stop: () => cancelAnimationFrame(frame) }
  })
}

async function hiddenMode(page: Page) {
  await page.getByRole('button', { name: /^Sort opportunities:/ }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Show hidden', exact: true }).click()
}
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await fixture(page)
})

test('hiding removes a record from results, selection and exports and Unhide restores its bookmark', async ({
  page,
}) => {
  await page.goto('./?view=all')
  await expect(row(page, 'a')).toBeVisible()
  await row(page, 'a').getByRole('button', { name: 'Save opportunity in this browser' }).click()
  await row(page, 'a')
    .getByRole('checkbox', { name: 'Hide CRM implementation A', exact: true })
    .click()
  await expect(row(page, 'a')).toHaveCount(0)
  await expect(page.locator('.feed-heading .count-badge')).toHaveText('2')
  await expect(row(page, 'b').locator('.row-select')).toBeFocused()
  await expect(page.locator('.dismiss-dust')).toHaveCount(0)
  if (page.viewportSize()!.width > 900)
    await expect(page.locator('.inspector-heading h2')).toHaveText('CRM implementation B')
  await page.goto('./?view=all&signal=visibility-a')
  await expect(row(page, 'b')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row(page, 'a')).toHaveCount(0)
  await page.reload()
  await expect(row(page, 'a')).toHaveCount(0)
  await expect(row(page, 'b')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export signals' }).click()
  const stream = await (await download).createReadStream()
  let exported = ''
  for await (const chunk of stream!) exported += chunk.toString()
  expect(exported).not.toContain('CRM implementation A')
  await hiddenMode(page)
  await expect(page.locator('.row-title')).toHaveText(['CRM implementation A'])
  await page.getByRole('button', { name: /^Sort opportunities:/ }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Show hidden' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(accessibility.violations).toEqual([])
  await page.keyboard.press('Escape')
  await row(page, 'a')
    .getByRole('checkbox', { name: 'Unhide CRM implementation A', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'No hidden signals' })).toBeVisible()
  await hiddenMode(page)
  await expect(page.locator('.row-title')).toHaveText([
    'CRM implementation A',
    'CRM implementation B',
    'CRM implementation C',
  ])
  await expect(row(page, 'a').getByRole('button', { name: 'Unsave opportunity' })).toBeVisible()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('anthrion-hidden-v1')!)),
  ).toEqual([])
})

test('Added today counts first collection, not updates, and hidden records stay market-scoped', async ({
  page,
}) => {
  await page.goto('./?view=today')
  await expect(page.locator('.row-title')).toHaveText([
    'CRM implementation A',
    'CRM implementation B',
  ])
  await row(page, 'a').getByRole('checkbox').click()
  await expect(page.locator('.feed-heading .count-badge')).toHaveText('1')
  await page
    .getByRole('navigation', { name: 'Markets' })
    .getByRole('button', { name: 'Germany', exact: true })
    .click()
  await expect(page.locator('.row-title')).toHaveText(['CRM implementation D'])
  await hiddenMode(page)
  await expect(page.getByRole('heading', { name: 'No hidden signals' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Markets' })
    .getByRole('button', { name: 'United Kingdom', exact: true })
    .click()
  await expect(page.locator('.row-title')).toHaveText(['CRM implementation A'])
  await page.getByRole('textbox', { name: 'Search opportunities' }).fill('does-not-match')
  await expect(page.getByRole('heading', { name: 'No hidden signals' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(row(page, 'a')).toBeVisible()
})

test('hide dust is nonblank, rows close the gap, and Unhide slides the record left', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./?view=all')
  await expect(row(page, 'a')).toBeVisible()
  const initialY = (await row(page, 'b').boundingBox())!.y
  const hideMotion = await observeDeparture(row(page, 'a'))
  try {
    await row(page, 'a').getByRole('checkbox').click()
    await expect.poll(() => hideMotion.evaluate(({ samples }) => samples.removed)).toBe(true)
    expect(await hideMotion.evaluate(({ samples }) => samples)).toMatchObject({
      dustVisible: true,
      dustNonblank: true,
    })
  } finally {
    await hideMotion.evaluate((observer) => observer.stop())
    await hideMotion.dispose()
  }
  await expect(row(page, 'a')).toHaveCount(0)
  await expect.poll(async () => (await row(page, 'b').boundingBox())!.y).toBeLessThan(initialY - 40)
  await expect(page.locator('.dismiss-dust')).toHaveCount(0)
  await hiddenMode(page)
  await expect(row(page, 'a')).toBeVisible()
  const unhideMotion = await observeDeparture(row(page, 'a'))
  try {
    await row(page, 'a').getByRole('checkbox').click()
    await expect.poll(() => unhideMotion.evaluate(({ samples }) => samples.removed)).toBe(true)
    expect(await unhideMotion.evaluate(({ samples }) => samples.leftwardTravel)).toBeGreaterThan(8)
  } finally {
    await unhideMotion.evaluate((observer) => observer.stop())
    await unhideMotion.dispose()
  }
  await expect(row(page, 'a')).toHaveCount(0)
  await hiddenMode(page)
  await expect(row(page, 'a')).toBeVisible()
})

test('glass reflections drift without rotating or resizing the refiners, and pause for reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./')
  const object = page.locator('.discovery-object[data-category="live"]')
  await expect(object).toBeVisible()
  await expect(page.locator('.discovery')).toHaveAttribute('data-light-motion', 'flowing')
  const before = await object.getAttribute('style')
  const transform = await object.evaluate((el) => getComputedStyle(el).transform)
  await expect.poll(() => object.getAttribute('style')).not.toBe(before)
  expect(await object.evaluate((el) => getComputedStyle(el).transform)).toBe(transform)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.discovery')).toHaveAttribute('data-light-motion', 'paused')
  await page.waitForTimeout(150)
  const paused = await object.getAttribute('style')
  await page.waitForTimeout(220)
  expect(await object.getAttribute('style')).toBe(paused)
})

test('Unhide completes after a delayed animation start', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() =>
    localStorage.setItem('anthrion-hidden-v1', JSON.stringify(['visibility-a'])),
  )
  await page.goto('./?view=all')
  await expect(row(page, 'a')).toHaveCount(0)
  await hiddenMode(page)
  await expect(row(page, 'a')).toBeVisible()
  await page.addStyleTag({
    content: ".row-motion[data-departure='unhide'] > .signal-row { animation-delay: 450ms; }",
  })
  const motion = await observeDeparture(row(page, 'a'))
  try {
    await row(page, 'a').getByRole('checkbox').click()
    await expect.poll(() => motion.evaluate(({ samples }) => samples.removed)).toBe(true)
    expect(await motion.evaluate(({ samples }) => samples.leftwardTravel)).toBeGreaterThan(8)
  } finally {
    await motion.evaluate((observer) => observer.stop())
    await motion.dispose()
  }
  await hiddenMode(page)
  await expect(row(page, 'a')).toBeVisible()
})

test('reduced motion interrupts a pending Unhide animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() =>
    localStorage.setItem('anthrion-hidden-v1', JSON.stringify(['visibility-a'])),
  )
  await page.goto('./?view=all')
  await hiddenMode(page)
  await expect(row(page, 'a')).toBeVisible()
  await page.addStyleTag({
    content: ".row-motion[data-departure='unhide'] > .signal-row { animation-delay: 450ms; }",
  })
  await row(page, 'a').getByRole('checkbox').click()
  await expect(row(page, 'a')).toHaveAttribute('data-departure', 'unhide')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.discovery')).toHaveAttribute('data-light-motion', 'paused')
  await expect(row(page, 'a')).toHaveCount(0)
  await hiddenMode(page)
  await expect(row(page, 'a')).toBeVisible()
})

test('hidden choices synchronize between tabs without clearing saved opportunities', async ({
  page,
  context,
}) => {
  const other = await context.newPage()
  await other.emulateMedia({ reducedMotion: 'reduce' })
  await fixture(other)
  await page.goto('./?view=all')
  await other.goto('./?view=all')
  await expect(row(other, 'a')).toBeVisible()
  await row(page, 'a').getByRole('checkbox').click()
  await expect(row(other, 'a')).toHaveCount(0)
  await hiddenMode(other)
  await row(other, 'a').getByRole('checkbox').click()
  await expect(row(page, 'a')).toBeVisible()
  await other.close()
})

test('blocked hidden storage and malformed preferences leave a usable workspace', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('anthrion-hidden-v1', '{broken')
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'anthrion-hidden-v1') throw new DOMException('Unavailable', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.goto('./?view=all')
  await expect(row(page, 'a')).toBeVisible()
  await row(page, 'a').getByRole('checkbox').click()
  await expect(row(page, 'a')).toHaveCount(0)
  await expect(page.getByText(/Hidden opportunities could not be saved/)).toBeVisible()
  await hiddenMode(page)
  await expect(row(page, 'a')).toBeVisible()
  await row(page, 'a').getByRole('checkbox').click()
  await hiddenMode(page)
  await expect(row(page, 'a')).toBeVisible()
})
