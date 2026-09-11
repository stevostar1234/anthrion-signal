import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode, RefObject } from 'react'
import {
  defaultRangeExtractor,
  useVirtualizer,
  useWindowVirtualizer,
} from '@tanstack/react-virtual'
import type { Range } from '@tanstack/react-virtual'
import type { Signal } from './types'
import { motion } from 'motion/react'

const compactQuery = window.matchMedia('(max-width: 900px)')
const subscribeCompact = (listener: () => void) => {
  compactQuery.addEventListener('change', listener)
  return () => compactQuery.removeEventListener('change', listener)
}

export function VirtualSignalList({
  signals,
  scrollRef,
  resetKey,
  shiftKey,
  renderRow,
}: {
  signals: Signal[]
  scrollRef: RefObject<HTMLDivElement | null>
  resetKey: string
  shiftKey: string
  renderRow: (signal: Signal) => ReactNode
}) {
  const compact = useSyncExternalStore(subscribeCompact, () => compactQuery.matches)
  const ref = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const [focused, setFocused] = useState<number | null>(null)
  const getItemKey = useCallback((index: number) => signals[index].id, [signals])
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range)
      // Keep keyboard focus and its neighbours mounted when the user scrolls away.
      if (focused !== null) indexes.push(focused - 1, focused, focused + 1)
      return [...new Set(indexes)].filter((i) => i >= 0 && i < signals.length).sort((a, b) => a - b)
    },
    [focused, signals.length],
  )
  const options = {
    count: signals.length,
    estimateSize: () => (compact ? 124 : 112),
    overscan: 5,
    getItemKey,
    rangeExtractor,
    useFlushSync: false,
  }
  const elementVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    ...options,
    getScrollElement: () => scrollRef.current,
    enabled: !compact,
  })
  const windowVirtualizer = useWindowVirtualizer<HTMLDivElement>({
    ...options,
    scrollMargin,
    enabled: compact,
  })
  const virtualizer = compact ? windowVirtualizer : elementVirtualizer

  useLayoutEffect(() => {
    if (!compact || !ref.current) return
    const update = () =>
      setScrollMargin((ref.current?.getBoundingClientRect().top || 0) + window.scrollY)
    const observer = new ResizeObserver(update)
    observer.observe(document.querySelector('.workspace-content') || document.body)
    window.addEventListener('resize', update)
    update()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [compact])

  const previousReset = useRef(resetKey)
  useEffect(() => {
    if (previousReset.current === resetKey) return
    previousReset.current = resetKey
    setFocused(null)
    if (compact) {
      const top = ref.current?.getBoundingClientRect().top || 0
      if (top < 0) window.scrollTo({ top: Math.max(0, window.scrollY + top - 16) })
    } else scrollRef.current?.scrollTo({ top: 0 })
  }, [resetKey, compact, scrollRef])

  return (
    <div
      className="signal-list virtual-signal-list"
      ref={ref}
      role="list"
      aria-label="Opportunity results"
      style={{ height: virtualizer.getTotalSize() }}
      onFocusCapture={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]')
        if (row) setFocused(Number(row.dataset.index))
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(null)
      }}
      onKeyDown={(event) => {
        if (!(event.target as HTMLElement).matches('.row-select')) return
        const current = Number(
          (event.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index,
        )
        const next =
          event.key === 'ArrowDown'
            ? current + 1
            : event.key === 'ArrowUp'
              ? current - 1
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? signals.length - 1
                  : -1
        if (next < 0 || next >= signals.length) return
        event.preventDefault()
        setFocused(next)
        virtualizer.scrollToIndex(next, { align: 'auto' })
        requestAnimationFrame(() =>
          ref.current
            ?.querySelector<HTMLButtonElement>(`[data-index="${next}"] .row-select`)
            ?.focus(),
        )
      }}
    >
      {virtualizer.getVirtualItems().map((item) => (
        <motion.div
          key={item.key}
          layout="position"
          layoutDependency={shiftKey}
          transition={{ layout: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
          ref={virtualizer.measureElement}
          data-index={item.index}
          className="virtual-signal-row"
          role="listitem"
          aria-posinset={item.index + 1}
          aria-setsize={signals.length}
          style={{ top: Math.round(item.start - (compact ? scrollMargin : 0)) }}
        >
          {renderRow(signals[item.index])}
        </motion.div>
      ))}
    </div>
  )
}
