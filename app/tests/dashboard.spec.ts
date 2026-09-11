import { test, expect, type Download, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Dataset, Signal } from '../src/types'

const sourceFixture = (dataset: Dataset): Dataset => {
  const base = dataset.signals.find((signal) => signal.countries.includes('GB'))!
  const extra = [
    {
      id: 'fixture-crm',
      title: 'CRM platform and AI integration',
      signal_type: 'LIVE_TENDER',
      lifecycle_state: 'OPEN',
      procurement_stage: 'tender',
      delivery_priority: 'platform',
    },
    {
      id: 'fixture-planning',
      title: 'Customer platform market engagement',
      signal_type: 'EARLY_MARKET_ENGAGEMENT',
      lifecycle_state: 'EARLY_ENGAGEMENT',
      procurement_stage: 'planning',
      delivery_priority: 'platform',
    },
    {
      id: 'fixture-framework',
      title: 'CRM implementation framework',
      signal_type: 'FRAMEWORK',
      lifecycle_state: 'OPEN',
      procurement_stage: 'tender',
      delivery_priority: 'platform',
    },
    {
      id: 'fixture-funding',
      title: 'Digital platform partnership funding',
      signal_type: 'FUNDING',
      lifecycle_state: 'OPEN',
      procurement_stage: 'funding',
      delivery_priority: 'platform',
    },
  ].map(
    (fields) =>
      ({
        ...base,
        ...fields,
        countries: ['GB'],
        status: 'active',
        description: 'Implementation of a customer platform with integration and reporting.',
        published_at: '2026-09-10T12:00:00+00:00',
        deadline_at: '2099-01-01T12:00:00+00:00',
        exclusion_reasons: [],
        eligibility_status: 'CHECK_REQUIRED',
        framework: fields.signal_type === 'FRAMEWORK' ? 'Framework agreement' : null,
      }) as Signal,
  )
  return {
    ...dataset,
    signals: [...extra, ...dataset.signals].map((signal) => ({
      ...signal,
      fit_score: null,
      confidence_score: 0,
      ai_status: 'disabled',
      analysis: null,
      ai_summary: null,
      score_components: [],
      score_explanation: '',
    })),
  }
}

const isolatedDataset = async (page: Page) => {
  const response = await page.request.get('./data/current.json')
  expect(response.ok()).toBe(true)
  return sourceFixture(await response.json())
}
const installDataset = (page: Page, dataset: Dataset) =>
  page.route('**/data/current.json', (route) => route.fulfill({ json: dataset }))
const downloadText = async (download: Download) => {
  const stream = await download.createReadStream()
  expect(stream).not.toBeNull()
  stream!.setEncoding('utf8')
  let text = ''
  for await (const chunk of stream!) text += chunk
  return text
}

const ready = async (page: Page) => {
  await expect(page.locator('.signal-row').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}
const discoveryCard = (page: Page, label: string) =>
  page.locator('.discovery-card').filter({ has: page.getByText(label, { exact: true }) })
const selectDiscovery = async (page: Page, label: string) => {
  const card = discoveryCard(page, label)
  const position = page.getByRole('button', { name: `Show ${label}`, exact: true })
  await expect.poll(async () => (await position.isVisible()) || (await card.isVisible())).toBe(true)
  if (await position.isVisible()) await position.click()
  await card.click({ timeout: 10000 })
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  return card
}
const expectMarket = (page: Page, name: string) =>
  expect(
    page.getByRole('navigation', { name: 'Markets' }).getByRole('button', { name, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
const shaderPixels = (canvas: Locator) =>
  canvas.evaluate(
    (el) =>
      new Promise<{ hash: number; colors: number }>((resolve) => {
        requestAnimationFrame(() => {
          const c = el as HTMLCanvasElement,
            gl = c.getContext('webgl2')!
          const data = new Uint8Array(c.width * c.height * 4)
          gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, data)
          let hash = 0
          const colors = new Set<number>()
          for (let i = 0; i < data.length; i += 4) {
            hash = (Math.imul(hash, 31) + data[i] + data[i + 1] * 3 + data[i + 2] * 7) | 0
            colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
          }
          resolve({ hash, colors: colors.size })
        })
      }),
  )
const detail = async (page: Page, index = 0) => {
  await page.locator('.row-select').nth(index).click()
  await page.getByRole('button', { name: 'Full details', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Opportunity intelligence' })).toBeVisible()
}
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Deterministic source facts exercise every optional category without API calls.
  // These in-memory records never change canonical data or production assets.
  await page.route('**/data/current.json', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: sourceFixture(await response.json()) })
  })
})

