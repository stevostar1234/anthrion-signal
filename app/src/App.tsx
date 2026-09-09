import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  BookmarkCheck,
  Building2,
  CalendarClock,
  CalendarPlus,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  FileSearch,
  FileText,
  Flag,
  Globe2,
  Layers3,
  LayoutList,
  ListFilter,
  Menu,
  Moon,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Rows3,
  X,
} from 'lucide-react'
import type { Dataset, Filters, Signal } from './types'
import {
  amount,
  calendar,
  csv,
  date,
  daysLeft,
  deadlineCaption,
  defaults,
  download,
  filterSignals,
  isEarly,
  isLive,
  isNew,
  isUpdated,
  markets,
  matchesMarket,
  marketIsEnabled,
  readFilters,
  recommendationLabels,
  safeURL,
  typeLabels,
} from './lib'

const navItems = [
  { id: 'top', label: 'Top signals', icon: Sparkles },
  { id: 'all', label: 'All signals', icon: Layers3 },
  { id: 'live', label: 'Live opportunities', icon: Target },
  { id: 'early', label: 'Early engagement', icon: Radar },
  { id: 'pipeline', label: 'Future & pipeline', icon: TrendingUp },
  { id: 'renewals', label: 'Renewals', icon: RefreshCw },
  { id: 'frameworks', label: 'Frameworks', icon: Building2 },
  { id: 'funding', label: 'Funding & partnerships', icon: Flag },
  { id: 'awards', label: 'Awards', icon: CheckCheck },
]
type LocalView = { name: string; filters: Filters }
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
  return [value, setValue, storageError] as const
}

