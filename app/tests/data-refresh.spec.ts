import { test, expect } from '@playwright/test'
import { markets } from '../src/lib'
import type { Dataset } from '../src/types'

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('published data renders real records across every market', async ({ page }, info) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })
  const response = await page.request.get('./data/current.json')
  expect(response.ok()).toBe(true)
  const dataset: Dataset = await response.json()
  expect(dataset.schema_version).toBe('2.0')
  expect(dataset.signals.length).toBeGreaterThan(0)
  expect(dataset.run.scheduled_times).toEqual(
    Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:50`),
  )
  for (const market of markets) {
    await page.goto(`./?view=all&market=${market.id}`)
    await expect(page.locator('.discovery-card')).toHaveCount(5)
    await expect(
      page.getByRole('navigation', { name: 'Markets' }).getByRole('button', {
        name: market.name,
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.discovery-value').first()).toHaveText(/^\d[\d,]*$/)
    const count = Number(
      (await page.locator('.discovery-value').first().textContent())!.replaceAll(',', ''),
    )
    if (count === 0) {
      await expect(page.locator('.signal-row')).toHaveCount(0)
      continue
    }
    const row = page.locator('.signal-row').first()
    await expect(row).toBeVisible()
    const title = (await row.locator('.row-title').textContent())!
    const id = await row.evaluate((element) =>
      element.closest('[data-signal-id]')!.getAttribute('data-signal-id'),
    )
    const signal = dataset.signals.find((item) => item.id === id)
    expect(signal).toBeDefined()
    expect(signal!.title).toBe(title)
    expect(signal!.countries.some((country) => market.countries.includes(country))).toBe(true)
    await row.locator('.row-select').click()
    const panel = page.locator('.console-detail:visible')
    await expect(panel.locator('.inspector-heading h2')).toHaveText(title)
    await expect(panel.locator('.inspector-facts dt')).toHaveText([
      'Notice type',
      'Value',
      'Deadline',
    ])
    const source = panel.getByRole('link', { name: 'Open source notice' })
    await expect(source).toHaveAttribute('href', signal!.primary_source_url)
    const url = new URL(signal!.primary_source_url)
    expect(['https:', 'http:']).toContain(url.protocol)
    expect(url.username + url.password).toBe('')
    await expect(panel.locator('.record-action-dock')).toBeInViewport()
    await panel.getByRole('button', { name: 'Full details', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Opportunity intelligence' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'Open source notice' }),
    ).toHaveAttribute('href', signal!.primary_source_url)
  }
  await page.goto('./?view=all')
  await expect(page.locator('.signal-row').first()).toBeVisible()
  await page.screenshot({ path: `../artifacts/data-refresh-${info.project.name}.png` })
  expect(errors).toEqual([])
})

test('published feed supports search, filters and browser refresh', async ({ page }) => {
  await page.goto('./?view=all')
  await expect(page.locator('.signal-row').first()).toBeVisible()
  const search = page.getByRole('textbox', { name: 'Search opportunities' })
  await search.fill('no-such-opportunity-refresh-smoke')
  await expect(page.getByText('No matching signals', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.locator('.signal-row').first()).toBeVisible()
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByLabel('Buyer', { exact: true }).fill('no-such-buyer-refresh-smoke')
  await page.getByRole('button', { name: 'Show 0 signals' }).click()
  await expect(page.getByText('No matching signals', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Clear 1 filters/ }).click()
  await expect(page.locator('.signal-row').first()).toBeVisible()
  await page.reload()
  await expect(page.locator('.signal-row').first()).toBeVisible()
})