test('real feed, logo, filtering, saving, evidence and search', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./')
  await ready(page)
  await expectMarket(page, 'United Kingdom')
  await expect(page.locator('.workspace-brand img')).toHaveAttribute('src', /anthrion-logo.svg/)
  expect(
    await page.locator('.workspace-brand img').evaluate((el: HTMLImageElement) => el.naturalWidth),
  ).toBeGreaterThan(0)
  await page.screenshot({ path: `../artifacts/console-${info.project.name}.png` })
  await page
    .locator('.signal-row')
    .first()
    .getByRole('button', { name: 'Save opportunity in this browser' })
    .click()
  await expect(
    page.locator('.signal-row').first().getByRole('button', { name: 'Unsave opportunity' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByLabel('Buyer', { exact: true }).fill('no-such-buyer-xyz')
  await page.getByRole('button', { name: 'Show 0 signals' }).click()
  await expect(page.getByText('No matching signals', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Clear 1 filters/ }).click()
  await detail(page)
  await expect(
    page.getByRole('dialog').getByRole('link', { name: 'Open source notice' }),
  ).toHaveAttribute('href', /^https:/)
  for (const name of ['Sources & timeline', 'Overview']) {
    await page.getByRole('tab', { name, exact: true }).click()
    await expect(page.getByRole('tabpanel')).toBeVisible()
  }
  await page.getByRole('button', { name: 'Close panel' }).click()
  await page.getByRole('textbox', { name: 'Search opportunities' }).fill('no-such-opportunity-xyz')
  await expect(page.getByText('No matching signals', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await ready(page)
  expect(errors).toEqual([])
})

test('console selection instantly changes details without navigating away', async ({ page }) => {
  await page.goto('./')
  await ready(page)
  const title = await page.locator('.row-title').nth(1).textContent()
  await page.locator('.row-select').nth(1).click()
  if (page.viewportSize()!.width > 900) {
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.inspector-heading h2')).toHaveText(title!)
    await expect(page.locator('.row-select').nth(1)).toHaveAttribute('aria-pressed', 'true')
    await page.locator('.row-select').first().focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.row-select').first()).toHaveAttribute('aria-pressed', 'true')
  } else {
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog').locator('.inspector-heading h2')).toHaveText(title!)
  }
})

test('five discovery categories remain useful filters', async ({ page }) => {
  await page.goto('./')
  await ready(page)
  for (const label of [
    'All Signals',
    'Live Opportunities',
    'Pre-market',
    'Closing Soon',
    'Added today',
  ]) {
    const item = await selectDiscovery(page, label)
    await expect(page.locator('.feed-heading h1')).toHaveText(label)
    await expect(item).toHaveAttribute('aria-pressed', 'true')
    const count = (await item.locator('.discovery-value').textContent())!.replaceAll(',', '')
    await expect(page.locator('.feed-heading .count-badge')).toHaveText(count)
  }
  for (const name of ['Saved opportunities']) {
    await page
      .locator('.workspace-nav')
      .getByRole('button', { name: new RegExp(name) })
      .click()
    await expect(page.locator('.feed-heading h1')).toHaveText(name)
  }
  await expect(
    page.locator(
      '.sidebar, .workspace-switch, .account, .capability-filters, .breadcrumb, .stat-note, .system-status, .lucide-sparkles, .page-footer, .source-page, .inspector-links, .inspector-topline, .carousel-play',
    ),
  ).toHaveCount(0)
})

test('optical glass refiners and source links preserve the selected record edge', async ({
  page,
}) => {
  await page.goto('./?view=live')
  await ready(page)
  const active = page.locator('.discovery-card[aria-pressed="true"]')
  const glass = page.locator('.discovery-glass[data-selected="true"]')
  await expect(glass).toHaveClass(/optical-glass/)
  await expect(active).toHaveCSS('overflow', 'hidden')
  await expect(page.locator('.discovery-track')).toHaveCSS('transition-property', 'none')
  await expect(page.locator('.discovery-control').first()).toHaveCSS('transition-property', 'none')
  await expect(page.locator('.discovery-card .metal-edge')).toHaveCount(0)
  await expect(page.locator('.signal-row.selected .metal-edge')).toBeVisible()
  const imageSource = await glass.evaluate(
    (element) => getComputedStyle(element, '::before').borderImageSource,
  )
  expect(imageSource).toContain('optical-glass-material.png')
  const imageURL = imageSource.slice(5, -2)
  const asset = await page.request.get(imageURL)
  expect(asset.ok()).toBe(true)
  expect(asset.headers()['content-type']).toContain('image/png')
  const positions = await active.evaluate((element) => {
    const value = element.querySelector('.discovery-value')!.getBoundingClientRect()
    const icon = element.querySelector('.discovery-icon')!.getBoundingClientRect()
    return { value: value.left, icon: icon.left }
  })
  expect(positions.value).toBeLessThan(positions.icon)
  if (page.viewportSize()!.width <= 900) await detail(page)
  const link = page.locator('.glass-source-button:visible').first()
  await expect(link).toHaveAttribute('href', /^https:/)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link.locator('.source-link-icon')).toBeVisible()
  await expect(link).toHaveCSS('overflow', 'hidden')
  await expect(link).toHaveCSS('border-radius', '6px')
  expect(await link.evaluate((el) => getComputedStyle(el, '::before').borderImageSource)).toBe(
    'none',
  )
  await expect(link.locator('.metal-edge')).toHaveCount(0)
  const href = await link.getAttribute('href')
  await page
    .context()
    .route(href!, (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'Source notice test' }),
    )
  const popupPromise = page.waitForEvent('popup')
  await link.focus()
  await page.keyboard.press('Enter')
  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded')
  expect(popup.url()).toBe(href)
  await popup.close()
})

test('every discovery label fits its card at compact and wide sizes', async ({ page }, info) => {
  test.setTimeout(120000)
  await page.goto('./?view=live')
  await ready(page)
  for (const width of [320, 390, 430, 768, 900, 901, 1024, 1139, 1220, 1262, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 920 })
    for (const label of ['Live Opportunities', 'Added today', 'Pre-market']) {
      const card = await selectDiscovery(page, label)
      await expect(card).toHaveAttribute('aria-pressed', 'true')
      await expect(card).toHaveCSS('backdrop-filter', 'none')
      await expect(card).toHaveCSS('filter', 'none')
      const typePlane = await card.evaluate((element) => {
        const object = element.parentElement!
        const matrix = new DOMMatrixReadOnly(getComputedStyle(object).transform)
        const rect = element.getBoundingClientRect()
        const viewport = document.querySelector('.discovery-viewport')!.getBoundingClientRect()
        return {
          scaleX: Math.abs(matrix.m11),
          scaleY: Math.abs(matrix.m22),
          pixelX: Math.abs(rect.left - Math.round(rect.left)),
          pixelY: Math.abs(rect.top - Math.round(rect.top)),
          fullyVisible: rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1,
        }
      })
      expect(typePlane.fullyVisible, `${width}px selected card is fully visible`).toBe(true)
      expect(typePlane.scaleX).toBeCloseTo(1, 5)
      expect(typePlane.scaleY).toBeCloseTo(1, 5)
      expect(typePlane.pixelX).toBeLessThan(0.01)
      expect(typePlane.pixelY).toBeLessThan(0.01)
      const overflow = await page.locator('.discovery-card:visible').evaluateAll((cards) =>
        cards.flatMap((card) => {
          const bounds = card.getBoundingClientRect()
          return [...card.querySelectorAll('.discovery-name, .discovery-value')].flatMap((node) => {
            const range = document.createRange()
            range.selectNodeContents(node)
            return [...range.getClientRects()]
              .filter(
                (rect) =>
                  rect.width &&
                  rect.height &&
                  (rect.left < bounds.left + 2 ||
                    rect.right > bounds.right - 2 ||
                    rect.top < bounds.top + 2 ||
                    rect.bottom > bounds.bottom - 2),
              )
              .map(() => node.textContent)
          })
        }),
      )
      expect(overflow, `${width}px, ${label}`).toEqual([])
      const overlaps = await page.locator('.discovery-card:visible').evaluateAll((cards) =>
        cards.flatMap((card, index) => {
          const bounds = card.getBoundingClientRect()
          return cards
            .slice(index + 1)
            .filter((other) => {
              const next = other.getBoundingClientRect()
              return (
                Math.min(bounds.right, next.right) - Math.max(bounds.left, next.left) > 1 &&
                Math.min(bounds.bottom, next.bottom) - Math.max(bounds.top, next.top) > 1
              )
            })
            .map((other) => `${card.textContent} / ${other.textContent}`)
        }),
      )
      expect(overlaps, `${width}px category controls must not overlap`).toEqual([])
    }
  }
  await page.setViewportSize({ width: 1262, height: 920 })
  await selectDiscovery(page, 'Live Opportunities')
  await page.screenshot({ path: `../artifacts/console-compact-fixed-${info.project.name}.png` })
})

test('market rail is centred without the removed summary and remains keyboard accessible', async ({
  page,
}) => {
  await page.goto('./')
  await ready(page)
  await expect(page.locator('.market-heading, .market-separator, .market-coverage')).toHaveCount(0)
  await expect(page.locator('h1')).toHaveText('Live Opportunities')
  for (const width of [390, 1139, 1440, 1920]) {
    await page.setViewportSize({ width, height: 920 })
    const rail = await page.locator('.market-tabs').boundingBox()
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(Math.abs(rail!.x + rail!.width / 2 - clientWidth / 2)).toBeLessThan(1)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const greece = page
    .getByRole('navigation', { name: 'Markets' })
    .getByRole('button', { name: 'Greece', exact: true })
  await greece.focus()
  await page.keyboard.press('Enter')
  await expectMarket(page, 'Greece')
  await expect(page).toHaveURL(/market=GR/)
})

test('carousel typography stays fixed throughout dragging in dark mode', async ({ page }, info) => {
  test.setTimeout(120000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./')
  await ready(page)
  const control = page.locator('.discovery-control[data-category="live"]')
  const readType = () =>
    control.locator('.discovery-value, .discovery-name').evaluateAll((elements) =>
      elements.map((el) => {
        const range = document.createRange()
        range.selectNodeContents(el)
        const rect = range.getBoundingClientRect()
        const style = getComputedStyle(el)
        return {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          width: rect.width,
          height: rect.height,
        }
      }),
    )
  for (const width of [390, 1139, 1262]) {
    await page.setViewportSize({ width, height: 920 })
    for (const theme of ['dark']) {
      const position = page.getByRole('button', {
        name: 'Show Live Opportunities',
        exact: true,
      })
      const scrollable = width <= 900
      await expect(position).toHaveCount(scrollable ? 1 : 0)
      if (scrollable) await position.click()
      else await discoveryCard(page, 'Live Opportunities').click()
      await expect(control).toBeVisible()
      await expect(control).toHaveCSS('transform', 'none')
      const before = await readType()
      const glass = page.locator('.discovery-object[data-category="live"]')
      const glassBefore = await glass.getAttribute('style')
      const poseBefore = (await glass.boundingBox())!
      const reflection = () =>
        glass.evaluate((el) => {
          const style = getComputedStyle(el)
          return ['x', 'y', 'angle', 'strength', 'edge'].map((key) =>
            style.getPropertyValue(`--reflection-${key}`),
          )
        })
      const reflectionBefore = await reflection()
      const box = await control.boundingBox()
      const start = { x: box!.x + box!.width / 2, y: box!.y + 60 }
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      for (const distance of [30, 65, 110, 145]) {
        await page.mouse.move(start.x - distance, start.y, { steps: 5 })
        await page.evaluate(() => new Promise(requestAnimationFrame))
        const during = await readType()
        during.forEach((value, index) => {
          expect(value.fontSize, `${width}px ${theme} font`).toBe(before[index].fontSize)
          expect(value.lineHeight).toBe(before[index].lineHeight)
          expect(value.width).toBeCloseTo(before[index].width, 3)
          expect(value.height).toBeCloseTo(before[index].height, 3)
        })
        await expect(control).toHaveCSS('transform', 'none')
      }
      expect(await glass.getAttribute('style')).not.toBe(glassBefore)
      const displacement = Math.abs((await glass.boundingBox())!.x - poseBefore.x)
      if (scrollable) expect(displacement).toBeGreaterThan(2)
      else expect(displacement).toBeLessThan(1)
      expect(await reflection(), `${width}px glass reflection must remain animated`).not.toEqual(
        reflectionBefore,
      )
      if (width === 1139)
        await page.screenshot({ path: `../artifacts/drag-${theme}-${info.project.name}.png` })
      await page.mouse.up()
      await expect(page.locator('.feed-heading h1')).toHaveText('Live Opportunities')
    }
  }
})

test('reduced-motion glass stays still and the source dock stays anchored during scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1139, height: 920 })
  await page.goto('./')
  await ready(page)
  const glass = page.locator('.discovery-object[data-category="live"]')
  {
    await expect(glass).toBeVisible()
    await expect(discoveryCard(page, 'Live Opportunities')).toHaveAttribute('aria-pressed', 'true')
    const surface = glass.locator('.discovery-glass')
    const alpha = await surface.evaluate((el) =>
      Number(getComputedStyle(el).backgroundColor.split(',')[3]?.replace(')', '')),
    )
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThan(0.2)
    const reflected = await glass.getAttribute('style')
    await page.waitForTimeout(200)
    expect(await glass.getAttribute('style')).toBe(reflected)
    const scroller = page.locator('.inspector-scroll')
    await scroller.evaluate((el) => el.scrollTo(0, 0))
    const link = page.locator('.console-inspector .glass-source-button')
    const angle = () =>
      link.evaluate((el) => getComputedStyle(el).getPropertyValue('--reflection-angle'))
    await expect.poll(angle).not.toBe('')
    await page.waitForTimeout(100)
    const before = await angle()
    const bounds = await link.boundingBox()
    await scroller.evaluate((el) => el.scrollTo(0, 160))
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    expect(await link.boundingBox()).toEqual(bounds)
    expect(await angle()).toBe(before)
    await expect(link).toHaveCSS('border-radius', '6px')
  }
})

test('all market tabs have real, correctly scoped records and opportunity counts', async ({
  page,
}, info) => {
  await page.goto('./?view=all')
  await ready(page)
  const dataset = await page.evaluate(async () => (await fetch('./data/current.json')).json())
  for (const [id, name, countries] of [
    ['GB', 'United Kingdom', ['GB']],
    ['US', 'United States', ['US']],
    ['IT', 'Italy', ['IT']],
    ['NORDICS', 'Nordics', ['SE', 'FI', 'DK', 'NO', 'IS']],
    ['DE', 'Germany', ['DE']],
    ['ES', 'Spain', ['ES']],
    ['GR', 'Greece', ['GR']],
  ] as const) {
    await page
      .getByRole('navigation', { name: 'Markets' })
      .getByRole('button', { name, exact: true })
      .click()
    await expectMarket(page, name)
    await ready(page)
    const expected = dataset.signals.filter((s: { countries: string[] }) =>
      s.countries.some((c) => (countries as readonly string[]).includes(c)),
    )
    expect(expected.length).toBeGreaterThan(0)
    await expect(page.locator('.feed-heading .count-badge')).toHaveText(String(expected.length))
    expect(new URL(page.url()).searchParams.get('market') || 'GB').toBe(id)
  }
  await page.reload()
  await ready(page)
  await expectMarket(page, 'Greece')
  await page.screenshot({ path: `../artifacts/market-greece-${info.project.name}.png` })
  await page.goto('./?view=sources&market=US')
  await ready(page)
  await expectMarket(page, 'United States')
  await expect(page.locator('.feed-heading h1')).toHaveText('All Signals')
  await expect(page.locator('.source-page')).toHaveCount(0)
  expect(dataset.sources.find((s: { id: string }) => s.id === 'usaspending').enabled).toBe(false)
})

test('CSV export retains source facts and comparison is removed', async ({ page }) => {
  await page.goto('./?view=all')
  await ready(page)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export signals', exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/anthrion-signals.*csv/)
  const exported = await downloadText(file)
  const headers = exported.split(/\r?\n/, 1)[0].toLowerCase()
  expect(headers).toContain('title')
  expect(headers).toContain('source')
  expect(headers).not.toMatch(/score|confidence|recommendation|requirements|ai_summary/)
  await expect(page.locator('.compare-control, .compare-tray, .comparison-grid')).toHaveCount(0)
  await expect(page.locator('.signal-row .hide-control').first()).toBeVisible()
})

test('every refiner and sort keeps platform opportunities before standalone AI', async ({
  page,
}) => {
  test.setTimeout(120000)
  const dataset = await isolatedDataset(page)
  const base = dataset.signals[0]
  const now = Date.now()
  const groups = ['platform', 'ai', 'other'] as const
  const title = (group: string, older: number) =>
    `${group} opportunity ${older ? 'older' : 'newer'}`
  const order = (reverse: boolean) =>
    groups.flatMap((group) => (reverse ? [1, 0] : [0, 1]).map((older) => title(group, older)))
  let signals: Signal[] = []
  await page.route('**/data/current.json', (route) =>
    route.fulfill({ json: { ...dataset, signals } }),
  )
  for (const view of ['all', 'live', 'early', 'closing', 'today']) {
    signals = groups.flatMap((group, groupIndex) =>
      [0, 1].map((older) => ({
        ...base,
        id: `priority-${group}-${older}`,
        title: title(group, older),
        description:
          group === 'platform'
            ? 'Salesforce CRM implementation with an integrated AI assistant.'
            : group === 'ai'
              ? 'Standalone artificial intelligence agent implementation.'
              : 'Other published technology services.',
        delivery_priority: group,
        // Later groups are more recent overall, so a global date sort would be wrong.
        published_at: new Date(now - ((2 - groupIndex) * 2 + older + 1) * 86400000).toISOString(),
        last_material_update: new Date(now - (1 - older) * 3600000).toISOString(),
        first_seen_at: new Date(now).toISOString(),
        deadline_at: new Date(now + (3 - older) * 86400000).toISOString(),
        value_min: null,
        value_max: (older + 1) * 100000,
        currency: 'GBP',
        signal_type:
          view === 'early'
            ? older
              ? 'PIPELINE'
              : 'EARLY_MARKET_ENGAGEMENT'
            : view === 'frameworks'
              ? 'FRAMEWORK'
              : view === 'funding'
                ? 'FUNDING'
                : 'LIVE_TENDER',
        procurement_stage: view === 'early' ? 'planning' : 'tender',
        lifecycle_state: view === 'early' ? (older ? 'FUTURE' : 'EARLY_ENGAGEMENT') : 'OPEN',
        framework: view === 'frameworks' ? 'Open framework agreement' : null,
      })),
    )
    await page.goto(`./?view=${view}`)
    await ready(page)
    await expect(page.locator('.feed-heading .count-badge')).toHaveText('6')
    await expect(page.locator('.row-title')).toHaveText(order(false))
    for (const label of ['Recently updated', 'Closing soon', 'Highest value (GBP)']) {
      await page.getByRole('button', { name: /^Sort opportunities:/ }).click()
      await page.getByRole('menuitemradio', { name: label, exact: true }).click()
      await expect(page.locator('.row-title')).toHaveText(order(true))
    }
    await page.getByRole('button', { name: /^Sort opportunities:/ }).click()
    await page.getByRole('menuitemradio', { name: 'Most recent', exact: true }).click()
    await expect(page.locator('.row-title')).toHaveText(order(false))
  }
})

test('old AI metadata never returns in filters, details or exports', async ({ page }) => {
  const dataset = await isolatedDataset(page)
  const base = dataset.signals[0]
  const stale = 'LEGACY_GENERATED_ASSESSMENT_DO_NOT_DISPLAY'
  dataset.signals = [0, 1].map((index) => ({
    ...base,
    id: `legacy-assessment-${index}`,
    title: `Published CRM opportunity ${index}`,
    description: 'Original buyer description of a CRM implementation and integration programme.',
    fit_score: 99,
    confidence_score: 99,
    recommendation: 'PURSUE',
    ai_status: 'scored',
    score_explanation: stale,
    analysis: {
      summary: stale,
      buyer_intent: stale,
      eligibility_checks: [],
      requirements: [{ requirement: stale, evidence: stale }],
    } as unknown as Signal['analysis'],
  }))
  await installDataset(page, dataset)
  await page.goto('./?view=live&score=99&confidence=99&recommendation=PURSUE&sort=fit')
  await ready(page)
  await expect(page.locator('.feed-heading .count-badge')).toHaveText('2')
  await expect(page.getByRole('button', { name: 'Sort opportunities: Most recent' })).toBeVisible()
  await expect(
    page.getByText(/Fit score|Evidence confidence|Analysis pending|Analysis complete/),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toContainText(
    /Minimum fit|Minimum confidence|Recommendation/,
  )
  await page.getByRole('button', { name: 'Close panel' }).click()
  await detail(page)
  await expect(page.getByRole('tab')).toHaveText(['Overview', 'Sources & timeline'])
  await expect(page.getByRole('tabpanel')).toContainText(dataset.signals[0].description)
  await expect(page.getByRole('dialog')).not.toContainText(stale)
  await page.getByRole('tab', { name: 'Sources & timeline' }).click()
  await expect(page.getByRole('dialog')).not.toContainText(stale)
  await page.getByRole('button', { name: 'Close panel' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export signals', exact: true }).click()
  const exported = await downloadText(await download)
  expect(exported).not.toContain(stale)
  expect(exported).not.toContain('PURSUE')
})

test('measured result windows reach every record without pagination or unbounded DOM growth', async ({
  page,
}) => {
  test.setTimeout(90000)
  const dataset = await isolatedDataset(page)
  const base = dataset.signals[0]
  const now = Date.now()
  const total = 2000
  const title = (index: number) => `Opportunity ${String(index).padStart(4, '0')}`
  dataset.signals = Array.from({ length: total }, (_, index) => ({
    ...base,
    id: `virtual-${index}`,
    title: title(index),
    buyer_name:
      index % 4 === 0
        ? 'Public authority with a longer organisation name for varied measured row heights'
        : 'Public authority',
    description: `Source notice ${index} for CRM implementation and integration.`,
    published_at: new Date(now - index * 1000).toISOString(),
    delivery_priority: 'platform',
  }))
  await installDataset(page, dataset)
  await page.goto('./')
  await ready(page)
  const rows = page.locator('.virtual-signal-row')
  const first = page.locator('.virtual-signal-row[data-index="0"] .row-select')
  const last = page.locator(`.virtual-signal-row[data-index="${total - 1}"] .row-select`)
  await expect(page.getByRole('list', { name: 'Opportunity results' })).toBeVisible()
  await expect(rows.first()).toHaveAttribute('aria-setsize', String(total))
  expect(await rows.count()).toBeLessThan(45)
  await expect(page.locator('.pagination')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /Next page|Previous page|Load more/i }),
  ).toHaveCount(0)
  if (page.viewportSize()!.width > 900) {
    await page.locator('.signal-feed').evaluate((el) => el.scrollTo(0, el.scrollHeight))
  } else {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  }
  await expect(last).toBeVisible()
  await expect(last.locator('.row-title')).toHaveText(title(total - 1))
  expect(await rows.count()).toBeLessThan(45)
  await last.click()
  if (page.viewportSize()!.width > 900) {
    await expect(page.locator('.inspector-heading h2')).toHaveText(title(total - 1))
  } else {
    await expect(page.getByRole('dialog').locator('.inspector-heading h2')).toHaveText(
      title(total - 1),
    )
    await page.getByRole('button', { name: 'Close panel' }).click()
  }
  await last.focus()
  await page.keyboard.press('Home')
  await expect(first).toBeFocused()
  await expect(first).toBeVisible()
  await page.keyboard.press('End')
  await expect(last).toBeFocused()
  await expect(last).toBeVisible()
  expect(await rows.count()).toBeLessThan(50)
  await page.getByRole('textbox', { name: 'Search opportunities' }).fill(title(total - 1))
  await expect(page.locator('.row-title')).toHaveText([title(total - 1)])
  await expect(page.locator('.row-select')).toBeVisible()
  await expect(page.locator('.feed-heading .count-badge')).toHaveText('1')
})

test('exactly five refiners remain available across markets and empty states', async ({ page }) => {
  if (page.viewportSize()!.width <= 900) {
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  }
  const dataset = await isolatedDataset(page)
  const base = dataset.signals[0]
  dataset.signals = [{ ...base, countries: ['DE'] }]
  await installDataset(page, dataset)
  await page.goto('./?market=DE')
  await ready(page)
  for (const label of [
    'All Signals',
    'Live Opportunities',
    'Pre-market',
    'Closing Soon',
    'Added today',
  ]) {
    await expect(discoveryCard(page, label)).toHaveCount(1)
  }
  for (const label of [
    'Top Signals',
    'Future & Pipeline',
    'Awards',
    'Renewals',
    'Frameworks',
    'Funding & Partnerships',
  ]) {
    await expect(discoveryCard(page, label)).toHaveCount(0)
  }
  if (page.viewportSize()!.width > 900) {
    await expect(page.locator('.carousel-arrow, .carousel-pagination')).toHaveCount(0)
    const viewport = (await page.locator('.discovery-viewport').boundingBox())!
    for (const label of [
      'All Signals',
      'Live Opportunities',
      'Pre-market',
      'Closing Soon',
      'Added today',
    ]) {
      const bounds = (await discoveryCard(page, label).boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(viewport.x - 1)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.x + viewport.width + 1)
    }
  }
  await (await selectDiscovery(page, 'Live Opportunities')).focus()
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const label of [
      'Pre-market',
      'Closing Soon',
      'Added today',
      'All Signals',
      'Live Opportunities',
    ]) {
      await page.keyboard.press('ArrowRight')
      await expect(discoveryCard(page, label)).toBeFocused()
      await expect(discoveryCard(page, label)).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('.feed-heading h1')).toHaveText(label)
    }
  }
  await selectDiscovery(page, 'Pre-market')
  await expect(page.locator('.feed-heading h1')).toHaveText('Pre-market')
  await expect(page.locator('.feed-heading .count-badge')).toHaveText('0')
  await expect(page.getByText('No matching signals', { exact: true })).toBeVisible()
})

