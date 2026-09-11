type Point = { x: number; y: number }
type GlassPose = Point & { tilt?: number }

export function reflectionLamp(lamp: Point, time: number, reducedMotion: boolean) {
  if (reducedMotion) return lamp
  const phase = time / 1000
  return {
    x: lamp.x + Math.sin(phase * 0.33) * 220,
    y: lamp.y + Math.cos(phase * 0.23) * 55,
  }
}

export function scrollMovesSurface(event: Event, surface: Element, brand: Element | null) {
  const target = event.target
  return (
    target === document ||
    target === window ||
    (target instanceof Element &&
      (target.contains(surface) || (brand !== null && target.contains(brand))))
  )
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const unit = (x: number, y: number, z: number) => {
  const length = Math.hypot(x, y, z)
  return { x: x / length, y: y / length, z: z / length }
}

export function glassLight(pose: GlassPose, lamp: Point, viewer: Point) {
  // The light position and face normal determine each surface's specular highlight.
  const light = unit(lamp.x - pose.x, lamp.y - pose.y, 580)
  const view = unit(viewer.x - pose.x, viewer.y - pose.y, 1000)
  const half = unit(light.x + view.x, light.y + view.y, light.z + view.z)
  const tilt = pose.tilt || 0
  const incidence = Math.max(0, Math.sin(tilt) * half.x + Math.cos(tilt) * half.z)
  const specular = incidence ** 32
  return {
    x: clamp(50 + (half.x - Math.sin(tilt)) * 145, 2, 98),
    y: clamp(50 + half.y * 85, 10, 90),
    angle: 110 - Math.atan2(light.y, light.z) * 35 + tilt * 70,
    strength: 0.22 + specular * 0.68,
    edge: 0.48 + specular * 0.45,
  }
}

export function brandLightPosition() {
  const brand = document.querySelector('.brand-signal')?.getBoundingClientRect()
  return { x: brand ? brand.left + brand.width / 2 : 240, y: brand ? brand.bottom : 40 }
}

export function applyGlassLight(element: HTMLElement, pose: GlassPose, lamp: Point) {
  const light = glassLight(pose, lamp, { x: window.innerWidth / 2, y: window.innerHeight / 2 })
  element.style.setProperty('--reflection-x', `${light.x.toFixed(2)}%`)
  element.style.setProperty('--reflection-y', `${light.y.toFixed(2)}%`)
  element.style.setProperty('--reflection-angle', `${light.angle.toFixed(2)}deg`)
  element.style.setProperty('--reflection-strength', light.strength.toFixed(3))
  element.style.setProperty('--reflection-edge', light.edge.toFixed(3))
}
