import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Building2,
  CalendarClock,
  CalendarPlus,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  FileSearch,
  FileText,
  Globe2,
  Layers3,
  Radar,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Target,
  X,
} from 'lucide-react'
import type { Dataset, Filters, Signal } from './types'
import {
  AmbientGlass,
  BrandSignature,
  GlassReflection,
  MarketSection,
  MetalEdge,
  SortMenu,
  useReducedMotion,
} from './WorkspaceUI'
import { DiscoveryCarousel } from './DiscoveryCarousel'
import { VirtualSignalList } from './VirtualSignalList'
import { DismissDust } from './DismissDust'
import {
  amount,
  calendar,
  csv,
  date,
  defaults,
  download,
  filterSignals,
  isAvailableOpportunity,
  isUpdated,
  lifecycleLabels,
  lifecycleState,
  markets,
  matchesMarket,
  marketIsEnabled,
  readFilters,
  normaliseFilters,
  safeURL,
  typeLabels,
  valueCurrency,
} from './lib'

const navItems = [
  { id: 'all', label: 'All Signals', icon: Layers3 },
  { id: 'live', label: 'Live Opportunities', icon: Target },
  { id: 'early', label: 'Pre-market', icon: Radar },
  { id: 'closing', label: 'Closing Soon', icon: CalendarClock },
  { id: 'today', label: 'Added today', icon: CalendarDays },
]

function useLocal<T>(key: string, initial: T, validate: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) || 'null')
      return validate(stored) ? stored : initial
    } catch {
      return initial
    }
  })
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [key, value])
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      try {
        if (event.storageArea !== localStorage || event.key !== key) return
        const stored: unknown = JSON.parse(event.newValue || 'null')
        if (validate(stored)) setValue(stored)
      } catch {
        /* Keep the last valid preferences if storage is malformed. */
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [key, validate])
  return [value, setValue, storageError] as const
}

const validSaved = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string')

function IconButton({
  label,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button {...props} aria-label={label} title={label} className={`icon-button ${className}`}>
      {children}
    </button>
  )
}
function OutLink({
  href,
  children,
  className = '',
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <a className={className} href={safeURL(href)} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
  drawer = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  drawer?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    el?.showModal()
    el?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      el?.close()
      document.body.style.overflow = previous
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''} ${drawer ? 'drawer' : ''}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-top">
        <span>{title}</span>
        <IconButton label="Close panel" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  )
}

