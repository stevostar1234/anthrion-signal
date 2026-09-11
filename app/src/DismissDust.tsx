import { useEffect, useRef } from 'react'

export function DismissDust({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const row = canvas?.parentElement
    const context = canvas?.getContext('2d')
    if (!canvas || !row || !context) return
    const bounds = row.getBoundingClientRect()
    const padding = 70
    const ratio = Math.min(window.devicePixelRatio, 2)
    const width = bounds.width + padding * 2
    const height = bounds.height + padding * 2
    canvas.width = Math.ceil(width * ratio)
    canvas.height = Math.ceil(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    context.scale(ratio, ratio)
    let seed = [...id].reduce((total, char) => total * 31 + char.charCodeAt(0), 17) >>> 0
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0
      return seed / 4294967296
    }
    const regions = [
      ...row.querySelectorAll<HTMLElement>('.row-title, .row-buyer, .row-meta, .row-numbers'),
    ]
      .map((element) => ({
        bounds: element.getBoundingClientRect(),
        color: getComputedStyle(element).color,
      }))
      .filter((region) => region.bounds.width && region.bounds.height)
    const particles = Array.from({ length: Math.min(260, Math.round(bounds.width / 2)) }, () => {
      const region = regions[Math.floor(random() * regions.length)]
      const x = region
        ? region.bounds.left - bounds.left + random() * region.bounds.width
        : random() * bounds.width
      const y = region
        ? region.bounds.top - bounds.top + random() * region.bounds.height
        : random() * bounds.height
      return {
        x,
        y,
        release: (x / bounds.width) * 0.62,
        dx: 22 + random() * 50,
        dy: -12 - random() * 42,
        size: 0.6 + random() * 1.4,
        color: region?.color || '#cddbad',
        opacity: 0.3 + random() * 0.6,
      }
    })
    let frame = 0
    const started = performance.now()
    const draw = (now: number) => {
      const progress = Math.min(1, (now - started) / 600)
      row.style.setProperty('--dust-reveal', `${progress * 124}%`)
      context.clearRect(0, 0, width, height)
      for (const particle of particles) {
        const age = Math.max(0, (progress - particle.release) / (1 - particle.release))
        if (!age) continue
        context.fillStyle = particle.color
        context.globalAlpha = Math.sin(age * Math.PI) * particle.opacity
        context.fillRect(
          padding + particle.x + particle.dx * age,
          padding + particle.y + particle.dy * age,
          particle.size,
          particle.size,
        )
      }
      if (progress < 1) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      row.style.removeProperty('--dust-reveal')
    }
  }, [id])
  return <canvas ref={ref} className="dismiss-dust" aria-hidden="true" />
}