test('market currency controls sort and filter without cross-currency comparisons', async ({
  page,
}) => {
  await page.goto('./?view=all&market=US')
  await ready(page)
  await page.getByRole('button', { name: 'Sort opportunities: Most recent' }).click()
  await page.getByRole('menuitemradio', { name: 'Highest value (USD)' }).click()
  await expect(
    page.getByRole('button', { name: 'Sort opportunities: Highest value (USD)' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByLabel('Currency', { exact: true }).selectOption('USD')
  await page.getByLabel('Minimum value (USD)', { exact: true }).fill('100000')
  await page.getByRole('button', { name: /^Show \d+ signals$/ }).click()
  await ready(page)
  expect(page.url()).toContain('currency=USD')
})

test('failed refresh and malformed storage retain a usable workspace', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('anthrion-saved-v1', '{"bad":"shape"}')
    localStorage.setItem('anthrion-views-v1', '[null]')
  })
  await page.goto('./')
  await ready(page)
  const title = await page.locator('.row-title').first().textContent()
  await page.route('**/data/current.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  )
  await page.getByRole('button', { name: 'Check for updates' }).click()
  await expect(
    page.getByText('The latest opportunity feed is temporarily unavailable.'),
  ).toBeVisible()
  await expect(page.locator('.row-title').first()).toHaveText(title!)
})

test('saved views and updates navigation stay removed even with legacy storage and URLs', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'anthrion-views-v1',
      JSON.stringify([{ name: 'Legacy saved view', filters: { view: 'all' } }]),
    ),
  )
  await page.goto('./?view=all&q=CRM')
  await ready(page)
  await expect(page.getByRole('button', { name: /Save view|Latest updates/ })).toHaveCount(0)
  await expect(page.getByText('Legacy saved view')).toHaveCount(0)
  await expect(
    page.locator('.workspace-nav').getByRole('button', { name: /Saved opportunities/ }),
  ).toBeVisible()
  await page.goto('./?view=updates')
  await expect(page.locator('.feed-heading h1')).toHaveText('Added today')
  expect(new URL(page.url()).searchParams.get('view')).toBe('today')
  await page.reload()
  await expect(page.getByRole('button', { name: /Save view|Latest updates/ })).toHaveCount(0)
})