export default function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(readFilters)
  const [saved, setSaved, storageError] = useLocal<string[]>('anthrion-saved-v1', [], validSaved)
  const [hidden, setHidden, hiddenStorageError] = useLocal<string[]>(
    'anthrion-hidden-v1',
    [],
    validSaved,
  )
  const [showHidden, setShowHidden] = useState(false)
  const [departing, setDeparting] = useState<Record<string, 'hide' | 'unhide'>>({})
  const pendingDepartures = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; complete: () => void }>(),
  )
  const pendingRowFocus = useRef<number | null>(null)
  const reducedMotion = useReducedMotion()
  const [showFilters, setShowFilters] = useState(false)
  const [detailOpen, setDetailOpen] = useState(
    () =>
      !!new URLSearchParams(location.search).get('signal') &&
      window.matchMedia('(max-width: 900px)').matches,
  )
  const [selected, setSelected] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('signal'),
  )
  const [detailTab, setDetailTab] = useState('preview')
  const [toast, setToast] = useState('')
  const [time, setTime] = useState(Date.now())
  const searchRef = useRef<HTMLInputElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => pendingDepartures.current.forEach(({ timer }) => clearTimeout(timer)), [])
  useEffect(() => {
    if (reducedMotion) pendingDepartures.current.forEach(({ complete }) => complete())
  }, [reducedMotion])
  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/current.json`, {
        cache: 'no-cache',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('The latest opportunity feed is temporarily unavailable.')
      const value: Dataset = await response.json()
      if (
        !['1.0', '2.0'].includes(value.schema_version) ||
        !Array.isArray(value.signals) ||
        !Array.isArray(value.sources) ||
        !value.evidence_catalog
      )
        throw new Error('The opportunity feed could not be verified.')
      setData({ ...value, signals: value.signals.filter((s) => isAvailableOpportunity(s)) })
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Could not load the opportunity feed.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
    const interval = setInterval(() => {
      setTime(Date.now())
      if (!document.hidden) void load()
    }, 5 * 60000)
    return () => {
      clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [load])
  useEffect(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== defaults[key as keyof Filters]) params.set(key, value)
    })
    if (selected) params.set('signal', selected)
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`)
  }, [filters, selected])
  useEffect(() => {
    const handler = () => {
      setFilters(readFilters())
      setSelected(new URLSearchParams(location.search).get('signal'))
      setDetailOpen(
        !!new URLSearchParams(location.search).get('signal') &&
          window.matchMedia('(max-width: 900px)').matches,
      )
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(''), 3500)
      return () => clearTimeout(timeout)
    }
  }, [toast])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const update = (patch: Partial<Filters>) => {
    setFilters((f) => normaliseFilters({ ...f, ...patch }))
    setSelected(null)
    setDetailOpen(false)
  }
  const navigate = (view: string) => {
    update({ view })
  }
  const toggleSave = (id: string) =>
    setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const open = (id: string, tab = 'overview') => {
    setSelected(id)
    setDetailTab(tab === 'overview' ? 'preview' : tab)
    setDetailOpen(tab !== 'overview' || window.matchMedia('(max-width: 900px)').matches)
  }
  const hiddenIds = useMemo(() => new Set(hidden), [hidden])
  const visibleSignals = useMemo(
    () => (data?.signals || []).filter((s) => hiddenIds.has(s.id) === showHidden),
    [data, hiddenIds, showHidden],
  )
  const filtered = useMemo(
    () => filterSignals(visibleSignals, filters, saved, time, data?.capabilities),
    [data, visibleSignals, filters, saved, time],
  )
  const marketSignals = useMemo(
    () =>
      visibleSignals.filter(
        (s) => isAvailableOpportunity(s, time) && matchesMarket(s, filters.market),
      ),
    [visibleSignals, filters.market, time],
  )
  const marketName =
    markets.find((m) => m.id === filters.market)?.name ||
    data?.markets[filters.market]?.name ||
    (filters.market ? `Market ${filters.market}` : 'All markets')
  const marketEnabled = data
    ? marketIsEnabled(filters.market, data.markets)
    : filters.market === 'GB'
  const fresh = !!data && time - Date.parse(data.generated_at) < 26 * 3600000
  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => !['q', 'view', 'sort', 'market'].includes(k) && v !== '',
  ).length
  const selectedSignal = selected
    ? visibleSignals.find((s) => s.id === selected && isAvailableOpportunity(s, time))
    : filtered[0]
  useEffect(() => {
    if (
      selected &&
      data?.signals.some((s) => s.id === selected) &&
      hiddenIds.has(selected) !== showHidden
    ) {
      setSelected(null)
      setDetailOpen(false)
    }
  }, [selected, data, hiddenIds, showHidden])
  useEffect(() => {
    if (pendingRowFocus.current === null) return
    const next = filtered[Math.min(pendingRowFocus.current, filtered.length - 1)]
    pendingRowFocus.current = null
    const frame = requestAnimationFrame(() => {
      const button =
        next &&
        feedRef.current?.querySelector<HTMLButtonElement>(
          `[data-signal-id="${CSS.escape(next.id)}"] .row-select`,
        )
      if (button) button.focus({ preventScroll: true })
      else feedRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [hidden, filtered])
  const dismiss = (id: string) => {
    if (pendingDepartures.current.has(id)) return
    const restoring = hiddenIds.has(id)
    const focusOrigin = document.activeElement
    const hadRowFocus = !!feedRef.current
      ?.querySelector(`[data-signal-id="${CSS.escape(id)}"]`)
      ?.contains(focusOrigin)
    let completed = false
    const commit = () => {
      if (completed) return
      completed = true
      clearTimeout(pendingDepartures.current.get(id)?.timer)
      pendingDepartures.current.delete(id)
      if (
        hadRowFocus &&
        (document.activeElement === focusOrigin || document.activeElement === document.body)
      )
        pendingRowFocus.current = filtered.findIndex((s) => s.id === id)
      setHidden((ids) =>
        restoring
          ? ids.filter((existing) => existing !== id)
          : ids.includes(id)
            ? ids
            : [...ids, id],
      )
      setDeparting((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
    if (reducedMotion) commit()
    else {
      setDeparting((current) => ({ ...current, [id]: restoring ? 'unhide' : 'hide' }))
      // Unhide follows the CSS animation, with a fallback if its row leaves the viewport.
      pendingDepartures.current.set(id, {
        timer: setTimeout(commit, restoring ? 2000 : 620),
        complete: commit,
      })
    }
  }
  useEffect(() => {
    if (!selected || !selectedSignal || matchesMarket(selectedSignal, filters.market)) return
    const market = markets.find((m) =>
      selectedSignal.countries.some((c) => (m.countries as readonly string[]).includes(c)),
    )
    setFilters({
      ...defaults,
      market: market?.id || selectedSignal.countries[0] || 'GB',
      view: 'all',
    })
  }, [selected, selectedSignal, filters.market])
  const listTitle =
    navItems.find((n) => n.id === filters.view)?.label ||
    { saved: 'Saved opportunities' }[filters.view] ||
    'All signals'
  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setToast('View link copied')
    } catch {
      setToast('Use the address bar to share this view')
    }
  }
  const counts = useMemo(
    () =>
      Object.fromEntries(
        navItems.map((n) => [
          n.id,
          filterSignals(
            marketSignals,
            { ...defaults, market: filters.market, view: n.id },
            [],
            time,
          ).length,
        ]),
      ),
    [marketSignals, filters.market, time],
  )
  const switchMarket = (id: string) => {
    update({ market: id, source: '', region: '', buyer: '', cpv: '' })
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell console-shell">
        <AmbientGlass />
        <a className="skip-link" href="#main">
          Skip to opportunities
        </a>

        <main id="main" className="workspace-main">
          <header className="workspace-header">
            <BrandSignature onHome={() => update({ ...defaults, market: filters.market })} />
            <div className="workspace-search" role="search" aria-label="Opportunity search">
              <label className="search-box">
                <Search size={16} />
                <input
                  ref={searchRef}
                  aria-label="Search opportunities"
                  value={filters.q}
                  onChange={(e) => update({ q: e.target.value })}
                  placeholder="Search opportunities, buyers, keywords..."
                />
                {filters.q && (
                  <IconButton label="Clear search" onClick={() => update({ q: '' })}>
                    <X size={13} />
                  </IconButton>
                )}
              </label>
              <button
                aria-label="Filters"
                title="Filters"
                className={`button filter-button ${activeFilterCount ? 'has-filters' : ''}`}
                onClick={() => setShowFilters(true)}
              >
                <SlidersHorizontal size={16} />
                <span>Filters</span>
                {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
              </button>
              <SortMenu
                value={filters.sort}
                currency={valueCurrency(filters)}
                onChange={(sort) => update({ sort })}
                showHidden={showHidden}
                onShowHidden={(value) => {
                  setShowHidden(value)
                  setSelected(null)
                  setDetailOpen(false)
                }}
              />
            </div>
            <nav className="workspace-nav" aria-label="Workspace">
              <button
                title="Saved opportunities"
                aria-current={filters.view === 'saved' ? 'page' : undefined}
                onClick={() => navigate('saved')}
              >
                <Bookmark size={17} />
                <span className="workspace-nav-label">Saved opportunities</span>
                <small>{saved.filter((id) => marketSignals.some((s) => s.id === id)).length}</small>
              </button>
            </nav>
            <div className="workspace-tools">
              <IconButton label="Check for updates" onClick={() => void load()} disabled={loading}>
                <RefreshCw size={17} className={loading ? 'spin' : ''} />
              </IconButton>
            </div>
          </header>
          <div className="workspace-content">
            <MarketSection selected={filters.market} onSelect={switchMarket} />
            {(error || (!fresh && data)) && (
              <div className="alert" role="status">
                <Clock3 size={17} />
                <span>
                  {error ||
                    `The feed was last refreshed ${date(data!.generated_at)}. Confirm current availability in the source notice.`}
                </span>
                <button onClick={() => void load()}>
                  Retry <RefreshCw size={13} />
                </button>
              </div>
            )}
            {(storageError || hiddenStorageError) && (
              <div className="alert" role="status">
                {hiddenStorageError
                  ? 'Hidden opportunities could not be saved in this browser. They may reappear after reloading.'
                  : 'Your browser could not save these opportunities. Export them to keep a copy.'}
              </div>
            )}

            <div className="discovery-band">
              <DiscoveryCarousel
                items={navItems}
                counts={counts}
                selected={filters.view}
                loading={!data}
                onSelect={(view) => {
                  setSelected(null)
                  setFilters({
                    ...defaults,
                    market: filters.market,
                    view,
                    sort: view === 'closing' ? 'deadline' : 'recent',
                  })
                }}
              />
              <div className="discovery-export">
                <IconButton
                  label="Export signals"
                  disabled={!data || !filtered.length}
                  onClick={() => {
                    download(
                      `anthrion-signals-${new Date().toISOString().slice(0, 10)}.csv`,
                      csv(filtered),
                      'text/csv;charset=utf-8',
                    )
                    setToast(`${filtered.length} signals exported`)
                  }}
                >
                  <ArrowDownToLine size={18} />
                </IconButton>
              </div>
            </div>
            <div className="feed-layout">
              <div
                className="feed-heading screen-reader-only"
                aria-live="polite"
                aria-atomic="true"
              >
                <h1>{listTitle}</h1>
                <span className="count-badge">{filtered.length}</span>
              </div>
              {activeFilterCount > 0 && (
                <div className="results-line">
                  <button
                    className="clear-filters"
                    onClick={() => {
                      setSelected(null)
                      setFilters({
                        ...defaults,
                        view: filters.view,
                        q: filters.q,
                        market: filters.market,
                      })
                    }}
                  >
                    <X size={12} />
                    Clear {activeFilterCount} filters
                  </button>
                  <span>{filtered.length} matching signals</span>
                </div>
              )}
              <section className="opportunity-console" aria-label="Opportunity feed">
                <div
                  ref={feedRef}
                  className="signal-feed"
                  role="region"
                  aria-label="Opportunity records"
                  tabIndex={0}
                >
                  {loading && !data ? (
                    <div className="loading-feed" aria-label="Loading opportunities">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="skeleton signal-skeleton" />
                      ))}
                    </div>
                  ) : (
                    <VirtualSignalList
                      signals={filtered}
                      scrollRef={feedRef}
                      resetKey={`${JSON.stringify(filters)}:${showHidden}`}
                      shiftKey={hidden.join('|')}
                      renderRow={(signal) => (
                        <SignalRow
                          key={signal.id}
                          signal={signal}
                          selected={selectedSignal?.id === signal.id}
                          saved={saved.includes(signal.id)}
                          hidden={hiddenIds.has(signal.id)}
                          departure={departing[signal.id]}
                          onDepartureEnd={() =>
                            pendingDepartures.current.get(signal.id)?.complete()
                          }
                          onSave={() => toggleSave(signal.id)}
                          onOpen={(tab) => open(signal.id, tab)}
                          onHide={() => dismiss(signal.id)}
                          now={time}
                        />
                      )}
                    />
                  )}
                  {!loading && filtered.length === 0 && (
                    <div className="empty-state">
                      {marketEnabled ? <FileSearch size={30} /> : <Globe2 size={30} />}
                      <h3>
                        {!marketEnabled
                          ? `No signals for ${marketName}`
                          : showHidden
                            ? 'No hidden signals'
                            : filters.view === 'saved'
                              ? 'No saved opportunities'
                              : 'No matching signals'}
                      </h3>
                      <p>
                        {!marketEnabled
                          ? 'There are no monitored sources in this market yet.'
                          : showHidden
                            ? 'No hidden signals match this market and these filters.'
                            : filters.view === 'saved'
                              ? 'Your saved opportunities will appear here.'
                              : 'Try a broader search or adjust your filters.'}
                      </p>
                      <button
                        className="button secondary"
                        onClick={() =>
                          showHidden
                            ? setShowHidden(false)
                            : !marketEnabled
                              ? switchMarket('GB')
                              : update({ ...defaults, market: filters.market, view: 'all' })
                        }
                      >
                        {showHidden
                          ? 'Return to signals'
                          : marketEnabled
                            ? 'Explore all signals'
                            : 'Explore United Kingdom'}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <aside
                  className="console-inspector"
                  id="selected-opportunity"
                  aria-label="Selected opportunity"
                  tabIndex={0}
                >
                  {selectedSignal && data ? (
                    <ConsoleDetail
                      signal={selectedSignal}
                      data={data}
                      saved={saved.includes(selectedSignal.id)}
                      hidden={hiddenIds.has(selectedSignal.id)}
                      departing={!!departing[selectedSignal.id]}
                      onSave={() => toggleSave(selectedSignal.id)}
                      onHide={() => dismiss(selectedSignal.id)}
                      onInspect={(tab) => {
                        setSelected(selectedSignal.id)
                        setDetailTab(tab)
                        setDetailOpen(true)
                      }}
                    />
                  ) : (
                    <div className="inspector-empty">
                      <FileSearch size={30} />
                      <span>{loading ? 'Loading opportunities' : 'No opportunity selected'}</span>
                    </div>
                  )}
                </aside>
              </section>
            </div>
          </div>
        </main>
        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              className="toast"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Check size={16} />
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
        {showFilters && data && (
          <Modal title="Refine opportunities" onClose={() => setShowFilters(false)}>
            <FilterPanel
              filters={filters}
              update={update}
              data={data}
              count={filtered.length}
              onClose={() => setShowFilters(false)}
              onReset={() => update({ ...defaults, view: filters.view, market: filters.market })}
            />
          </Modal>
        )}
        {detailOpen && selectedSignal && data && (
          <Modal title="Opportunity intelligence" onClose={() => setDetailOpen(false)} wide drawer>
            {detailTab === 'preview' ? (
              <ConsoleDetail
                signal={selectedSignal}
                data={data}
                saved={saved.includes(selectedSignal.id)}
                hidden={hiddenIds.has(selectedSignal.id)}
                departing={!!departing[selectedSignal.id]}
                onSave={() => toggleSave(selectedSignal.id)}
                onHide={() => dismiss(selectedSignal.id)}
                onInspect={setDetailTab}
              />
            ) : (
              <SignalDetail
                signal={selectedSignal}
                data={data}
                tab={detailTab}
                setTab={setDetailTab}
                saved={saved.includes(selectedSignal.id)}
                onSave={() => toggleSave(selectedSignal.id)}
                onShare={() => void share()}
                onBack={() => {
                  if (window.matchMedia('(max-width: 900px)').matches) setDetailTab('preview')
                  else setDetailOpen(false)
                }}
              />
            )}
          </Modal>
        )}
        {selected && data && !selectedSignal && !data.signals.some((s) => s.id === selected) && (
          <Modal title="Opportunity unavailable" onClose={() => setSelected(null)}>
            <div className="empty-state">
              <FileSearch size={30} />
              <h3>This signal is no longer in the current feed</h3>
              <button className="button primary" onClick={() => setSelected(null)}>
                Back to opportunities
              </button>
            </div>
          </Modal>
        )}
      </div>
    </MotionConfig>
  )
}

function SignalRow({
  signal: s,
  selected,
  saved,
  hidden,
  departure,
  onDepartureEnd,
  onSave,
  onOpen,
  onHide,
  now,
}: {
  signal: Signal
  selected: boolean
  saved: boolean
  hidden: boolean
  departure?: 'hide' | 'unhide'
  onDepartureEnd: () => void
  onSave: () => void
  onOpen: (tab?: string) => void
  onHide: () => void
  now: number
}) {
  return (
    <div className="row-motion" data-signal-id={s.id} data-departure={departure}>
      <article
        className={`signal-row type-${s.signal_type.toLowerCase()} ${selected ? 'selected' : ''}`}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.animationName === 'restore-signal')
            onDepartureEnd()
        }}
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest('button, input, label, a')) onOpen()
        }}
      >
        {selected && <MetalEdge />}
        <button
          className="row-select"
          aria-label={s.title}
          aria-pressed={selected}
          aria-controls="selected-opportunity"
          onClick={() => onOpen()}
        >
          <span className="row-copy">
            <span className="row-meta">
              <span>{typeLabels[s.signal_type]}</span>
              {isUpdated(s, now) && <span className="row-updated">Updated</span>}
            </span>
            <span className="row-title">{s.title}</span>
            <span className="row-buyer">
              <Building2 size={12} />
              <span>{s.buyer_name || 'Buyer not published'}</span>
            </span>
          </span>
          <span className="row-numbers">
            {s.value_max !== null && <strong>{amount(s.value_max, s.currency)}</strong>}
            {s.deadline_at && <span>{date(s.deadline_at)}</span>}
          </span>
        </button>
        <div className="row-utilities">
          <IconButton
            label={saved ? 'Unsave opportunity' : 'Save opportunity in this browser'}
            className={saved ? 'is-saved' : ''}
            onClick={onSave}
          >
            {saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
          </IconButton>
          <label className="hide-control">
            <input
              type="checkbox"
              checked={departure ? departure === 'hide' : hidden}
              disabled={!!departure}
              onChange={onHide}
              aria-label={`${hidden ? 'Unhide' : 'Hide'} ${s.title}`}
            />
            <span>{hidden ? 'Unhide' : 'Hide'}</span>
          </label>
        </div>
      </article>
      {departure === 'hide' && <DismissDust id={s.id} />}
    </div>
  )
}

