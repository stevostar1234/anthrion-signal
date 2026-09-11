import { test, expect } from '@playwright/test'

test('scrolling the virtual record list does not redraw stationary glass or restart its light', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1132, height: 920 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./?view=all')
  await expect(page.locator('.row-select').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  const result = await page.evaluate(async () => {
    const scene = document.querySelector<HTMLElement>('.discovery-scene')!
    const list = document.querySelector<HTMLElement>('.signal-feed')!
    const glass = document.querySelector<HTMLElement>('.discovery-object[data-category="early"]')!
    const source = document.querySelector<HTMLElement>('.console-inspector .glass-source-button')!
    const getWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')!.get!
    const getBounds = source.getBoundingClientRect.bind(source)
    let geometryReads = 0
    let sourceReads = 0
    Object.defineProperty(scene, 'clientWidth', {
      configurable: true,
      get() {
        geometryReads++
        return getWidth.call(scene)
      },
    })
    source.getBoundingClientRect = () => {
      sourceReads++
      return getBounds()
    }
    const samples = new Set<string>()
    const initialTransform = glass.style.transform
    try {
      for (let frame = 0; frame < 60; frame++) {
        list.scrollTop += 24
        await new Promise(requestAnimationFrame)
        samples.add(glass.style.getPropertyValue('--reflection-x'))
      }
      return {
        geometryReads,
        sourceReads,
        lightSamples: samples.size,
        scrolled: list.scrollTop,
        sameGlass: glass.isConnected,
        sameTransform: glass.style.transform === initialTransform,
        rows: list.querySelectorAll('.virtual-signal-row').length,
      }
    } finally {
      delete (scene as Partial<HTMLElement>).clientWidth
      source.getBoundingClientRect = getBounds
    }
  })
  expect(result.scrolled).toBeGreaterThan(900)
  expect(result.geometryReads).toBe(0)
  expect(result.sourceReads).toBe(0)
  expect(result.lightSamples).toBeGreaterThan(2)
  expect(result.sameGlass && result.sameTransform).toBe(true)
  expect(result.rows).toBeLessThan(35)
})