const validSaved = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string')
const validViews = (value: unknown): value is LocalView[] =>
  Array.isArray(value) &&
  value.every(
    (view) =>
      view &&
      typeof view.name === 'string' &&
      view.filters &&
      Object.keys(defaults).every((key) => typeof view.filters[key] === 'string'),
  )

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
  const [views, setViews] = useLocal<LocalView[]>('anthrion-views-v1', [], validViews)
  const [showFilters, setShowFilters] = useState(false)
  const [showMarkets, setShowMarkets] = useState(false)
  const [theme, setTheme] = useLocal<'light' | 'dark'>(
    'anthrion-theme-v1',
    'light',
    (value): value is 'light' | 'dark' => value === 'light' || value === 'dark',
  )
  const [density, setDensity] = useLocal<'comfortable' | 'compact'>(
    'anthrion-density-v1',
    'comfortable',
    (value): value is 'comfortable' | 'compact' => value === 'comfortable' || value === 'compact',
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('signal'),
  )
  const [detailTab, setDetailTab] = useState('overview')
  const [compare, setCompare] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const [showSaveView, setShowSaveView] = useState(false)
  const [viewName, setViewName] = useState('')
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [time, setTime] = useState(Date.now())
  const searchRef = useRef<HTMLInputElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#17191c' : '#f6f7f8')
  }, [theme])
  useEffect(() => {
    if (!menuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sidebarRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const closeOnResize = () => {
      if (window.innerWidth > 1000) setMenuOpen(false)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
      if (event.key !== 'Tab') return
      const controls = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>('a, button:not(:disabled)') || [],
      )
      const next = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === next) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        next?.focus()
      }
    }
    window.addEventListener('resize', closeOnResize)
    window.addEventListener('keydown', keydown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('resize', closeOnResize)
      window.removeEventListener('keydown', keydown)
      document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus()
    }
  }, [menuOpen])
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
        value.schema_version !== '1.0' ||
        !Array.isArray(value.signals) ||
        !Array.isArray(value.sources) ||
        !value.evidence_catalog
      )
        throw new Error('The opportunity feed could not be verified.')
      setData(value)
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
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])
  useEffect(() => {
    setPage(1)
  }, [filters])
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
  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const navigate = (view: string) => {
    update({ view })
    setMenuOpen(false)
  }
  const toggleSave = (id: string) =>
    setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const open = (id: string, tab = 'overview') => {
    setSelected(id)
    setDetailTab(tab)
  }
  const filtered = useMemo(
    () => filterSignals(data?.signals || [], filters, saved, time),
    [data, filters, saved, time],
  )
  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, Math.ceil(filtered.length / 15))))
  }, [filtered.length])
  const marketSignals = useMemo(
    () => (data?.signals || []).filter((s) => matchesMarket(s, filters.market)),
    [data, filters.market],
  )
  const live = marketSignals.filter((s) => isLive(s, time))
  const closing = live
    .filter((s) => daysLeft(s, time) !== null && daysLeft(s, time)! <= 14)
    .sort((a, b) => Date.parse(a.deadline_at!) - Date.parse(b.deadline_at!))
  const activeSources = data?.sources.filter((s) => s.enabled) || []
  const market = markets.find((m) => m.id === filters.market)
  const marketName =
    market?.name ||
    data?.markets[filters.market]?.name ||
    (filters.market ? `Market ${filters.market}` : 'All markets')
  const marketEnabled = data
    ? marketIsEnabled(filters.market, data.markets)
    : filters.market === 'GB'
  const marketSources =
    filters.market === 'GB' || !filters.market
      ? activeSources
      : activeSources.filter((source) =>
          marketSignals.some((s) => s.provenance.some((p) => p.source === source.id)),
        )
  const healthy = activeSources.filter((s) => s.status === 'healthy')
  const fresh = !!data && time - Date.parse(data.generated_at) < 26 * 3600000
  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => !['q', 'view', 'sort', 'market'].includes(k) && v !== '',
  ).length
  const selectedSignal = data?.signals.find((s) => s.id === selected)
  const listTitle =
    navItems.find((n) => n.id === filters.view)?.label ||
    { saved: 'Saved opportunities', updates: 'Latest updates', sources: 'Source coverage' }[
      filters.view
    ] ||
    'All signals'
  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setToast('View link copied')
    } catch {
      setToast('Use the address bar to share this view')
    }
  }
  const counts = Object.fromEntries(
    navItems.map((n) => [
      n.id,
      filterSignals(marketSignals, { ...defaults, market: filters.market, view: n.id }, saved, time)
        .length,
    ]),
  )
  const switchMarket = (id: string) => {
    update({ market: id, source: '', region: '', buyer: '', cpv: '' })
    setCompare([])
    setShowMarkets(false)
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className={`app-shell density-${density}`}>
        <a className="skip-link" href="#main">
          Skip to opportunities
        </a>
        {menuOpen && (
          <button
            className="nav-scrim"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside
          ref={sidebarRef}
          className={`sidebar ${menuOpen ? 'is-open' : ''}`}
          aria-label="Main navigation"
        >
          <a
            href={import.meta.env.BASE_URL}
            className="brand"
            onClick={(e) => {
              e.preventDefault()
              navigate('top')
            }}
          >
            <img src={`${import.meta.env.BASE_URL}assets/brand-mark.svg`} alt="" />
            <div>
              <span>anthrion</span>
              <small>SIGNAL INTELLIGENCE</small>
            </div>
          </a>
          <div className="workspace-switch">
            <span className="workspace-monogram">A</span>
            <div>
              Anthrion workspace<small>Business development</small>
            </div>
            <ShieldCheck size={16} />
          </div>
          <div className="nav-caption">DISCOVER</div>
          <nav className="nav-list">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={filters.view === id ? 'active' : ''}
                onClick={() => navigate(id)}
                aria-current={filters.view === id ? 'page' : undefined}
              >
                <Icon size={17} />
                <span>{label}</span>
                {['top', 'live', 'early'].includes(id) && <small>{counts[id] || 0}</small>}
              </button>
            ))}
          </nav>
          <div className="nav-caption workspace-label">WORKSPACE</div>
          <nav className="nav-list">
            <button
              className={filters.view === 'saved' ? 'active' : ''}
              aria-current={filters.view === 'saved' ? 'page' : undefined}
              onClick={() => navigate('saved')}
            >
              <Bookmark size={17} />
              <span>Saved opportunities</span>
              <small>{saved.filter((id) => marketSignals.some((s) => s.id === id)).length}</small>
            </button>
            <button
              className={filters.view === 'updates' ? 'active' : ''}
              aria-current={filters.view === 'updates' ? 'page' : undefined}
              onClick={() => navigate('updates')}
            >
              <Bell size={17} />
              <span>Latest updates</span>
            </button>
            <button
              className={filters.view === 'sources' ? 'active' : ''}
              aria-current={filters.view === 'sources' ? 'page' : undefined}
              onClick={() => navigate('sources')}
            >
              <Globe2 size={17} />
              <span>Source coverage</span>
            </button>
          </nav>
          {views.length > 0 && (
            <>
              <div className="nav-caption">SAVED VIEWS</div>
              <nav className="nav-list saved-views">
                {views.map((v, i) => (
                  <div key={i}>
                    <button
                      onClick={() => {
                        setFilters(v.filters)
                        setMenuOpen(false)
                      }}
                    >
                      <ListFilter size={15} />
                      <span>{v.name}</span>
                    </button>
                    <IconButton
                      label={`Delete saved view ${v.name}`}
                      onClick={() => setViews((vs) => vs.filter((_, index) => index !== i))}
                    >
                      <X size={12} />
                    </IconButton>
                  </div>
                ))}
              </nav>
            </>
          )}
          <div className="sidebar-bottom">
            <div className="system-status">
              <span
                className={`status-dot ${fresh && healthy.length === activeSources.length ? '' : 'amber'}`}
              />
              <span>
                {!data
                  ? 'Connecting to sources'
                  : !fresh
                    ? 'Update overdue'
                    : 'Intelligence refreshed'}
                <small>
                  {data
                    ? date(data.generated_at, {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: 'numeric',
                        month: 'short',
                      })
                    : 'Loading latest feed'}
                </small>
              </span>
              <Activity size={16} />
            </div>
            <div className="account">
              <span className="avatar">A</span>
              <div>
                Anthrion<small>Commercial intelligence</small>
              </div>
            </div>
          </div>
        </aside>

        <main id="main" className="main" inert={menuOpen}>
          <header className="topbar">
            <div className="breadcrumb">
              <IconButton
                label="Open navigation"
                className="mobile-menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(true)}
              >
                <Menu size={20} />
              </IconButton>
              <span>Signal</span>
              <ChevronRight size={13} />
              <strong>{listTitle}</strong>
            </div>
            <div className="topbar-actions">
              <button
                className="market-trigger"
                onClick={() => setShowMarkets(true)}
                aria-label={`Choose market: ${marketName}`}
                aria-haspopup="dialog"
              >
                {market && market.id !== 'NORDICS' ? (
                  <img
                    src={`${import.meta.env.BASE_URL}assets/flags/${market.id.toLowerCase()}.png`}
                    alt=""
                  />
                ) : (
                  <Globe2 size={17} />
                )}
                <span>{marketName}</span>
                <ChevronDown size={14} />
              </button>
              <span className={`freshness-label ${fresh ? '' : 'overdue'}`}>
                <span className={`status-dot ${fresh ? '' : 'amber'}`} />
                {data
                  ? `Updated ${date(data.generated_at, { hour: '2-digit', minute: '2-digit' })}`
                  : 'Connecting'}
              </span>
              <IconButton
                label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </IconButton>
              <IconButton label="Check for updates" onClick={() => void load()} disabled={loading}>
                <RefreshCw size={16} className={loading ? 'spin' : ''} />
              </IconButton>
            </div>
          </header>
          <div className="page-content">
            <section className="page-heading">
              <div>
                <div className="eyebrow">ANTHRION SIGNAL</div>
                <h1>
                  Opportunity intelligence<span className="heading-dot">.</span>
                </h1>
                <p>
                  {data
                    ? marketEnabled
                      ? `${marketSignals.length.toLocaleString('en-GB')} signals across ${marketSources.length} public sources`
                      : `Monitoring is not yet active in ${marketName}.`
                    : 'Loading your market'}
                  <span className="heading-date">
                    {date(new Date(time).toISOString(), {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    setViewName(listTitle)
                    setShowSaveView(true)
                  }}
                  title="Save these filters in this browser"
                >
                  <Bookmark size={15} />
                  Save view
                </button>
                <button
                  className="button secondary export-button"
                  onClick={() => {
                    download(
                      `anthrion-signals-${new Date().toISOString().slice(0, 10)}.csv`,
                      csv(filtered),
                      'text/csv;charset=utf-8',
                    )
                    setToast(`${filtered.length} signals exported`)
                  }}
                  disabled={!data || !filtered.length}
                >
                  <ArrowDownToLine size={15} />
                  Export signals
                </button>
              </div>
            </section>
            {(error || (!fresh && data)) && (
              <div className="alert" role="status">
                <Clock3 size={17} />
                <span>
                  {error ||
                    `The feed was last refreshed ${date(data!.generated_at)}. Check source coverage for availability.`}
                </span>
                <button onClick={() => void load()}>
                  Retry <RefreshCw size={13} />
                </button>
              </div>
            )}
            {storageError && (
              <div className="alert" role="status">
                Your browser could not save these opportunities. Export them to keep a copy.
              </div>
            )}
            <section className="stats-strip" aria-label="Market overview">
              {[
                {
                  label: 'Top signals',
                  value: counts.top || 0,
                  icon: Sparkles,
                  note: 'Prioritised for Anthrion',
                  color: 'mint',
                  action: () => setFilters({ ...defaults, market: filters.market, view: 'top' }),
                },
                {
                  label: 'Live opportunities',
                  value: live.length,
                  icon: Target,
                  note: 'Accepting responses',
                  color: 'ice',
                  action: () => setFilters({ ...defaults, market: filters.market, view: 'live' }),
                },
                {
                  label: 'Early engagement',
                  value: marketSignals.filter(isEarly).length,
                  icon: TrendingUp,
                  note: 'Get ahead of procurement',
                  color: 'lilac',
                  action: () => setFilters({ ...defaults, market: filters.market, view: 'early' }),
                },
                {
                  label: 'Closing this week',
                  value: closing.filter((s) => daysLeft(s, time)! <= 7).length,
                  icon: CalendarClock,
                  note: 'In the next 7 days',
                  color: 'amber',
                  action: () =>
                    setFilters({
                      ...defaults,
                      market: filters.market,
                      view: 'live',
                      deadline: '7',
                      sort: 'deadline',
                    }),
                },
              ].map((stat) => (
                <button className={`stat ${stat.color}`} key={stat.label} onClick={stat.action}>
                  <div className="stat-label">
                    <stat.icon size={14} />
                    {stat.label}
                  </div>
                  <div className={`stat-value ${stat.color}`}>
                    {data ? (
                      stat.value.toLocaleString('en-GB')
                    ) : (
                      <span className="skeleton number" />
                    )}
                  </div>
                  <span className="stat-note">
                    {stat.note}
                    <ArrowUpRight size={15} />
                  </span>
                </button>
              ))}
            </section>
            {filters.view === 'sources' && data ? (
              <SourceCoverage data={{ ...data, sources: marketSources }} now={time} />
            ) : (
              <div className="content-grid">
                <section className="signal-feed" aria-label="Opportunity feed">
                  <div className="feed-heading">
                    <div>
                      <h2>{listTitle}</h2>
                      <span className="count-badge">{filtered.length}</span>
                    </div>
                    <div className="feed-heading-actions">
                      <label className="sort-control">
                        <select
                          aria-label="Sort opportunities"
                          value={filters.sort}
                          onChange={(e) => update({ sort: e.target.value })}
                        >
                          <option value="recommended">Recommended</option>
                          <option value="fit">Highest fit</option>
                          <option value="recent">Most recent</option>
                          <option value="deadline">Closing soon</option>
                          <option value="value">Highest value (GBP)</option>
                          <option value="confidence">Highest confidence</option>
                        </select>
                        <ChevronDown size={12} />
                      </label>
                      <div className="density-switch" aria-label="Opportunity density">
                        <IconButton
                          label="Comfortable view"
                          aria-pressed={density === 'comfortable'}
                          onClick={() => setDensity('comfortable')}
                        >
                          <LayoutList size={17} />
                        </IconButton>
                        <IconButton
                          label="Compact view"
                          aria-pressed={density === 'compact'}
                          onClick={() => setDensity('compact')}
                        >
                          <Rows3 size={17} />
                        </IconButton>
                      </div>
                      <IconButton label="Copy link to this view" onClick={() => void share()}>
                        <Copy size={14} />
                      </IconButton>
                    </div>
                  </div>
                  <div className="toolbar">
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
                      className={`button filter-button ${activeFilterCount ? 'has-filters' : ''}`}
                      onClick={() => setShowFilters(true)}
                    >
                      <SlidersHorizontal size={15} />
                      <span>Filters</span>
                      {activeFilterCount > 0 && (
                        <span className="filter-count">{activeFilterCount}</span>
                      )}
                    </button>
                  </div>
                  <div className="capability-filters" aria-label="Filter by capability">
                    <button
                      className={!filters.capability ? 'active' : ''}
                      aria-pressed={!filters.capability}
                      onClick={() => update({ capability: '' })}
                    >
                      All capabilities
                    </button>
                    {(data?.capabilities || [])
                      .filter((c) =>
                        ['crm', 'ai', 'integration', 'data'].some((word) => c.id.includes(word)),
                      )
                      .slice(0, 4)
                      .map((c) => (
                        <button
                          key={c.id}
                          className={filters.capability === c.id ? 'active' : ''}
                          aria-pressed={filters.capability === c.id}
                          onClick={() =>
                            update({ capability: filters.capability === c.id ? '' : c.id })
                          }
                        >
                          {c.label
                            .replace(' & customer experience', '')
                            .replace(' & intelligent agents', ' & agents')
                            .replace(' & MuleSoft', '')}
                        </button>
                      ))}
                  </div>
                  {activeFilterCount > 0 && (
                    <div className="results-line">
                      <div>
                        {activeFilterCount > 0 ? (
                          <button
                            className="clear-filters"
                            onClick={() =>
                              setFilters({
                                ...defaults,
                                view: filters.view,
                                q: filters.q,
                                market: filters.market,
                              })
                            }
                          >
                            <X size={12} />
                            Clear {activeFilterCount} filters
                          </button>
                        ) : (
                          <span>
                            <span className="mini-status" />
                            {filtered.length} {filtered.length === 1 ? 'signal' : 'signals'} in view
                          </span>
                        )}
                      </div>
                      <span>{filtered.length} matching signals</span>
                    </div>
                  )}
                  {loading && !data ? (
                    <div className="loading-feed" aria-label="Loading opportunities">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="skeleton signal-skeleton" />
                      ))}
                    </div>
                  ) : (
                    <div className="signal-list">
                      {filtered.slice((page - 1) * 15, page * 15).map((signal, index) => (
                        <SignalCard
                          key={signal.id}
                          signal={signal}
                          data={data!}
                          index={index}
                          saved={saved.includes(signal.id)}
                          compared={compare.includes(signal.id)}
                          onSave={() => toggleSave(signal.id)}
                          onOpen={(tab) => open(signal.id, tab)}
                          onCompare={() =>
                            setCompare((ids) =>
                              ids.includes(signal.id)
                                ? ids.filter((id) => id !== signal.id)
                                : ids.length < 3
                                  ? [...ids, signal.id]
                                  : (setToast('Compare up to three opportunities'), ids),
                            )
                          }
                          now={time}
                        />
                      ))}
                    </div>
                  )}
                  {!loading && filtered.length === 0 && (
                    <div className="empty-state">
                      {marketEnabled ? <FileSearch size={32} /> : <Globe2 size={32} />}
                      <h3>
                        {!marketEnabled
                          ? `No signals for ${marketName}`
                          : filters.view === 'saved'
                            ? 'A place for your next move'
                            : 'No matching signals'}
                      </h3>
                      <p>
                        {!marketEnabled
                          ? 'There are no monitored sources in this market yet.'
                          : filters.view === 'saved'
                            ? 'Your saved opportunities will appear here.'
                            : 'Try a broader search or adjust your filters.'}
                      </p>
                      <button
                        className="button secondary"
                        onClick={() =>
                          !marketEnabled
                            ? switchMarket('GB')
                            : setFilters({ ...defaults, market: filters.market })
                        }
                      >
                        {marketEnabled ? 'Explore top signals' : 'Explore United Kingdom'}{' '}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                  {filtered.length > 15 && (
                    <div className="pagination">
                      <span>
                        {(page - 1) * 15 + 1}–{Math.min(page * 15, filtered.length)} of{' '}
                        {filtered.length}
                      </span>
                      <div>
                        <IconButton
                          label="Previous page"
                          disabled={page === 1}
                          onClick={() => {
                            setPage((p) => p - 1)
                            window.scrollTo({ top: 300, behavior: 'smooth' })
                          }}
                        >
                          <ChevronLeft size={17} />
                        </IconButton>
                        <span>
                          Page {page} of {Math.ceil(filtered.length / 15)}
                        </span>
                        <IconButton
                          label="Next page"
                          disabled={page * 15 >= filtered.length}
                          onClick={() => {
                            setPage((p) => p + 1)
                            window.scrollTo({ top: 300, behavior: 'smooth' })
                          }}
                        >
                          <ChevronRight size={17} />
                        </IconButton>
                      </div>
                    </div>
                  )}
                </section>
                <aside className="insights-rail" aria-label="Market insights">
                  <section className="radar-section">
                    <div className="rail-heading">
                      <span className="rail-icon">
                        <Radar size={17} />
                      </span>
                      <h2>Upcoming deadlines</h2>
                    </div>
                    <p className="radar-label">
                      Next 14 days <span>{closing.length} opportunities</span>
                    </p>
                    <div className="deadline-list">
                      {closing.slice(0, 3).map((s) => (
                        <button key={s.id} onClick={() => open(s.id)}>
                          <span className="deadline-date">
                            <strong>{date(s.deadline_at, { day: '2-digit' })}</strong>
                            <small>{date(s.deadline_at, { month: 'short' })}</small>
                          </span>
                          <span className="deadline-info">
                            <strong>{s.title}</strong>
                            <small>{s.buyer_name}</small>
                          </span>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                      {closing.length === 0 && (
                        <p className="rail-empty">No upcoming deadlines in this market.</p>
                      )}
                    </div>
                    <button
                      className="rail-link"
                      onClick={() => update({ view: 'live', deadline: '14', sort: 'deadline' })}
                    >
                      View upcoming deadlines <ArrowRight size={14} />
                    </button>
                  </section>
                  <section className="activity-section">
                    <div className="rail-heading">
                      <Activity size={16} />
                      <h2>Market activity</h2>
                      <span className="micro-label">7 DAYS</span>
                    </div>
                    <ActivityChart signals={marketSignals} now={time} />
                    <div className="activity-legend">
                      <span>
                        <i className="mint-dot" />
                        Published signals
                      </span>
                      <span>Last 7 days</span>
                    </div>
                  </section>
                  <section className="coverage-section">
                    <div className="rail-heading">
                      <Globe2 size={16} />
                      <h2>Connected sources</h2>
                      <span className="count-badge">{marketSources.length}</span>
                    </div>
                    <div className="coverage-list">
                      {marketSources.slice(0, 7).map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            update({ source: s.id, view: 'all' })
                          }}
                        >
                          <span className="source-monogram">
                            {s.name === 'Find a Tender'
                              ? 'FT'
                              : s.name === 'Contracts Finder'
                                ? 'CF'
                                : s.name === 'GOV.UK'
                                  ? 'UK'
                                  : s.name
                                      .split(' ')
                                      .map((w) => w[0])
                                      .slice(0, 2)
                                      .join('')}
                          </span>
                          <span>{s.name}</span>
                          <span
                            title={
                              s.status === 'healthy'
                                ? 'Last collection successful'
                                : 'Collection needs attention'
                            }
                            className={`status-dot ${s.status === 'healthy' ? '' : 'amber'}`}
                          />
                        </button>
                      ))}
                    </div>
                    <button className="rail-link" onClick={() => navigate('sources')}>
                      Source coverage & freshness <ArrowRight size={14} />
                    </button>
                  </section>
                </aside>
              </div>
            )}
            <footer className="page-footer">
              <span>ANTHRION SIGNAL</span>
              <span>Public intelligence. Informed decisions.</span>
              <button onClick={() => navigate('sources')}>
                Sources & attribution <ArrowUpRight size={12} />
              </button>
            </footer>
          </div>
        </main>
        <AnimatePresence>
          {compare.length > 0 && (
            <motion.div
              className="compare-tray"
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
            >
              <Layers3 size={17} />
              <span>{compare.length} selected</span>
              <button
                className="button primary"
                disabled={compare.length < 2}
                onClick={() => setShowCompare(true)}
              >
                Compare <ArrowRight size={14} />
              </button>
              <IconButton label="Clear comparison" onClick={() => setCompare([])}>
                <X size={16} />
              </IconButton>
            </motion.div>
          )}
        </AnimatePresence>
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
              onReset={() =>
                setFilters({ ...defaults, view: filters.view, market: filters.market })
              }
            />
          </Modal>
        )}
        {showMarkets && (
          <Modal title="Choose your market" onClose={() => setShowMarkets(false)}>
            <MarketPicker data={data} selected={filters.market} onSelect={switchMarket} />
          </Modal>
        )}
        {selectedSignal && data && (
          <Modal title="Opportunity intelligence" onClose={() => setSelected(null)} wide drawer>
            <SignalDetail
              signal={selectedSignal}
              data={data}
              tab={detailTab}
              setTab={setDetailTab}
              saved={saved.includes(selectedSignal.id)}
              onSave={() => toggleSave(selectedSignal.id)}
              onShare={() => void share()}
            />
          </Modal>
        )}
        {selected && data && !selectedSignal && (
          <Modal title="Opportunity unavailable" onClose={() => setSelected(null)}>
            <div className="empty-state">
              <FileSearch size={30} />
              <h3>This signal is no longer in the current feed</h3>
              <p>It may have moved into the historical archive.</p>
              <button className="button primary" onClick={() => setSelected(null)}>
                Back to opportunities
              </button>
            </div>
          </Modal>
        )}
        {showSaveView && (
          <Modal title="Save this view" onClose={() => setShowSaveView(false)}>
            <form
              className="save-view-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (viewName.trim()) {
                  setViews((v) =>
                    [
                      ...v.filter((x) => x.name !== viewName.trim()),
                      { name: viewName.trim().slice(0, 60), filters },
                    ].slice(-12),
                  )
                  setShowSaveView(false)
                  setToast('View saved in this browser')
                }
              }}
            >
              <label>
                View name
                <input
                  autoFocus
                  data-autofocus
                  required
                  maxLength={60}
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                />
              </label>
              <button className="button primary" type="submit">
                <Bookmark size={15} />
                Save view
              </button>
            </form>
          </Modal>
        )}
        {showCompare && data && (
          <Modal title="Compare opportunities" onClose={() => setShowCompare(false)} wide>
            <div
              className="comparison-grid"
              style={{ gridTemplateColumns: `repeat(${compare.length}, minmax(0, 1fr))` }}
            >
              {compare
                .map((id) => data.signals.find((s) => s.id === id))
                .filter((s): s is Signal => !!s)
                .map((s) => (
                  <section key={s.id}>
                    <ScoreBadge signal={s} />
                    <h3>{s.title}</h3>
                    <p>{s.buyer_name}</p>
                    <dl>
                      <dt>Evidence confidence</dt>
                      <dd>{Math.round(s.confidence_score)}%</dd>
                      <dt>Published value</dt>
                      <dd>{amount(s.value_max, s.currency, false)}</dd>
                      <dt>Deadline</dt>
                      <dd>{date(s.deadline_at)}</dd>
                      <dt>Recommendation</dt>
                      <dd>{recommendationLabels[s.recommendation]}</dd>
                      <dt>Capability matches</dt>
                      <dd>
                        {s.matched_capabilities
                          .map((id) => data.capabilities.find((c) => c.id === id)?.label)
                          .join(', ') || 'Awaiting analysis'}
                      </dd>
                      <dt>Information gaps</dt>
                      <dd>{s.analysis?.information_gaps.join(' ') || 'Analysis pending'}</dd>
                    </dl>
                    <OutLink href={s.primary_source_url} className="button secondary">
                      Source <ArrowUpRight size={14} />
                    </OutLink>
                  </section>
                ))}
            </div>
          </Modal>
        )}
      </div>
    </MotionConfig>
  )
}

