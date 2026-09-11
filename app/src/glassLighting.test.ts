import { describe, expect, it } from 'vitest'
import { glassLight, reflectionLamp } from './glassLighting'

const lamp = { x: 240, y: 40 }
const viewer = { x: 600, y: 460 }

describe('glass lighting', () => {
  it('shares one continuous animation phase across light ticks and geometry redraws', () => {
    const before = reflectionLamp(lamp, 8000, false)
    const redraw = reflectionLamp(lamp, 8016, false)
    expect(redraw).not.toEqual(lamp)
    expect(Math.abs(redraw.x - before.x)).toBeLessThan(1.2)
    expect(Math.abs(redraw.y - before.y)).toBeLessThan(0.21)
    expect(reflectionLamp(lamp, 8016, false)).toEqual(redraw)
  })

  it('keeps reduced-motion lighting fixed regardless of the clock', () => {
    expect(reflectionLamp(lamp, 8000, true)).toEqual(lamp)
    expect(reflectionLamp(lamp, 50000, true)).toEqual(lamp)
  })

  it('is deterministic at rest, without a time-driven animation', () => {
    const pose = { x: 600, y: 240, tilt: 0 }
    expect(glassLight(pose, lamp, viewer)).toEqual(glassLight(pose, lamp, viewer))
  })

  it('moves the reflection when a card passes the fixed brand light', () => {
    const left = glassLight({ x: 320, y: 240 }, lamp, viewer)
    const right = glassLight({ x: 820, y: 240 }, lamp, viewer)
    expect(left.x).toBeGreaterThan(right.x)
    expect(left.strength).toBeGreaterThan(right.strength)
  })

  it('responds to the real 3D face angle as well as its position', () => {
    const flat = glassLight({ x: 600, y: 240 }, lamp, viewer)
    const angled = glassLight({ x: 600, y: 240, tilt: 0.12 }, lamp, viewer)
    expect(angled.x).not.toBe(flat.x)
    expect(angled.angle).not.toBe(flat.angle)
    expect(angled.strength).not.toBe(flat.strength)
  })

  it('keeps the same lighting when lamp, surface and viewer translate together', () => {
    const first = glassLight({ x: 600, y: 240 }, lamp, viewer)
    const second = glassLight(
      { x: 620, y: 200 },
      { x: lamp.x + 20, y: lamp.y - 40 },
      { x: viewer.x + 20, y: viewer.y - 40 },
    )
    expect(second).toEqual(first)
  })

  it('keeps off-screen and narrow-layout values within the material limits', () => {
    for (const x of [-10000, 0, 320, 1920, 10000]) {
      const light = glassLight({ x, y: 300, tilt: 0.14 }, lamp, viewer)
      expect(light.x).toBeGreaterThanOrEqual(2)
      expect(light.x).toBeLessThanOrEqual(98)
      expect(light.strength).toBeGreaterThanOrEqual(0.22)
      expect(light.strength).toBeLessThanOrEqual(0.9)
      expect(Object.values(light).every(Number.isFinite)).toBe(true)
    }
  })
})
