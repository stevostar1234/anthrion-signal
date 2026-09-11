import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Check, ChevronDown, ArrowDownWideNarrow, Square, SquareCheck, EyeOff } from 'lucide-react'
import { LiquidMetal } from '@paper-design/shaders-react'
import { markets } from './lib'
import { applyGlassLight, brandLightPosition, scrollMovesSurface } from './glassLighting'

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const subscribeMotion = (listener: () => void) => {
  motionQuery.addEventListener('change', listener)
  return () => motionQuery.removeEventListener('change', listener)
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => motionQuery.matches)
}

let webglAvailable: boolean | undefined
function supportsMetal() {
  if (webglAvailable !== undefined) return webglAvailable
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    webglAvailable = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglAvailable = false
  }
  return webglAvailable
}

export function AmbientGlass() {
  const reducedMotion = useReducedMotion()
  const [active, setActive] = useState(!document.hidden)
  useEffect(() => {
    const update = () => setActive(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return (
    <div
      className="ambient-glass"
      aria-hidden="true"
      data-motion={reducedMotion ? 'paused' : 'flowing'}
    >
      {active && supportsMetal() && (
        <LiquidMetal
          className="ambient-glass-shader"
          shape="none"
          colorBack="#14211b"
          colorTint="#75998a"
          repetition={0.7}
          softness={0.92}
          shiftRed={0}
          shiftBlue={0.025}
          distortion={0.17}
          contour={0.12}
          angle={-35}
          speed={reducedMotion ? 0 : 0.045}
          frame={7000}
          scale={1.1}
          fit="cover"
          minPixelRatio={0.5}
          maxPixelCount={220000}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}
    </div>
  )
}

export function MetalEdge({ prominent = false }: { prominent?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [active, setActive] = useState(!document.hidden)
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    if (ref.current) observer.observe(ref.current)
    const visibility = () => setActive(!document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  return (
    <span
      ref={ref}
      className={`metal-edge ${prominent ? 'metal-prominent' : ''}`}
      aria-hidden="true"
      data-motion={reducedMotion ? 'paused' : 'flowing'}
    >
      {visible && active && supportsMetal() && (
        <LiquidMetal
          className="metal-shader"
          shape="none"
          colorBack="#9da1a8"
          colorTint="#ffffff"
          repetition={2.4}
          softness={0.12}
          shiftRed={0.08}
          shiftBlue={0.11}
          distortion={0.34}
          contour={0.5}
          angle={52}
          speed={reducedMotion ? 0 : 0.34}
          frame={8000}
          scale={1.4}
          fit="cover"
          minPixelRatio={1}
          maxPixelCount={180000}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}
    </span>
  )
}

export function BrandSignature({ onHome }: { onHome: () => void }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [visible, setVisible] = useState(!document.hidden)
  const reducedMotion = useReducedMotion()
  const metalActive = (hovered || focused) && visible
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])
  return (
    <a
      href={import.meta.env.BASE_URL}
      className="workspace-brand"
      onClick={(event) => {
        event.preventDefault()
        onHome()
      }}
      onFocus={(event) => setFocused(event.currentTarget.matches(':focus-visible'))}
      onBlur={() => setFocused(false)}
      aria-label="Anthrion signal home"
    >
      <span
        className="brand-wordmark"
        data-metal={metalActive}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <img src={`${import.meta.env.BASE_URL}assets/anthrion-logo.svg`} alt="Anthrion" />
        <span className="brand-metal-layer" aria-hidden="true">
          {metalActive && supportsMetal() && (
            <LiquidMetal
              className="brand-metal-shader"
              shape="none"
              colorBack="#a3b0b2"
              colorTint="#f4fbf8"
              repetition={2.5}
              softness={0.16}
              shiftRed={0.04}
              shiftBlue={0.07}
              distortion={0.28}
              contour={0.45}
              angle={58}
              speed={reducedMotion ? 0 : 0.3}
              frame={8000}
              scale={1.2}
              fit="cover"
              minPixelRatio={2}
              maxPixelCount={100000}
              style={{ position: 'absolute', inset: 0 }}
            />
          )}
        </span>
      </span>
      <em className="brand-signal" data-motion={reducedMotion ? 'paused' : 'flowing'}>
        signal
      </em>
    </a>
  )
}

export function GlassReflection({ trackLight = false }: { trackLight?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const surface = ref.current?.parentElement
    if (!trackLight || !surface) return
    let frame = 0
    const update = () => {
      frame = 0
      if (document.hidden) return
      const bounds = surface.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      applyGlassLight(
        surface,
        { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
        brandLightPosition(),
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(surface)
    const brand = document.querySelector('.brand-signal')
    if (brand) observer.observe(brand)
    const scroll = (event: Event) => {
      if (scrollMovesSurface(event, surface, brand)) schedule()
    }
    window.addEventListener('scroll', scroll, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    document.addEventListener('visibilitychange', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [trackLight])
  return <span className="glass-reflection" ref={ref} aria-hidden="true" />
}

export function MarketSection({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <section className="market-section" aria-label="Market selection">
      <nav className="market-tabs" aria-label="Markets">
        {markets.map((market) => (
          <button
            key={market.id}
            aria-label={market.name}
            onClick={() => onSelect(market.id)}
            aria-pressed={selected === market.id}
          >
            <span>{market.id === 'GB' ? 'UK' : market.name}</span>
            {selected === market.id && (
              <span className="market-active-line">
                <MetalEdge prominent />
              </span>
            )}
          </button>
        ))}
      </nav>
    </section>
  )
}

const makeSortOptions = (currency: string) =>
  [
    ['recent', 'Most recent'],
    ['updated', 'Recently updated'],
    ['deadline', 'Closing soon'],
    ['value', `Highest value (${currency})`],
  ] as const

export function SortMenu({
  value,
  onChange,
  currency = 'GBP',
  showHidden,
  onShowHidden,
}: {
  value: string
  onChange: (value: string) => void
  currency?: string
  showHidden: boolean
  onShowHidden: (value: boolean) => void
}) {
  const sortOptions = makeSortOptions(currency)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const options = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const selected = Math.max(
    0,
    sortOptions.findIndex(([key]) => key === value),
  )
  useEffect(() => {
    if (!open) return
    options.current[selected]?.focus()
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, selected])
  return (
    <div
      className="sort-menu"
      ref={ref}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={trigger}
        className="sort-trigger"
        aria-label={`Sort opportunities: ${sortOptions[selected][1]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <ArrowDownWideNarrow size={16} />
        <span>{sortOptions[selected][1]}</span>
        {showHidden && <EyeOff className="sort-hidden-icon" size={14} aria-hidden="true" />}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          className="sort-options"
          role="menu"
          id={id}
          aria-label="Sort opportunities"
          onKeyDown={(e) => {
            const index = options.current.indexOf(document.activeElement as HTMLButtonElement)
            const length = sortOptions.length + 1
            const last = length - 1
            const next =
              e.key === 'ArrowDown'
                ? (index + 1) % length
                : e.key === 'ArrowUp'
                  ? (index + last) % length
                  : e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? last
                      : -1
            if (next >= 0) {
              e.preventDefault()
              options.current[next]?.focus()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
              trigger.current?.focus()
            }
            if (e.key === 'Tab') setOpen(false)
            if (e.key.length === 1 && /[a-z]/i.test(e.key)) {
              const match = sortOptions.findIndex(([, label]) =>
                label.toLowerCase().startsWith(e.key.toLowerCase()),
              )
              if (match >= 0) {
                e.preventDefault()
                options.current[match]?.focus()
              }
            }
          }}
        >
          {sortOptions.map(([key, label], index) => (
            <button
              key={key}
              ref={(element) => {
                options.current[index] = element
              }}
              role="menuitemradio"
              aria-checked={value === key}
              tabIndex={-1}
              onClick={() => {
                onChange(key)
                setOpen(false)
                trigger.current?.focus()
              }}
            >
              <span>{label}</span>
              {value === key && <Check size={16} />}
            </button>
          ))}
          <div className="sort-divider" role="separator" />
          <button
            ref={(element) => {
              options.current[sortOptions.length] = element
            }}
            role="menuitemcheckbox"
            aria-checked={showHidden}
            tabIndex={-1}
            onClick={() => {
              onShowHidden(!showHidden)
              setOpen(false)
              trigger.current?.focus()
            }}
          >
            <span>Show hidden</span>
            {showHidden ? <SquareCheck size={16} /> : <Square size={16} />}
          </button>
        </div>
      )}
    </div>
  )
}