function MarketPicker({
  data,
  selected,
  onSelect,
}: {
  data: Dataset | null
  selected: string
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const choices = [
    { id: '', name: 'All markets', short: 'ALL', region: 'Global' },
    ...markets,
  ].filter((m) => `${m.name} ${m.region}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="market-picker">
      <label className="search-box market-search">
        <Search size={18} />
        <input
          autoFocus
          data-autofocus
          aria-label="Search markets"
          placeholder="Search markets..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="market-options" role="group" aria-label="Available markets">
        {choices.map((m) => {
          const enabled = data ? marketIsEnabled(m.id, data.markets) : m.id === 'GB' || !m.id
          const count = data?.signals.filter((s) => matchesMarket(s, m.id)).length || 0
          return (
            <button
              key={m.id}
              className={`market-option ${selected === m.id ? 'selected' : ''}`}
              onClick={() => onSelect(m.id)}
              aria-pressed={selected === m.id}
            >
              <span className={`market-symbol market-${m.id.toLowerCase() || 'all'}`}>
                {m.id === 'NORDICS' || !m.id ? (
                  <Globe2 size={23} />
                ) : (
                  <img
                    src={`${import.meta.env.BASE_URL}assets/flags/${m.id.toLowerCase()}.png`}
                    alt=""
                  />
                )}
              </span>
              <span className="market-option-name">
                <strong>{m.name}</strong>
                <small>{m.region}</small>
              </span>
              <span className={`market-availability ${enabled ? 'enabled' : ''}`}>
                <span className={`status-dot ${enabled ? '' : 'inactive'}`} />
                {enabled ? `${count} signals` : 'Not monitored'}
              </span>
              <Check size={18} className="market-check" aria-hidden="true" />
            </button>
          )
        })}
        {!choices.length && <p className="market-no-results">No markets match your search.</p>}
      </div>
    </div>
  )
}

function ScoreBadge({ signal, onClick }: { signal: Signal; onClick?: () => void }) {
  const score = signal.fit_score
  const content = (
    <>
      <strong style={{ '--score': `${score || 0}%` } as React.CSSProperties}>
        {score === null ? <Clock3 size={24} strokeWidth={1.4} /> : Math.round(score)}
      </strong>
      <span>{score === null ? 'Pending' : 'Fit score'}</span>
    </>
  )
  const cls = `score-badge ${score === null ? 'pending' : score >= 82 ? 'strong' : score >= 72 ? 'plausible' : 'peripheral'}`
  return onClick ? (
    <button
      className={cls}
      onClick={onClick}
      title={score === null ? 'Evidence analysis pending' : 'Inspect score and supporting evidence'}
    >
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  )
}
function SignalCard({
  signal: s,
  data,
  saved,
  compared,
  onSave,
  onOpen,
  onCompare,
  index,
  now,
}: {
  signal: Signal
  data: Dataset
  saved: boolean
  compared: boolean
  onSave: () => void
  onOpen: (tab?: string) => void
  onCompare: () => void
  index: number
  now: number
}) {
  const days = daysLeft(s, now)
  const tags = s.matched_capabilities
    .slice(0, 3)
    .map((id) => data.capabilities.find((c) => c.id === id)?.label)
    .filter(Boolean)
  const sources = [...new Set(s.provenance.map((p) => p.source_name))]
  return (
    <motion.article
      className={`signal-card ${compared ? 'compared' : ''} ${(s.fit_score || 0) >= 82 ? 'is-priority' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.035, 0.2) }}
    >
      <div className="signal-top">
        <ScoreBadge signal={s} onClick={() => onOpen('score')} />
        <div className="signal-main">
          <div className="signal-meta">
            <span className={`type-label ${s.procurement_stage === 'planning' ? 'early' : ''}`}>
              {typeLabels[s.signal_type]}
            </span>
            <span className="meta-dot">·</span>
            <span className={`recommendation ${s.recommendation.toLowerCase()}`}>
              {recommendationLabels[s.recommendation]}
            </span>
            {isNew(s, now) && <span className="new-label">New</span>}
            {isUpdated(s, now) && <span className="new-label updated">Updated</span>}
          </div>
          <button className="signal-title" onClick={() => onOpen()}>
            <h3>{s.title}</h3>
            <ArrowUpRight size={17} />
          </button>
          <div className="buyer">
            <Building2 size={12} />
            <span>{s.buyer_name || 'Buyer not published'}</span>
          </div>
        </div>
        <IconButton
          className={saved ? 'is-saved' : ''}
          label={saved ? 'Unsave opportunity' : 'Save opportunity in this browser'}
          onClick={onSave}
        >
          {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
        </IconButton>
      </div>
      <p className="signal-summary">
        {s.analysis?.summary ||
          s.description ||
          'Open the primary notice for full procurement details.'}
      </p>
      <div className="signal-facts">
        <span>
          <FileText size={14} />
          {amount(s.value_max, s.currency)}
        </span>
        <span className={days !== null && days >= 0 && days <= 7 ? 'closing' : ''}>
          <CalendarClock size={13} />
          {deadlineCaption(s, now)}
        </span>
        <span className="confidence">
          <span className="confidence-bars">
            {[1, 2, 3, 4].map((i) => (
              <i key={i} className={s.confidence_score >= i * 20 ? 'filled' : ''} />
            ))}
          </span>
          {Math.round(s.confidence_score)}% confidence
        </span>
      </div>
      <div className="signal-bottom">
        <div className="capability-tags">
          {tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="signal-source" title={sources.join(', ')}>
          {sources[0] || s.source}
          {sources.length > 1 && <small>+{sources.length - 1}</small>}
        </div>
        <label className="compare-control" title="Compare opportunity">
          <input
            type="checkbox"
            checked={compared}
            onChange={onCompare}
            aria-label={`Compare ${s.title}`}
          />
          <span>Compare</span>
        </label>
      </div>
    </motion.article>
  )
}

function ActivityChart({ signals, now }: { signals: Signal[]; now: number }) {
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * 86400000)
    const day = d.toISOString().slice(0, 10)
    return {
      label: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(d),
      value: signals.filter((s) => (s.published_at || '').slice(0, 10) === day).length,
      day,
    }
  })
  const max = Math.max(...buckets.map((b) => b.value), 1)
  return (
    <div
      className="activity-chart"
      role="img"
      aria-label={`Signals published in the last seven days: ${buckets.map((b) => `${b.label} ${b.value}`).join(', ')}`}
    >
      <div className="chart-guide">
        <span>{max}</span>
        <span>0</span>
      </div>
      <div className="bars">
        {buckets.map((b, i) => (
          <div
            className={`bar-column ${i === 6 ? 'today' : ''}`}
            key={b.day}
            title={`${b.day}: ${b.value} published signals`}
          >
            <span
              className="bar"
              style={{ height: `${Math.max(b.value ? 4 : 0, (b.value / max) * 82)}px` }}
            />
            <small>{b.label}</small>
          </div>
        ))}
      </div>
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
      <select value={f[key]} onChange={(e) => update({ [key]: e.target.value })}>
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
        <label>
          Minimum fit score <span>{f.score || 'Any'}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={f.score || 0}
            onChange={(e) => update({ score: e.target.value === '0' ? '' : e.target.value })}
          />
        </label>
        <label>
          Minimum confidence <span>{f.confidence ? `${f.confidence}%` : 'Any'}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={f.confidence || 0}
            onChange={(e) => update({ confidence: e.target.value === '0' ? '' : e.target.value })}
          />
        </label>
        {select(
          'Recommendation',
          'recommendation',
          Object.entries(recommendationLabels).map(([value, label]) => ({ value, label })),
        )}
        {select(
          'Opportunity type',
          'type',
          Object.entries(typeLabels).map(([value, label]) => ({ value, label })),
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
          Minimum value (GBP)
          <input
            type="number"
            min="0"
            value={f.minValue}
            placeholder="No minimum"
            onChange={(e) => update({ minValue: e.target.value })}
          />
        </label>
        <label>
          Maximum value (GBP)
          <input
            type="number"
            min="0"
            value={f.maxValue}
            placeholder="No maximum"
            onChange={(e) => update({ maxValue: e.target.value })}
          />
        </label>
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

function ProfileEvidence({ ids, data }: { ids: string[]; data: Dataset }) {
  return (
    <>
      {[...new Set(ids)].map((id) => {
        const e = data.evidence_catalog[id]
        return e ? (
          <div className="profile-evidence" key={id}>
            <ShieldCheck size={14} />
            <div>
              <strong>{e.label}</strong>
              <p>{e.quote}</p>
              <small>
                Company profile{e.page ? ` · p. ${e.page}` : ''}
                {e.section ? ` · §${e.section}` : ''}
              </small>
            </div>
          </div>
        ) : null
      })}
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
}: {
  signal: Signal
  data: Dataset
  tab: string
  setTab: (tab: string) => void
  saved: boolean
  onSave: () => void
  onShare: () => void
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [tab, s.id])
  return (
    <>
      <div className="detail-heading" tabIndex={0} role="region" aria-label="Opportunity heading">
        <div className="detail-eyebrow">
          <span className="type-label">{typeLabels[s.signal_type]}</span>
          <span className={`recommendation ${s.recommendation.toLowerCase()}`}>
            {recommendationLabels[s.recommendation]}
          </span>
        </div>
        <h2>{s.title}</h2>
        <div className="buyer">
          <Building2 size={14} />
          {s.buyer_name || 'Buyer not published'}
        </div>
        <div className="detail-actions">
          <OutLink href={s.primary_source_url} className="button primary">
            Open source notice <ArrowUpRight size={15} />
          </OutLink>
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
        {['overview', 'score', 'requirements', 'sources'].map((t) => (
          <button
            role="tab"
            id={`detail-tab-${t}`}
            aria-controls="detail-panel"
            aria-selected={tab === t}
            tabIndex={tab === t ? 0 : -1}
            key={t}
            onClick={() => setTab(t)}
            onKeyDown={(event) => {
              const names = ['overview', 'score', 'requirements', 'sources']
              const current = names.indexOf(t)
              const index =
                event.key === 'ArrowRight'
                  ? (current + 1) % names.length
                  : event.key === 'ArrowLeft'
                    ? (current + names.length - 1) % names.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? names.length - 1
                        : -1
              if (index < 0) return
              event.preventDefault()
              setTab(names[index])
              document.getElementById(`detail-tab-${names[index]}`)?.focus()
            }}
          >
            {
              {
                overview: 'Overview',
                score: 'Score & evidence',
                requirements: 'Requirements',
                sources: 'Sources & timeline',
              }[t]
            }
          </button>
        ))}
      </div>
      <div
        ref={contentRef}
        className="detail-content"
        role="tabpanel"
        id="detail-panel"
        aria-labelledby={`detail-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'overview' && (
          <>
            <section className="detail-section">
              <div className="section-title">
                <h3>{s.analysis ? 'Opportunity assessment' : 'Opportunity scope'}</h3>
                <span className="analysis-label">
                  {s.analysis ? (
                    <>
                      <Sparkles size={12} />
                      AI analysis
                    </>
                  ) : (
                    <>
                      <FileText size={12} />
                      Source facts
                    </>
                  )}
                </span>
              </div>
              <p className="detail-summary">{s.analysis?.summary || s.description}</p>
              {s.renewal_basis && (
                <p className="notice-box">
                  <Clock3 size={17} />
                  {s.renewal_basis}
                </p>
              )}
            </section>
            <section className="detail-section">
              <div className="section-title">
                <h3>Commercial & procurement facts</h3>
                <span className="analysis-label">
                  <FileText size={12} />
                  Source facts
                </span>
              </div>
              <dl className="facts-grid">
                <div>
                  <dt>Published value</dt>
                  <dd>
                    {amount(s.value_max, s.currency, false)}
                    {s.value_min !== null && (
                      <small>From {amount(s.value_min, s.currency, false)}</small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Closing date</dt>
                  <dd>{date(s.deadline_at)}</dd>
                </div>
                <div>
                  <dt>Contract period</dt>
                  <dd>
                    {s.contract_start || s.contract_end
                      ? `${date(s.contract_start)} – ${date(s.contract_end)}`
                      : 'Not published'}
                  </dd>
                </div>
                <div>
                  <dt>Framework</dt>
                  <dd>{s.framework || 'Not specified'}</dd>
                </div>
                <div>
                  <dt>Region</dt>
                  <dd>{s.regions.join(', ') || s.countries.join(', ') || 'Not specified'}</dd>
                </div>
                <div>
                  <dt>Incumbent supplier</dt>
                  <dd>{s.incumbent_supplier || 'Not published'}</dd>
                </div>
                {s.lot_ids.length > 0 && (
                  <div>
                    <dt>Procurement lots</dt>
                    <dd>{s.lot_ids.join(', ')}</dd>
                  </div>
                )}
                <div>
                  <dt>CPV classifications</dt>
                  <dd>{s.cpv_codes.join(', ') || 'Not published'}</dd>
                </div>
              </dl>
            </section>
            <section className="detail-section">
              <div className="section-title">
                <h3>Why it surfaced</h3>
                <span className="analysis-label">
                  {s.analysis ? 'Evidence matched' : 'Source indicators'}
                </span>
              </div>
              <div className="capability-tags large">
                {(s.analysis
                  ? s.matched_capabilities.map(
                      (id) => data.capabilities.find((c) => c.id === id)?.label,
                    )
                  : s.prefilter_matches
                )
                  .slice(0, 10)
                  .map((t) => (
                    <span key={t}>{t}</span>
                  ))}
              </div>
            </section>
            {s.analysis && (
              <section className="detail-section">
                <div className="section-title">
                  <h3>Consider before proceeding</h3>
                  <span className="analysis-label">
                    <Sparkles size={12} />
                    AI analysis
                  </span>
                </div>
                {s.analysis.hard_blockers.map((r, i) => (
                  <div className="risk blocker" key={i}>
                    <ShieldCheck size={16} />
                    <div>
                      <strong>Eligibility blocker</strong>
                      <p>{r.text}</p>
                      <blockquote>{r.evidence.quote}</blockquote>
                    </div>
                  </div>
                ))}
                {s.analysis.risks.map((r, i) => (
                  <div className="risk" key={i}>
                    <Flag size={15} />
                    <div>
                      <strong>{r.kind.replaceAll('_', ' ')}</strong>
                      <p>{r.text}</p>
                      <blockquote>{r.evidence.quote}</blockquote>
                    </div>
                  </div>
                ))}
                {s.analysis.information_gaps.length > 0 && (
                  <div className="information-gaps">
                    <h4>Information to confirm</h4>
                    <ul>
                      {s.analysis.information_gaps.map((g) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {!s.analysis.risks.length && !s.analysis.information_gaps.length && (
                  <p className="muted">
                    No specific risks were identified in the available notice text.
                  </p>
                )}
              </section>
            )}
          </>
        )}
        {tab === 'score' && (
          <>
            <div className="score-overview">
              <ScoreBadge signal={s} />
              <div>
                <strong>{Math.round(s.confidence_score)}% evidence confidence</strong>
                <p>{s.score_explanation}</p>
              </div>
              <CircleHelp size={18} />
            </div>
            {!s.analysis && (
              <div className="notice-box">
                <Clock3 size={18} />
                <span>
                  Evidence analysis is pending. The source notice remains available for assessment.
                </span>
              </div>
            )}
            <div className="score-table">
              {s.score_components.map((c) => (
                <details key={c.id}>
                  <summary>
                    <span>{c.label}</span>
                    <span className="score-track">
                      <i style={{ width: `${((c.points || 0) / c.max_points) * 100}%` }} />
                    </span>
                    <strong>
                      {c.points === null ? 'Unknown' : Number(c.points.toFixed(1))}
                      <small> / {c.max_points}</small>
                    </strong>
                    <ChevronDown size={14} />
                  </summary>
                  <div className="score-evidence">
                    <p>{c.explanation}</p>
                    {c.evidence.slice(0, 4).map((e, i) => (
                      <blockquote key={i}>
                        {e.quote}
                        <OutLink href={e.source_url}>
                          Source <ExternalLink size={11} />
                        </OutLink>
                      </blockquote>
                    ))}
                    <ProfileEvidence ids={c.company_evidence_ids} data={data} />
                  </div>
                </details>
              ))}
            </div>
            <div className="score-totals">
              <span>
                Known scoring weight<strong>{Number(s.known_weight.toFixed(1))} / 100</strong>
              </span>
              <span>
                Normalised fit
                <strong>
                  {s.fit_score === null ? 'Pending' : `${Math.round(s.fit_score)} / 100`}
                </strong>
              </span>
            </div>
            <p className="method-note">
              Unknown dimensions are excluded from the fit calculation. Confidence combines rubric
              coverage (70%), source quality (20%), and evidence completeness (10%).
            </p>
          </>
        )}
        {tab === 'requirements' && (
          <>
            <div className="section-title">
              <h3>Requirement-to-capability mapping</h3>
              <span className="analysis-label">
                <Sparkles size={12} />
                AI analysis
              </span>
            </div>
            {s.analysis?.requirements.length ? (
              s.analysis.requirements.map((r, i) => (
                <section className="requirement" key={i}>
                  <div className="requirement-head">
                    <span className="requirement-number">{String(i + 1).padStart(2, '0')}</span>
                    <span className={`match-level ${r.match_level.toLowerCase()}`}>
                      {r.match_level.replaceAll('_', ' ')}
                    </span>
                    <small>Importance {r.importance}/5</small>
                  </div>
                  <h4>{r.text}</h4>
                  <blockquote>
                    {r.evidence.quote}
                    <OutLink href={r.evidence.source_url}>
                      Source <ExternalLink size={11} />
                    </OutLink>
                  </blockquote>
                  <p>{r.explanation}</p>
                  <ProfileEvidence ids={r.company_evidence_ids} data={data} />
                </section>
              ))
            ) : (
              <div className="empty-state">
                <FileSearch size={28} />
                <h3>Requirements analysis pending</h3>
                <p>Review the official notice for the full requirements.</p>
                <OutLink href={s.primary_source_url} className="button secondary">
                  Open source <ArrowUpRight size={14} />
                </OutLink>
              </div>
            )}
          </>
        )}
        {tab === 'sources' && (
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
                      {c.fields.length > 0 && (
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
                <div>
                  <dt>Evidence analysed</dt>
                  <dd>
                    {date(s.ai_scored_at)}
                    {s.ai_model && <small>{s.ai_model}</small>}
                  </dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </div>
    </>
  )
}

function SourceCoverage({ data, now }: { data: Dataset; now: number }) {
  const enabled = data.sources.filter((s) => s.enabled)
  return (
    <section className="source-page">
      <div className="feed-heading">
        <div>
          <h2>Source coverage</h2>
          <span className="count-badge">{enabled.length} monitored</span>
        </div>
        <span className="updated-text">
          Last run{' '}
          {date(data.generated_at, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      {enabled.length ? (
        <div className="source-table">
          <div className="source-table-header">
            <span>PUBLIC SOURCE</span>
            <span>COLLECTION STATUS</span>
            <span>LAST SUCCESS</span>
            <span>RECORDS CHECKED</span>
          </div>
          {enabled.map((s) => {
            const fresh =
              s.status === 'healthy' &&
              s.last_success &&
              now - Date.parse(s.last_success) < 26 * 3600000
            const label =
              s.status === 'healthy' && !fresh
                ? 'Update overdue'
                : {
                    healthy: 'Up to date',
                    partial: 'Partial collection',
                    failed: 'Temporarily unavailable',
                    not_checked: 'Awaiting first collection',
                    disabled: 'Not monitored',
                  }[s.status]
            return (
              <div className="source-row" key={s.id}>
                <OutLink href={s.website}>
                  <Globe2 size={17} />
                  <span>{s.name}</span>
                  <ArrowUpRight size={13} />
                </OutLink>
                <span>
                  <i className={`status-dot ${fresh ? '' : 'amber'}`} />
                  {label}
                  {s.status === 'partial' && (
                    <small>Some notices or details are not yet available.</small>
                  )}
                  {s.status === 'failed' && (
                    <small>Previously collected opportunities remain available.</small>
                  )}
                </span>
                <span>
                  {s.last_success
                    ? date(s.last_success, {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Not yet collected'}
                </span>
                <strong>{s.records.toLocaleString('en-GB')}</strong>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Globe2 size={30} />
          <h3>No sources monitored in this market</h3>
          <p>Choose United Kingdom to see the current source coverage.</p>
        </div>
      )}
      {enabled.length > 0 && (
        <div className="source-method">
          <section>
            <CalendarClock size={22} />
            <h3>Refresh schedule</h3>
            <p>
              06:15, 10:15, 14:15, 18:15 and 22:15, London time. Publication times depend on source
              availability.
            </p>
          </section>
          <section>
            <FileText size={22} />
            <h3>Public data attribution</h3>
            <p>
              Contains public sector information licensed under the{' '}
              <OutLink href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">
                Open Government Licence v3.0
              </OutLink>
              .
            </p>
          </section>
        </div>
      )}
    </section>
  )
}
