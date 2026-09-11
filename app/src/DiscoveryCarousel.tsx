import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import useEmblaCarousel from 'embla-carousel-react'
import { MathUtils, PerspectiveCamera, Scene, Vector3 } from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'
import { GlassReflection, useReducedMotion } from './WorkspaceUI'
import {
  applyGlassLight,
  brandLightPosition,
  reflectionLamp,
  scrollMovesSurface,
} from './glassLighting'

type DiscoveryItem = { id: string; label: string; icon: LucideIcon }

export function DiscoveryCarousel({
  items,
  counts,
  selected,
  loading,
  onSelect,
}: {
  items: DiscoveryItem[]
  counts: Record<string, number>
  selected: string
  loading: boolean
  onSelect: (id: string) => void
}) {
  const reducedMotion = useReducedMotion()
  const host = useRef<HTMLDivElement>(null)
  const controls = useRef<(HTMLDivElement | null)[]>([])
  const pendingFocus = useRef<string | null>(null)
  const requestLayout = useRef<(() => void) | null>(null)
  const [initialIndex] = useState(() =>
    Math.max(
      0,
      items.findIndex((item) => item.id === selected),
    ),
  )
  const [viewport, api] = useEmblaCarousel({
    loop: true,
    align: 'center',
    startIndex: initialIndex,
    duration: 35,
    container: '.discovery-track',
    slides: '.discovery-slide',
    watchDrag: (carousel) => carousel.canScrollPrev() || carousel.canScrollNext(),
  })
  const [position, setPosition] = useState(initialIndex)
  const [canScroll, setCanScroll] = useState({ previous: false, next: false })
  const objects = useMemo(
    () =>
      items.map((item) => {
        const element = document.createElement('div')
        element.className = 'discovery-object'
        element.dataset.category = item.id
        return new CSS3DObject(element)
      }),
    [items],
  )

  useEffect(() => {
    if (!api || !host.current) return
    const mount = host.current
    const scene = new Scene()
    const camera = new PerspectiveCamera(30, 1, 1, 4000)
    camera.position.z = 1000
    const renderer = new CSS3DRenderer()
    const projected = new Vector3()
    mount.appendChild(renderer.domElement)
    objects.forEach((object) => scene.add(object))
    let lamp = brandLightPosition()
    let focusFrame = 0
    const focusPending = (attempt = 0) => {
      focusFrame = 0
      const id = pendingFocus.current
      const button = controls.current
        .find((control) => control?.dataset.category === id)
        ?.querySelector('button')
      if (button && getComputedStyle(button).visibility === 'visible') {
        button.focus({ preventScroll: true })
        if (document.activeElement === button && pendingFocus.current === id)
          pendingFocus.current = null
      }
      if (pendingFocus.current && attempt < 3)
        focusFrame = requestAnimationFrame(() => focusPending(attempt + 1))
    }

    // Only the glass is projected in 3D. Its accessible text/control plane stays unscaled.
    const render = (now: number) => {
      const width = mount.clientWidth
      const height = mount.clientHeight
      if (!width || !height) return
      const origin = mount.getBoundingClientRect()
      lamp = brandLightPosition()
      const movingLamp = reflectionLamp(lamp, now, reducedMotion)
      renderer.setSize(width, height)
      camera.fov = MathUtils.radToDeg(2 * Math.atan(height / 2000))
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      const slides = api.slideNodes()
      const cardWidth = Math.max(1, Math.round(slides[0]?.getBoundingClientRect().width - 12))
      objects.forEach((object, index) => {
        // Embla may disable looping when all categories fit. Its actual slide
        // positions remain authoritative in both that layout and the looped one.
        const slide = slides[index]?.getBoundingClientRect()
        if (!slide) return
        const x = slide.left + slide.width / 2 - origin.left - width / 2
        const centred = Math.abs(x) < 0.5
        const faceHeight = 112
        const left = origin.left + (width - cardWidth) / 2
        const top = origin.top + (height - faceHeight) / 2
        const crispX = Math.round(left) - left
        const crispY = top - Math.round(top)
        object.position.set(centred ? crispX : x, crispY, 0)
        object.rotation.set(0, 0, 0)
        object.scale.setScalar(1)
        object.element.dataset.centred = String(centred)
        object.element.style.width = `${cardWidth}px`
        object.element.style.height = `${faceHeight}px`
        const visibility = Math.abs(x) < width / 2 + cardWidth / 2 ? 'visible' : 'hidden'
        object.element.style.visibility = visibility
        applyGlassLight(
          object.element,
          { x: origin.left + width / 2 + x, y: origin.top + height / 2, tilt: object.rotation.y },
          movingLamp,
        )
        const control = controls.current[index]
        if (control) {
          projected.copy(object.position).project(camera)
          const textLeft = (projected.x * 0.5 + 0.5) * width - cardWidth / 2
          const textTop = (-projected.y * 0.5 + 0.5) * height - faceHeight / 2
          control.style.left = `${Math.round(origin.left + textLeft) - origin.left}px`
          control.style.top = `${Math.round(origin.top + textTop) - origin.top}px`
          control.style.width = `${cardWidth}px`
          control.style.height = `${faceHeight}px`
          control.style.visibility = visibility
          control.dataset.centred = String(centred)
        }
      })
      renderer.render(scene, camera)
      if (pendingFocus.current && !focusFrame) {
        // Container-query styles must settle before an offscreen control can receive focus.
        focusFrame = requestAnimationFrame(() => focusPending())
      }
    }
    let frame = 0
    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame((now) => {
          frame = 0
          if (!document.hidden) render(now)
        })
    }
    requestLayout.current = schedule
    const select = () => {
      setPosition(api.selectedScrollSnap())
      setCanScroll({ previous: api.canScrollPrev(), next: api.canScrollNext() })
      schedule()
    }
    api.on('scroll', schedule).on('settle', schedule).on('reInit', select).on('select', select)
    const observer = new ResizeObserver(schedule)
    observer.observe(mount)
    const brand = document.querySelector('.brand-signal')
    if (brand) observer.observe(brand)
    const scroll = (event: Event) => {
      // Nested result/detail scrolling does not move the refiners or their lamp.
      if (scrollMovesSurface(event, mount, brand)) schedule()
    }
    window.addEventListener('scroll', scroll, { capture: true, passive: true })
    let lightFrame = 0
    let lastLight = 0
    let inView = true
    const light = (now: number) => {
      lightFrame = 0
      if (reducedMotion || document.hidden || !inView) return
      if (now - lastLight >= 40) {
        lastLight = now
        const origin = mount.getBoundingClientRect()
        const movingLamp = reflectionLamp(lamp, now, reducedMotion)
        objects.forEach((object) =>
          applyGlassLight(
            object.element,
            {
              x: origin.left + origin.width / 2 + object.position.x,
              y: origin.top + origin.height / 2,
            },
            movingLamp,
          ),
        )
      }
      lightFrame = requestAnimationFrame(light)
    }
    const resumeLight = () => {
      lamp = brandLightPosition()
      if (!lightFrame && !reducedMotion && !document.hidden && inView)
        lightFrame = requestAnimationFrame(light)
    }
    const lightObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      resumeLight()
    })
    lightObserver.observe(mount)
    document.addEventListener('visibilitychange', resumeLight)
    window.addEventListener('resize', resumeLight)
    resumeLight()
    select()
    return () => {
      requestLayout.current = null
      cancelAnimationFrame(frame)
      cancelAnimationFrame(focusFrame)
      cancelAnimationFrame(lightFrame)
      lightObserver.disconnect()
      document.removeEventListener('visibilitychange', resumeLight)
      window.removeEventListener('resize', resumeLight)
      window.removeEventListener('scroll', scroll, true)
      observer.disconnect()
      api
        .off('scroll', schedule)
        .off('settle', schedule)
        .off('reInit', select)
        .off('select', select)
      objects.forEach((object) => scene.remove(object))
      renderer.domElement.remove()
    }
  }, [api, objects, reducedMotion])

  useEffect(() => {
    if (!api) return
    const index = items.findIndex((item) => item.id === selected)
    if (index >= 0) api.scrollTo(index, reducedMotion)
  }, [api, items, selected, reducedMotion])
  const select = (index: number) => {
    api?.scrollTo(index, reducedMotion)
    onSelect(items[index].id)
  }
  const highlight = (index: number, active: boolean) => {
    objects[index].element.dataset.highlight = String(active)
  }
  return (
    <section
      className="discovery"
      aria-label="Discover opportunities"
      aria-roledescription="carousel"
      data-light-motion={reducedMotion ? 'paused' : 'flowing'}
      style={{ '--discovery-slots': Math.min(5, items.length) } as CSSProperties}
    >
      {(canScroll.previous || canScroll.next) && (
        <button
          className="icon-button carousel-arrow previous"
          aria-label="Previous categories"
          title="Previous categories"
          disabled={!canScroll.previous}
          onClick={() => {
            api?.scrollPrev(reducedMotion)
          }}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <div className="discovery-viewport" ref={viewport}>
        <div className="discovery-track" aria-hidden="true">
          {items.map((item) => (
            <div className="discovery-slide" key={item.id} />
          ))}
        </div>
        <div className="discovery-scene" ref={host} aria-hidden="true" />
        {items.map(({ id }, index) =>
          createPortal(
            <div className="discovery-glass optical-glass" data-selected={selected === id}>
              <GlassReflection />
            </div>,
            objects[index].element,
            id,
          ),
        )}
        <div className="discovery-controls">
          {items.map(({ id, label, icon: Icon }, index) => (
            <div
              className="discovery-control"
              data-category={id}
              key={id}
              ref={(element) => {
                controls.current[index] = element
              }}
            >
              <button
                className={`discovery-card category-${id}`}
                aria-label={`${label}, ${counts[id] || 0} signals`}
                aria-pressed={selected === id}
                onClick={() => select(index)}
                onPointerEnter={() => highlight(index, true)}
                onPointerLeave={() => highlight(index, false)}
                onFocus={() => highlight(index, true)}
                onBlur={() => highlight(index, false)}
                onKeyDown={(event) => {
                  const next =
                    event.key === 'ArrowRight'
                      ? (index + 1) % items.length
                      : event.key === 'ArrowLeft'
                        ? (index + items.length - 1) % items.length
                        : -1
                  if (next >= 0) {
                    event.preventDefault()
                    pendingFocus.current = items[next].id
                    select(next)
                    requestLayout.current?.()
                  }
                }}
              >
                <Icon className="discovery-icon" size={27} strokeWidth={1.6} />
                <span className="discovery-value">
                  {loading ? (
                    <span className="skeleton number" />
                  ) : (
                    (counts[id] || 0).toLocaleString('en-GB')
                  )}
                </span>
                <span className="discovery-name">{label}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
      {(canScroll.previous || canScroll.next) && (
        <button
          className="icon-button carousel-arrow next"
          aria-label="Next categories"
          title="Next categories"
          disabled={!canScroll.next}
          onClick={() => {
            api?.scrollNext(reducedMotion)
          }}
        >
          <ChevronRight size={20} />
        </button>
      )}
      {(canScroll.previous || canScroll.next) && (
        <div className="carousel-pagination" aria-label="Category positions">
          {items.map((item, index) => (
            <button
              key={item.id}
              aria-label={`Show ${item.label}`}
              title={item.label}
              aria-pressed={position === index}
              onClick={() => {
                api?.scrollTo(index, reducedMotion)
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}