function SourceNoticeLink({ href }: { href: string }) {
  return (
    <OutLink href={href} className="button glass-source-button optical-glass">
      <span>Open source notice</span>
      <span className="source-link-icon" aria-hidden="true">
        <ExternalLink size={16} />
      </span>
      <GlassReflection trackLight />
    </OutLink>
  )
}

function ConsoleDetail({
  signal: s,
  data,
  saved,
  hidden,
  departing,
  onSave,
  onHide,
  onInspect,
}: {
  signal: Signal
  data: Dataset
  saved: boolean
  hidden: boolean
  departing: boolean
  onSave: () => void
  onHide: () => void
  onInspect: (tab: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 })
  }, [s.id])
  const paragraphs = (
    s.description?.trim() || 'No description was published. Review the source notice for details.'
  )
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim())
  const capabilities = s.matched_capabilities
    .map((id) => data.capabilities.find((item) => item.id === id)?.label)
    .filter(Boolean)
  return (
    <div className="console-detail">
      <div
        className="inspector-scroll"
        ref={ref}
        tabIndex={0}
        role="region"
        aria-label="Opportunity record"
      >
        <div className="inspector-content">
          <div className="inspector-heading">
            <div>
              <h2>{s.title}</h2>
              <div className="inspector-buyerline">
                <p className="inspector-buyer">
                  <span>{s.buyer_name || 'Buyer not published'}</span>
                </p>
                <div className="inspector-utilities">
                  <IconButton
                    label={saved ? 'Unsave selected opportunity' : 'Save selected opportunity'}
                    onClick={onSave}
                  >
                    {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                  </IconButton>
                  <label className="hide-control">
                    <input
                      type="checkbox"
                      checked={departing ? !hidden : hidden}
                      disabled={departing}
                      onChange={onHide}
                      aria-label={`${hidden ? 'Unhide' : 'Hide'} selected opportunity`}
                    />
                    <span>{hidden ? 'Unhide' : 'Hide'}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <dl className="inspector-facts">
            <div>
              <dt>Notice type</dt>
              <dd>
                <FileText size={20} />
                <span>{typeLabels[s.signal_type]}</span>
              </dd>
            </div>
            <div>
              <dt>Value</dt>
              <dd>
                <Layers3 size={20} />
                <span>{amount(s.value_max, s.currency)}</span>
              </dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>
                <CalendarClock size={20} />
                <span>{s.deadline_at ? date(s.deadline_at) : 'Deadline not published'}</span>
                {s.deadline_at && (
                  <IconButton label="Add deadline to calendar" onClick={() => calendar(s)}>
                    <CalendarPlus size={16} />
                  </IconButton>
                )}
              </dd>
            </div>
          </dl>
          <section className="inspector-capabilities">
            <h3>Capabilities</h3>
            {capabilities.length > 0 ? (
              <ul className="capability-line">
                {capabilities.map((capability) => (
                  <li key={capability}>{capability}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Not specified</p>
            )}
          </section>
          {(!['OPEN', 'EARLY_ENGAGEMENT'].includes(lifecycleState(s)) ||
            !!s.exclusion_reasons?.length) && (
            <p className="lifecycle-note">
              <Clock3 size={14} />
              <span>
                {s.exclusion_reasons?.join(' ') ||
                  s.lifecycle_reason ||
                  lifecycleLabels[lifecycleState(s)]}
              </span>
            </p>
          )}
          <div className="inspector-summary">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>
      <footer className="record-action-dock" aria-label="Record actions">
        <button className="record-detail-button" onClick={() => onInspect('overview')}>
          <ExternalLink size={18} />
          <span>Full details</span>
        </button>
        <SourceNoticeLink href={s.primary_source_url} />
      </footer>
    </div>
  )
}

function FilterPanel({
  filters: f,
  update,
  data,
  count,
  onClose,
  onReset,
}: {
  filters: Filters
  update: (v: Partial<Filters>) => void
  data: Dataset
  count: number
  onClose: () => void
  onReset: () => void
}) {
  const select = (
    label: string,
    key: keyof Filters,
    choices: { value: string; label: string }[],
  ) => (
    <label>
      {label}
      <select aria-label={label} value={f[key]} onChange={(e) => update({ [key]: e.target.value })}>
        <option value="">Any</option>
        {choices.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <>
      <div className="filter-grid">
        {select(
          'Opportunity type',
          'type',
          Object.entries(typeLabels)
            .filter(([value]) => !['AWARD', 'RENEWAL_SIGNAL'].includes(value))
            .map(([value, label]) => ({ value, label })),
        )}
        {select(
          'Source',
          'source',
          data.sources.filter((s) => s.enabled).map((s) => ({ value: s.id, label: s.name })),
        )}
        {select(
          'Capability',
          'capability',
          data.capabilities.map((c) => ({ value: c.id, label: c.label })),
        )}
        {select(
          'Sector',
          'sector',
          [...new Set(data.signals.flatMap((s) => s.categories))]
            .sort()
            .map((s) => ({ value: s, label: s })),
        )}
        {select('Deadline', 'deadline', [
          { value: '7', label: 'Next 7 days' },
          { value: '14', label: 'Next 14 days' },
          { value: '30', label: 'Next 30 days' },
          { value: '90', label: 'Next 90 days' },
        ])}
        {select('Freshness', 'change', [
          { value: 'new', label: 'New in 24 hours' },
          { value: 'updated', label: 'Updated in 24 hours' },
        ])}
        <label>
          Buyer
          <input
            value={f.buyer}
            placeholder="Buyer name"
            onChange={(e) => update({ buyer: e.target.value })}
          />
        </label>
        <label>
          Region
          <input
            value={f.region}
            placeholder="Region or location code"
            onChange={(e) => update({ region: e.target.value })}
          />
        </label>
        <label>
          CPV code
          <input
            value={f.cpv}
            inputMode="numeric"
            placeholder="e.g. 722"
            onChange={(e) => update({ cpv: e.target.value })}
          />
        </label>
        <label>
          Minimum value ({valueCurrency(f)})
          <input
            type="number"
            min="0"
            value={f.minValue}
            placeholder="No minimum"
            onChange={(e) => update({ minValue: e.target.value })}
          />
        </label>
        <label>
          Maximum value ({valueCurrency(f)})
          <input
            type="number"
            min="0"
            value={f.maxValue}
            placeholder="No maximum"
            onChange={(e) => update({ maxValue: e.target.value })}
          />
        </label>
        {select(
          'Currency',
          'currency',
          [
            ...new Set(
              data.signals
                .filter((s) => matchesMarket(s, f.market))
                .map((s) => s.currency)
                .filter((c): c is string => !!c),
            ),
          ]
            .sort()
            .map((c) => ({ value: c, label: c })),
        )}
      </div>
      <div className="modal-actions">
        <button className="button secondary" onClick={onReset}>
          Reset filters
        </button>
        <button className="button primary" onClick={onClose}>
          Show {count} signals <ArrowRight size={15} />
        </button>
      </div>
    </>
  )
}

function SignalDetail({
  signal: s,
  data,
  tab,
  setTab,
  saved,
  onSave,
  onShare,
  onBack,
}: {
  signal: Signal
  data: Dataset
  tab: string
  setTab: (tab: string) => void
  saved: boolean
  onSave: () => void
  onShare: () => void
  onBack: () => void
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const tabs = ['overview', 'sources']
  const activeTab = tabs.includes(tab) ? tab : 'overview'
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [activeTab, s.id])
  const facts = [
    ['Published value', amount(s.value_max, s.currency, false)],
    ['Closing date', date(s.deadline_at)],
    ['Published', date(s.published_at)],
    [
      'Contract period',
      s.contract_start || s.contract_end
        ? `${date(s.contract_start)} to ${date(s.contract_end)}`
        : 'Not published',
    ],
    ['Framework', s.framework || 'Not specified'],
    ['Region', s.regions.join(', ') || s.countries.join(', ') || 'Not specified'],
    ['Procurement lots', s.lot_ids.join(', ') || 'Not published'],
    ['CPV classifications', s.cpv_codes.join(', ') || 'Not published'],
  ]
  const capabilities = s.matched_capabilities
    .map((id) => data.capabilities.find((c) => c.id === id)?.label)
    .filter(Boolean)
  return (
    <>
      <div className="detail-heading" tabIndex={0} role="region" aria-label="Opportunity heading">
        <div className="detail-eyebrow">
          <span className="type-label">{typeLabels[s.signal_type]}</span>
        </div>
        <h2>{s.title}</h2>
        <div className="buyer">
          <Building2 size={14} />
          {s.buyer_name || 'Buyer not published'}
        </div>
        <div className="detail-actions">
          <button className="button secondary" onClick={onSave}>
            {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
            {saved ? 'Saved' : 'Save opportunity'}
          </button>
          {s.deadline_at && (
            <IconButton label="Add deadline to calendar" onClick={() => calendar(s)}>
              <CalendarPlus size={17} />
            </IconButton>
          )}
          <IconButton label="Copy opportunity link" onClick={onShare}>
            <Copy size={16} />
          </IconButton>
        </div>
      </div>
      <div className="detail-tabs" role="tablist" aria-label="Opportunity detail sections">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            id={`detail-tab-${t}`}
            aria-controls="detail-panel"
            aria-selected={activeTab === t}
            tabIndex={activeTab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={(event) => {
              const current = tabs.indexOf(t)
              const index =
                event.key === 'ArrowRight'
                  ? (current + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (current + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : -1
              if (index < 0) return
              event.preventDefault()
              setTab(tabs[index])
              document.getElementById(`detail-tab-${tabs[index]}`)?.focus()
            }}
          >
            {t === 'overview' ? 'Overview' : 'Sources & timeline'}
          </button>
        ))}
      </div>
      <div
        ref={contentRef}
        className="detail-content"
        role="tabpanel"
        id="detail-panel"
        aria-labelledby={`detail-tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === 'overview' ? (
          <>
            <section className="detail-section">
              <h3>Opportunity scope</h3>
              <p className="detail-summary">
                {s.description?.trim() ||
                  'No description was published. Review the source notice for details.'}
              </p>
              <p className="lifecycle-note">
                {lifecycleLabels[lifecycleState(s)]}:{' '}
                {s.lifecycle_reason || 'Confirm the latest status in the source notice.'}
              </p>
            </section>
            <section className="detail-section">
              <h3>Commercial & procurement facts</h3>
              <dl className="facts-grid">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {!!capabilities.length && (
              <section className="detail-section">
                <h3>Capabilities</h3>
                <div className="capability-tags large">
                  {capabilities.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            <section className="detail-section">
              <h3>Source provenance</h3>
              <div className="provenance-list">
                {s.provenance.map((p, i) => (
                  <div key={`${p.source}-${p.release_id}-${i}`}>
                    <span className="source-icon">
                      <FileText size={16} />
                    </span>
                    <div>
                      <OutLink href={p.url}>
                        {p.source_name}
                        <ArrowUpRight size={13} />
                      </OutLink>
                      <small>Reference {p.release_id || 'Not published'}</small>
                      <small>
                        Checked{' '}
                        {date(p.retrieved_at, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
              {s.ocid && (
                <p className="ocid">
                  OCID <code>{s.ocid}</code>
                </p>
              )}
            </section>
            <section className="detail-section">
              <h3>Documents</h3>
              {s.documents.length ? (
                <div className="documents">
                  {s.documents.map((d) => (
                    <OutLink key={d.url} href={d.url}>
                      <FileText size={16} />
                      <span>{d.title}</span>
                      <ArrowUpRight size={14} />
                    </OutLink>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  No supporting documents were linked in the collected notice.
                </p>
              )}
            </section>
            <section className="detail-section">
              <h3>Timeline</h3>
              <ol className="timeline">
                {[...s.changes].reverse().map((c, i) => (
                  <li key={i}>
                    <span />
                    <div>
                      <strong>
                        {c.kind === 'discovered' ? 'First discovered' : 'Material update'}
                      </strong>
                      <time>
                        {date(c.at, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      {!!c.fields.length && (
                        <p>{c.fields.map((f) => f.replaceAll('_', ' ')).join(', ')}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              <dl className="facts-grid">
                <div>
                  <dt>First seen</dt>
                  <dd>{date(s.first_seen_at)}</dd>
                </div>
                <div>
                  <dt>Last checked</dt>
                  <dd>{date(s.last_seen_at)}</dd>
                </div>
                <div>
                  <dt>Last material update</dt>
                  <dd>{date(s.last_material_update)}</dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </div>
      <footer className="record-action-dock" aria-label="Record actions">
        <button className="record-detail-button" onClick={onBack}>
          <ArrowLeft size={18} />
          <span>Back to record</span>
        </button>
        <SourceNoticeLink href={s.primary_source_url} />
      </footer>
    </>
  )
}
