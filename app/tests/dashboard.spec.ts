import { test, expect } from '@playwright/test'

test('real feed, search, save, evidence and responsive layout', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Opportunity intelligence.', exact: true })).toBeVisible()
  await expect(page.locator('.signal-card').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('.signal-card').first()).toHaveCSS('opacity', '1')
  await expect(page.locator('.brand img')).toHaveJSProperty('complete', true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `../artifacts/dashboard-${testInfo.project.name}.png`, fullPage: false })
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
  await expect(page.getByRole('link', { name: 'Open source notice' })).toHaveAttribute('href', /^https:/)
  for (const name of ['Score & evidence', 'Requirements', 'Sources & timeline', 'Overview']) {
    await page.getByRole('tab', { name, exact: true }).click()
    await expect(page.getByRole('tabpanel')).toBeVisible()
  }
  await page.getByRole('tab', { name: 'Score & evidence' }).click()
  await page.screenshot({ path: `../artifacts/evidence-${testInfo.project.name}.png`, fullPage: false })
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
  const items = ['All signals', 'Live opportunities', 'Early engagement', 'Future & pipeline', 'Renewals', 'Frameworks', 'Funding & partnerships', 'Awards', 'Saved opportunities', 'Latest updates', 'Source coverage']
  for (const label of items) {
    if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.locator('.sidebar').getByRole('button', { name: new RegExp(`^${label}`) }).click()
    await expect(page.locator('.feed-heading h2')).toHaveText(label === 'Source coverage' ? 'Source coverage' : label)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
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