test('compact and wide layouts have no horizontal overflow', async ({ page }, info) => {
  for (const width of info.project.name === 'mobile' ? [320, 430, 768] : [1024, 1262, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('./')
    await ready(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    expect(await page.locator('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    )
    await page.getByRole('button', { name: 'Close panel' }).click()
  }
})

test('long headings, deep links and missing signals remain usable', async ({ page }, info) => {
  await page.setViewportSize({ width: info.project.name === 'mobile' ? 320 : 1440, height: 568 })
  const data = await (await page.request.get('./data/current.json')).json()
  const longest = [...data.signals].sort((a, b) => b.title.length - a.title.length)[0]
  await page.goto(`./?signal=${encodeURIComponent(longest.id)}`)
  await page.getByRole('button', { name: 'Full details', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('tab', { name: 'Sources & timeline' }).click()
  const box = await page.getByRole('dialog').evaluate((el) => {
    const panel = el.querySelector('.detail-content')!.getBoundingClientRect()
    return { height: panel.height, width: el.scrollWidth, available: el.clientWidth }
  })
  expect(box.height).toBeGreaterThan(150)
  expect(box.width).toBeLessThanOrEqual(box.available)
  await page.screenshot({ path: `../artifacts/long-title-${info.project.name}.png` })
  await page.goto('./?signal=nonexistent')
  await expect(page.getByRole('dialog', { name: 'Opportunity unavailable' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to opportunities' }).click()
  await ready(page)
})

test('dark-only UI ignores old light preferences and keeps evidence keyboard navigation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('anthrion-console-theme-v2', JSON.stringify('light'))
    localStorage.setItem('anthrion-theme-v1', JSON.stringify('light'))
  })
  await page.goto('./')
  await ready(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: /Switch to .* mode/ })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await ready(page)
  await detail(page)
  await page.getByRole('tab', { name: 'Overview', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Sources & timeline' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Sources & timeline' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('sort menu supports keyboard selection, dismissal and clean positioning', async ({
  page,
}, info) => {
  await page.goto('./')
  await ready(page)
  const trigger = page.getByRole('button', { name: 'Sort opportunities: Most recent' })
  await trigger.click()
  const menu = page.getByRole('menu', { name: 'Sort opportunities' })
  await expect(menu.getByRole('menuitemradio', { name: 'Most recent', exact: true })).toBeFocused()
  await page.screenshot({ path: `../artifacts/sort-menu-${info.project.name}.png` })
  const box = await menu.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  expect(new URL(page.url()).searchParams.get('sort')).toBe('deadline')
  const closing = page.getByRole('button', { name: 'Sort opportunities: Closing soon' })
  await expect(closing).toBeFocused()
  await expect(menu).toBeHidden()
  await closing.click()
  await page.keyboard.press('End')
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Show hidden' })).toBeFocused()
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  expect(new URL(page.url()).searchParams.get('sort') || 'recent').toBe('recent')
  const recent = page.getByRole('button', { name: 'Sort opportunities: Most recent' })
  await expect(recent).toBeFocused()
  await recent.click()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await recent.click()
  await page.locator('.market-section').click({ position: { x: 5, y: 5 } })
  await expect(menu).toBeHidden()
  for (const width of [320, 390, 620, 900, 1440]) {
    await page.setViewportSize({ width, height: 920 })
    for (const hidden of [false, true]) {
      await recent.click()
      const bounds = (await menu.boundingBox())!
      expect(bounds.x, `${width}px menu left`).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width, `${width}px menu right`).toBeLessThanOrEqual(width)
      const checkbox = menu.getByRole('menuitemcheckbox', { name: 'Show hidden' })
      await expect(checkbox).toHaveAttribute('aria-checked', String(hidden))
      await checkbox.click()
    }
  }
})

test('straight discovery cards stay fixed on desktop and navigate manually on mobile', async ({
  page,
}) => {
  await page.goto('./')
  await ready(page)
  const allPosition = page.getByRole('button', { name: 'Show All Signals', exact: true })
  const previous = page.getByRole('button', { name: 'Previous categories', exact: true })
  const next = page.getByRole('button', { name: 'Next categories', exact: true })
  if (!(await allPosition.isVisible())) {
    await expect(page.locator('.carousel-arrow, .carousel-pagination')).toHaveCount(0)
    const bounds = await page.locator('.discovery-object').evaluateAll((elements) =>
      elements.map((el) => {
        const matrix = new DOMMatrix(getComputedStyle(el).transform)
        return {
          angle:
            Math.abs(matrix.m12) +
            Math.abs(matrix.m13) +
            Math.abs(matrix.m21) +
            Math.abs(matrix.m23),
          y: el.getBoundingClientRect().y,
        }
      }),
    )
    expect(bounds.every((b) => b.angle < 0.001)).toBe(true)
    expect(Math.max(...bounds.map((b) => b.y)) - Math.min(...bounds.map((b) => b.y))).toBeLessThan(
      1,
    )
    await expect(page.locator('.feed-heading h1')).toHaveText('Live Opportunities')
    return
  }
  await allPosition.click()
  const loops = await previous.isEnabled()
  if (loops) {
    await previous.click()
    await expect(
      page.getByRole('button', { name: 'Show Added today', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await next.click()
    await expect(allPosition).toHaveAttribute('aria-pressed', 'true')
  } else {
    await expect(previous).toBeDisabled()
    await expect(next).toBeEnabled()
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await allPosition.click()
  const before = await page.locator('.discovery-object').first().getAttribute('style')
  await expect(page.getByRole('button', { name: /discovery rotation/ })).toHaveCount(0)
  await next.click()
  await expect(
    page.getByRole('button', { name: 'Show Live Opportunities', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true', { timeout: 12000 })
  expect(await page.locator('.discovery-object').first().getAttribute('style')).not.toBe(before)
  await expect(page.locator('.feed-heading h1')).toHaveText('Live Opportunities')
  await expect(discoveryCard(page, 'Live Opportunities')).toHaveAttribute('aria-pressed', 'true')
})

test('unmodified actionable feed has a compact inspector and hidden, working scrollbars', async ({
  page,
}, info) => {
  await page.unroute('**/data/current.json')
  const desktop = info.project.name === 'desktop'
  if (desktop) await page.setViewportSize({ width: 1139, height: 920 })
  await page.goto('./?view=live')
  await ready(page)
  await expect(
    page.locator(
      '.page-footer, .source-page, .inspector-topline, .inspector-links, .carousel-play',
    ),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show Awards', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show Renewals', exact: true })).toHaveCount(0)
  const list = page.getByRole('region', { name: 'Opportunity records' })
  await expect(list).toHaveCSS('scrollbar-width', 'none')
  await expect(page.locator('html')).toHaveCSS('scrollbar-width', 'none')
  if (desktop) {
    const title = await page.locator('.inspector-heading h2').boundingBox()
    const inspector = await page.locator('.console-inspector').boundingBox()
    expect(title!.y - inspector!.y).toBeLessThanOrEqual(28)
    await list.focus()
    await page.keyboard.press('PageDown')
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    await list.hover()
    const before = await list.evaluate((el) => el.scrollTop)
    await page.mouse.wheel(0, 280)
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(before)
    await list.evaluate((el) => el.scrollTo({ top: 0 }))
  } else {
    await detail(page)
  }
  const source = page.locator('.glass-source-button:visible').first()
  expect(
    await source.evaluate((el) => getComputedStyle(el, '::before').backgroundImage),
  ).not.toContain('url(')
  expect(
    await source
      .locator('.glass-reflection')
      .evaluate((el) => getComputedStyle(el, '::after').content),
  ).toBe('none')
  if (!desktop) await page.getByRole('button', { name: 'Close panel' }).click()
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement)?.blur()
    window.scrollTo(0, 0)
  })
  await page.screenshot({ path: `../artifacts/actionable-cleanup-${info.project.name}.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('old award and renewal links cannot expose unavailable records from a stale feed', async ({
  page,
}) => {
  await page.route('**/data/current.json', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    const base = data.signals.find((s: { countries: string[] }) => s.countries.includes('GB'))
    const award = {
      ...base,
      id: 'removed-award',
      title: 'Unavailable incumbent award',
      signal_type: 'AWARD',
      status: 'awarded',
    }
    const renewal = {
      ...base,
      id: 'removed-renewal',
      title: 'Unconfirmed incumbent renewal',
      signal_type: 'RENEWAL_SIGNAL',
      status: 'inferred',
      related_signal_id: award.id,
    }
    await route.fulfill({ response, json: { ...data, signals: [award, renewal, ...data.signals] } })
  })
  await page.addInitScript(() =>
    localStorage.setItem('anthrion-saved-v1', JSON.stringify(['removed-award', 'removed-renewal'])),
  )
  for (const view of ['awards', 'renewals', 'sources']) {
    await page.goto(`./?view=${view}&signal=removed-award`)
    await expect(page.getByRole('dialog', { name: 'Opportunity unavailable' })).toBeVisible()
    await expect(page.getByText('Unavailable incumbent award', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Back to opportunities' }).click()
    await ready(page)
    await expect(page.locator('.feed-heading h1')).toHaveText('All Signals')
    await expect(page).not.toHaveURL(/signal=removed-award/)
  }
  await page.goto('./?view=saved')
  await expect(page.locator('.signal-row')).toHaveCount(0)
  await expect(page.locator('.workspace-nav small')).toHaveText('0')
  await page.goto('./?view=all&q=Unavailable%20incumbent%20award')
  await expect(page.getByText('No matching signals', { exact: true })).toBeVisible()
})

test('liquid metal has nonblank changing pixels and respects reduced motion', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./')
  await ready(page)
  const card = page.locator('.signal-row.selected').first()
  const canvas = card.locator('.metal-edge canvas')
  await expect(canvas).toBeVisible()
  const pixels = () => shaderPixels(canvas)
  await expect.poll(async () => (await pixels()).colors).toBeGreaterThan(20)
  const first = await pixels()
  await expect.poll(async () => (await pixels()).hash).not.toBe(first.hash)
  await card.screenshot({ path: `../artifacts/liquid-metal-${info.project.name}.png` })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(350)
  await expect(card.locator('.metal-edge')).toHaveAttribute('data-motion', 'paused')
  const still = await canvas.screenshot()
  await page.waitForTimeout(500)
  expect((await canvas.screenshot()).equals(still)).toBe(true)
  expect(await page.locator('canvas').count()).toBeLessThanOrEqual(8)
})

test('ambient glass stays subtle, non-interactive and motion-aware', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./')
  await ready(page)
  const background = page.locator('.ambient-glass')
  const canvas = background.locator('canvas')
  await expect(background).toHaveAttribute('aria-hidden', 'true')
  await expect(background).toHaveAttribute('data-motion', 'flowing')
  await expect(background).toHaveCSS('pointer-events', 'none')
  await expect(background).toHaveCSS('position', 'fixed')
  const opacity = await background.evaluate((el) => Number(getComputedStyle(el).opacity))
  expect(opacity).toBeGreaterThan(0)
  expect(opacity).toBeLessThanOrEqual(0.15)
  await expect(canvas).toBeVisible()
  expect(
    await canvas.evaluate((el: HTMLCanvasElement) => el.width * el.height),
  ).toBeLessThanOrEqual(230000)
  await expect.poll(async () => (await shaderPixels(canvas)).colors).toBeGreaterThan(12)
  const first = await shaderPixels(canvas)
  await expect.poll(async () => (await shaderPixels(canvas)).hash).not.toBe(first.hash)
  await page.screenshot({ path: `../artifacts/ambient-glass-${info.project.name}.png` })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(background).toHaveAttribute('data-motion', 'paused')
  await page.waitForTimeout(350)
  const paused = await canvas.screenshot()
  await page.waitForTimeout(400)
  expect((await canvas.screenshot()).equals(paused)).toBe(true)
  await page.getByRole('textbox', { name: 'Search opportunities' }).fill('no-such-source-notice')
  await expect(page.getByText('No matching signals', { exact: true })).toBeVisible()
})

test('brand materials respond to hover and keyboard focus without shifting or idle rendering', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./?view=live')
  await ready(page)
  const brand = page.locator('.workspace-brand')
  const wordmark = page.locator('.brand-wordmark')
  const signature = page.locator('.brand-signal')
  const canvas = wordmark.locator('canvas')
  const bounds = await brand.boundingBox()
  const signatureAtRest = await signature.screenshot()
  await expect(canvas).toHaveCount(0)
  await wordmark.hover()
  await expect(wordmark).toHaveAttribute('data-metal', 'true')
  await expect(canvas).toBeVisible()
  expect(
    await wordmark.locator('.brand-metal-layer').evaluate((el) => getComputedStyle(el).maskImage),
  ).toContain('anthrion-logo.svg')
  await expect.poll(async () => (await shaderPixels(canvas)).colors).toBeGreaterThan(20)
  const frame = await shaderPixels(canvas)
  await expect.poll(async () => (await shaderPixels(canvas)).hash).not.toBe(frame.hash)
  expect(await brand.boundingBox()).toEqual(bounds)
  expect((await signature.screenshot()).equals(signatureAtRest)).toBe(true)
  await brand.screenshot({ path: `../artifacts/brand-metal-${info.project.name}.png` })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const still = await canvas.screenshot()
  await page.waitForTimeout(300)
  expect((await canvas.screenshot()).equals(still)).toBe(true)
  await signature.hover()
  await expect(canvas).toHaveCount(0)
  await expect(signature).toHaveCSS('background-clip', 'text')
  await expect(signature).toHaveCSS('animation-name', 'none')
  await brand.screenshot({ path: `../artifacts/brand-glass-${info.project.name}.png` })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(signature).toHaveCSS('animation-name', 'signature-light-sweep')
  const sweep = await signature.evaluate((el) => getComputedStyle(el).backgroundPositionX)
  await expect
    .poll(() => signature.evaluate((el) => getComputedStyle(el).backgroundPositionX))
    .not.toBe(sweep)
  expect(await brand.boundingBox()).toEqual(bounds)
  await page.mouse.move(500, 80)
  await page.keyboard.press('Tab')
  await brand.focus()
  await expect(canvas).toBeVisible()
  await expect(signature).toHaveCSS('background-clip', 'text')
  await page.keyboard.press('Enter')
  await expect(page.locator('.feed-heading h1')).toHaveText('Live Opportunities')
  await page.getByRole('textbox', { name: 'Search opportunities' }).focus()
  await expect(canvas).toHaveCount(0)
})

test('no WebGL retains a complete functional static-border interface', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (args[0] === 'webgl2') return null
      return original.apply(this, args as Parameters<typeof original>)
    } as typeof original
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./')
  await ready(page)
  await expect(page.locator('.signal-row.selected .metal-edge')).toBeVisible()
  await expect(page.locator('.metal-edge canvas')).toHaveCount(0)
  await page.locator('.brand-wordmark').hover()
  await expect(page.locator('.brand-metal-layer')).toHaveCSS('opacity', '1')
  await expect(page.locator('.brand-wordmark canvas')).toHaveCount(0)
  await expect(page.locator('.discovery-card[aria-pressed="true"]')).toBeVisible()
  await detail(page)
  expect(errors).toEqual([])
})

test('dark console, menus, evidence and sources pass accessibility checks', async ({
  page,
}, info) => {
  test.setTimeout(180000)
  const audit = async (state: string) => {
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      )
    })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(
      results.violations.map((v) => ({
        id: v.id,
        state,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    ).toEqual([])
  }
  for (const theme of ['dark']) {
    await page.goto('./')
    await ready(page)
    await audit(`${theme} console`)
    await page.getByRole('button', { name: 'Sort opportunities: Most recent' }).click()
    await audit(`${theme} sort`)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    await audit(`${theme} filters`)
    await page.screenshot({ path: `../artifacts/filters-${theme}-${info.project.name}.png` })
    await page.getByRole('button', { name: 'Close panel' }).click()
    await detail(page)
    for (const section of ['Overview', 'Sources & timeline']) {
      await page.getByRole('tab', { name: section, exact: true }).click()
      await audit(`${theme} ${section}`)
    }
    await page.getByRole('button', { name: 'Close panel' }).click()
    await page.goto('./?view=all')
    await ready(page)
    await audit(`${theme} all opportunities`)
  }
})

test('unmodified public feed retains real records and exposes source facts without AI assessments', async ({
  page,
}, info) => {
  await page.unroute('**/data/current.json')
  const dataset = await (await page.request.get('./data/current.json')).json()
  expect(dataset.schema_version).toBe('2.0')
  await page.goto('./?view=live')
  await ready(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.locator('.signal-row').count()).toBeGreaterThan(0)
  const shown = await page.locator('.row-title').allTextContents()
  const actual = new Set(
    dataset.signals
      .filter((s: { countries: string[] }) => s.countries.includes('GB'))
      .map((s: { title: string }) => s.title),
  )
  shown.forEach((title) => expect(actual.has(title)).toBe(true))
  await page.screenshot({ path: `../artifacts/discovery-v2-real-${info.project.name}.png` })
  await detail(page)
  await expect(page.getByRole('tab', { name: 'Score & evidence' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Requirements' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Sources & timeline' }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Source provenance')
  await page.screenshot({
    path: `../artifacts/discovery-v2-real-evidence-${info.project.name}.png`,
  })
  await page.getByRole('button', { name: 'Close panel' }).click()
  await page.goto('./?view=all')
  await ready(page)
  await page.getByRole('textbox', { name: 'Search opportunities' }).fill('CRM')
  await ready(page)
  await expect(page.locator('.feed-heading .count-badge')).not.toHaveText('0')
  await page.goto('./')
  await expect(page.locator('.feed-heading h1')).toHaveText('Live Opportunities')
  await expect(page.getByRole('button', { name: 'Show Top Signals', exact: true })).toHaveCount(0)
  await page.goto('./?view=top&score=90&confidence=80&recommendation=PURSUE')
  await ready(page)
  await expect(page.locator('.feed-heading h1')).toHaveText('All Signals')
  await expect(page.getByRole('heading', { name: 'No assessed top signals yet' })).toHaveCount(0)
})
