import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('real feed, search, save, evidence and responsive layout', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./')
  await expect(
    page.getByRole('heading', { name: 'Opportunity intelligence.', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.signal-card').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('.signal-card').first()).toHaveCSS('opacity', '1')
  await expect(page.locator('.brand img')).toHaveJSProperty('complete', true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  )
  await page.screenshot({
    path: `../artifacts/dashboard-${testInfo.project.name}.png`,
    fullPage: false,
  })
  await page.getByRole('button', { name: 'Save opportunity in this browser' }).first().click()
  await expect(page.getByRole('button', { name: 'Unsave opportunity' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('Buyer', { exact: true }).fill('no-such-buyer-xyz')
  await page.getByRole('button', { name: 'Show 0 signals' }).click()
  await expect(page.getByText('No matching signals', { exact: true })).toBeVisible()
  expect(page.url()).toContain('buyer=no-such-buyer-xyz')
  await page.getByRole('button', { name: /Clear 1 filters/ }).click()
  await page.locator('.signal-title').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open source notice' })).toHaveAttribute(
    'href',
    /^https:/,
  )
  for (const name of ['Score & evidence', 'Requirements', 'Sources & timeline', 'Overview']) {
    await page.getByRole('tab', { name, exact: true }).click()
    await expect(page.getByRole('tabpanel')).toBeVisible()
  }
  await page.getByRole('tab', { name: 'Score & evidence' }).click()
  await page.screenshot({
    path: `../artifacts/evidence-${testInfo.project.name}.png`,
    fullPage: false,
  })
  await page.getByRole('button', { name: 'Close panel' }).click()
  await page.getByRole('textbox', { name: 'Search opportunities' }).fill('no-such-opportunity-xyz')
  await expect(page.getByText('No matching signals', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.locator('.signal-card').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('all navigation views and source coverage are usable', async ({ page }, testInfo) => {
  await page.goto('./')
  await expect(page.locator('.signal-card').first()).toBeVisible()
  const items = [
    'All signals',
    'Live opportunities',
    'Early engagement',
    'Future & pipeline',
    'Renewals',
    'Frameworks',
    'Funding & partnerships',
    'Awards',
    'Saved opportunities',
    'Latest updates',
    'Source coverage',
  ]
  for (const label of items) {
    if (testInfo.project.name === 'mobile')
      await page.getByRole('button', { name: 'Open navigation' }).click()
    await page
      .locator('.sidebar')
      .getByRole('button', { name: new RegExp(`^${label}`) })
      .click()
    await expect(page.locator('.feed-heading h2')).toHaveText(
      label === 'Source coverage' ? 'Source coverage' : label,
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    )
  }
})

test('CSV export and comparison', async ({ page }) => {
  await page.goto('./?view=all')
  await expect(page.locator('.signal-card').nth(1)).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export signals', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/anthrion-signals.*csv/)
  await page.locator('.compare-control input').nth(0).check()
  await page.locator('.compare-control input').nth(1).check()
  await page.locator('.compare-tray').getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Compare opportunities' })).toBeVisible()
  await expect(page.locator('.comparison-grid section')).toHaveCount(2)
})

test('failed refresh retains usable opportunities', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.signal-card').first()).toBeVisible()
  const title = await page.locator('.signal-title').first().textContent()
  await page.route('**/data/current.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  )
  await page.getByRole('button', { name: 'Check for updates' }).click()
  await expect(
    page.getByText('The latest opportunity feed is temporarily unavailable.'),
  ).toBeVisible()
  await expect(page.locator('.signal-title').first()).toHaveText(title!)
})

test('malformed browser storage cannot crash the workspace', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('anthrion-saved-v1', '{"bad":"shape"}')
    localStorage.setItem('anthrion-views-v1', '[null]')
  })
  await page.goto('./')
  await expect(page.locator('.signal-card').first()).toBeVisible()
})

test('compact and wide layouts keep controls within the viewport', async ({ page }, testInfo) => {
  for (const width of testInfo.project.name === 'mobile' ? [320, 430] : [1024, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('./')
    await expect(page.locator('.signal-card').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await page.locator('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    )
    await page.getByRole('button', { name: 'Close panel' }).click()
  }
})

test('market picker scopes the feed and persists the selected market in the URL', async ({
  page,
}, testInfo) => {
  await page.goto('./')
  await expect(page.locator('.signal-card').first()).toBeVisible()
  await page.getByRole('button', { name: 'Choose market: United Kingdom' }).click()
  await expect(page.getByRole('dialog', { name: 'Choose your market' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search markets' })).toBeFocused()
  await expect(page.locator('.market-option')).toHaveCount(8)
  await expect
    .poll(() =>
      page
        .locator('.market-symbol img')
        .evaluateAll((images) => images.every((img) => (img as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true)
  await page.screenshot({ path: `../artifacts/markets-${testInfo.project.name}.png` })
  await page.getByRole('button', { name: /United States North America/ }).click()
  await expect(page.getByRole('heading', { name: 'No signals for United States' })).toBeVisible()
  await expect(page.locator('.signal-card')).toHaveCount(0)
  expect(page.url()).toContain('market=US')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Choose market: United States' })).toBeVisible()
  await page.getByRole('button', { name: 'Choose market: United States' }).click()
  await page.getByRole('textbox', { name: 'Search markets' }).fill('nord')
  await expect(page.locator('.market-option')).toHaveCount(1)
  await page.getByRole('button', { name: /Nordics Northern Europe/ }).click()
  await expect(page.getByRole('heading', { name: 'No signals for Nordics' })).toBeVisible()
  expect(page.url()).toContain('market=NORDICS')
  await page.getByRole('button', { name: 'Explore United Kingdom' }).click()
  await expect(page.locator('.signal-card').first()).toBeVisible()
  await page.goto('./?view=sources&market=US')
  await expect(
    page.getByRole('heading', { name: 'No sources monitored in this market' }),
  ).toBeVisible()
  await expect(page.locator('.source-row')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Refresh schedule' })).toHaveCount(0)
})

test('saved views restore the market and search together', async ({ page }, testInfo) => {
  await page.goto('./?view=all&q=CRM')
  await expect(page.locator('.signal-card').first()).toBeVisible()
  await page.getByRole('button', { name: 'Save view', exact: true }).click()
  await page.getByLabel('View name', { exact: true }).fill('UK CRM research')
  await page.getByRole('dialog').getByRole('button', { name: 'Save view', exact: true }).click()
  await page.getByRole('button', { name: 'Choose market: United Kingdom' }).click()
  await page.getByRole('button', { name: /United States North America/ }).click()
  await expect(page.locator('.signal-card')).toHaveCount(0)
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('button', { name: 'UK CRM research', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose market: United Kingdom' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search opportunities' })).toHaveValue('CRM')
  await expect(page.locator('.feed-heading h2')).toHaveText('All signals')
  await page.reload()
  await expect(page.locator('.signal-card').first()).toBeVisible()
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('button', { name: 'Delete saved view UK CRM research' }).click()
  await expect(page.getByRole('button', { name: 'UK CRM research', exact: true })).toHaveCount(0)
})

test('long opportunity headings leave a usable reading area on short screens', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({
    width: testInfo.project.name === 'mobile' ? 320 : 1440,
    height: 568,
  })
  const response = await page.request.get('./data/current.json')
  const data = await response.json()
  const longest = [...data.signals].sort((a, b) => b.title.length - a.title.length)[0]
  await page.goto(`./?signal=${encodeURIComponent(longest.id)}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('tab', { name: 'Score & evidence' }).click()
  await expect(page.getByRole('tab', { name: 'Score & evidence' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const layout = await page.getByRole('dialog').evaluate((dialog) => {
    const heading = dialog.querySelector('.detail-heading')!.getBoundingClientRect()
    const tabs = dialog.querySelector('.detail-tabs')!.getBoundingClientRect()
    const panel = dialog.querySelector('.detail-content')!.getBoundingClientRect()
    return {
      titleBottom: heading.bottom,
      tabsTop: tabs.top,
      tabsBottom: tabs.bottom,
      panelTop: panel.top,
      panelHeight: panel.height,
      width: dialog.scrollWidth,
      available: dialog.clientWidth,
    }
  })
  expect(layout.titleBottom).toBeLessThanOrEqual(layout.tabsTop + 1)
  expect(layout.tabsBottom).toBeLessThanOrEqual(layout.panelTop + 1)
  expect(layout.panelHeight).toBeGreaterThan(150)
  expect(layout.width).toBeLessThanOrEqual(layout.available)
  await page.screenshot({ path: `../artifacts/long-title-${testInfo.project.name}.png` })
})

test('theme, density and accessible evidence tabs retain the complete workflow', async ({
  page,
}, testInfo) => {
  await page.goto('./')
  await expect(page.locator('.signal-card').first()).toBeVisible()
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Compact view' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/density-compact/)
  await expect(page.locator('.signal-summary').first()).toBeHidden()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.app-shell')).toHaveClass(/density-compact/)
  await expect(page.locator('.signal-card').first()).toBeVisible()
  await expect(page.locator('.signal-card').last()).toHaveCSS('opacity', '1')
  await page.screenshot({ path: `../artifacts/dark-${testInfo.project.name}.png` })
  await page.locator('.signal-title').first().click()
  await page.getByRole('tab', { name: 'Overview', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Score & evidence' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Score & evidence' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Sources & timeline' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.getByRole('button', { name: 'Comfortable view' }).click()
  await expect(page.locator('.signal-summary').first()).toBeVisible()
})

test('mobile navigation traps focus and closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.locator('.signal-card').first()).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.locator('main')).toHaveAttribute('inert', '')
  await expect(page.locator('.brand')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Source coverage' }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused()
  await expect(page.locator('main')).not.toHaveAttribute('inert', '')
})

test('light and dark workspaces meet automated accessibility checks', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000)
  const audit = async (state: string) => {
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
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
  for (const theme of ['light', 'dark']) {
    await page.goto('./')
    await expect(page.locator('.signal-card').last()).toHaveCSS('opacity', '1')
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await audit(`${theme} feed`)
    await page.getByRole('button', { name: 'Choose market: United Kingdom' }).click()
    await audit(`${theme} markets`)
    await page.getByRole('button', { name: 'Close panel' }).click()
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    await audit(`${theme} filters`)
    await page.screenshot({ path: `../artifacts/filters-${theme}-${testInfo.project.name}.png` })
    await page.getByRole('button', { name: 'Close panel' }).click()
    await page.locator('.signal-title').first().click()
    for (const section of ['Overview', 'Score & evidence', 'Requirements', 'Sources & timeline']) {
      await page.getByRole('tab', { name: section, exact: true }).click()
      await audit(`${theme} ${section}`)
    }
    await page.getByRole('button', { name: 'Close panel' }).click()
    await page.goto('./?view=sources')
    await expect(page.locator('.source-row').first()).toBeVisible()
    await audit(`${theme} source coverage`)
    await page.screenshot({ path: `../artifacts/sources-${theme}-${testInfo.project.name}.png` })
  }
})
