import type { Dataset, Filters, Signal } from './types'

export const defaults: Filters = {
  q: '',
  view: 'live',
  sort: 'recent',
  market: 'GB',
  score: '',
  confidence: '',
  source: '',
  type: '',
  recommendation: '',
  capability: '',
  sector: '',
  buyer: '',
  region: '',
  cpv: '',
  minValue: '',
  maxValue: '',
  currency: '',
  deadline: '',
  change: '',
}
export const markets = [
  { id: 'GB', name: 'United Kingdom', short: 'UK', countries: ['GB'], region: 'Europe' },
  { id: 'US', name: 'United States', short: 'US', countries: ['US'], region: 'North America' },
  { id: 'IT', name: 'Italy', short: 'IT', countries: ['IT'], region: 'Europe' },
  {
    id: 'NORDICS',
    name: 'Nordics',
    short: 'NO',
    countries: ['SE', 'FI', 'DK', 'NO', 'IS'],
    region: 'Northern Europe',
  },
  { id: 'DE', name: 'Germany', short: 'DE', countries: ['DE'], region: 'Europe' },
  { id: 'ES', name: 'Spain', short: 'ES', countries: ['ES'], region: 'Europe' },
  { id: 'GR', name: 'Greece', short: 'GR', countries: ['GR'], region: 'Europe' },
] as const

export function matchesMarket(signal: Signal, market: string) {
  if (!market) return true
  const countries: readonly string[] = markets.find((m) => m.id === market)?.countries || [market]
  return signal.countries.some((country) => countries.includes(country))
}

export function marketIsEnabled(market: string, configured: Record<string, { enabled: boolean }>) {
  if (!market) return Object.values(configured).some((m) => m.enabled)
  const countries: readonly string[] = markets.find((m) => m.id === market)?.countries || [market]
  return countries.some((country) => configured[country]?.enabled)
}
export const typeLabels: Record<string, string> = {
  LIVE_TENDER: 'Live tender',
  EARLY_MARKET_ENGAGEMENT: 'Early engagement',
  PIPELINE: 'Pipeline',
  FUTURE_OPPORTUNITY: 'Future opportunity',
  FRAMEWORK: 'Framework',
  RFI: 'Request for information',
  RFP: 'Request for proposal',
  RENEWAL_SIGNAL: 'Renewal signal',
  AWARD: 'Contract award',
  STRATEGIC_INTENT: 'Strategic intent',
  FUNDING: 'Funding',
  PARTNERSHIP: 'Partnership',
}
export const recommendationLabels: Record<string, string> = {
  PURSUE: 'Pursue',
  ENGAGE_NOW: 'Engage now',
  WATCH: 'Watch',
  PARTNER: 'Partner',
  FUNDING: 'Explore funding',
  REVIEW: 'Review',
  LOW_PRIORITY: 'Low priority',
}
export const date = (value: string | null, options?: Intl.DateTimeFormatOptions) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(
        'en-GB',
        options || { day: 'numeric', month: 'short', year: 'numeric' },
      ).format(new Date(value))
    : 'Not published'
export const amount = (value: number | null, currency: string | null, compact = true) => {
  if (value === null) return 'Value not published'
  if (!currency) return `${value.toLocaleString('en-GB')} (currency not published)`
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'GBP',
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 0,
    }).format(value)
  } catch {
    return `${value.toLocaleString('en-GB')} ${currency || ''}`
  }
}
export function valueCurrency(filters: Pick<Filters, 'market' | 'currency'>) {
  return /^[A-Z]{3}$/.test(filters.currency || '')
    ? filters.currency
    : filters.market === 'US'
      ? 'USD'
      : filters.market && filters.market !== 'GB'
        ? 'EUR'
        : 'GBP'
}
export const daysLeft = (s: Signal, now = Date.now()) =>
  s.deadline_at ? Math.ceil((Date.parse(s.deadline_at) - now) / 86400000) : null
export function deadlineCaption(s: Signal, now = Date.now()) {
  if (!s.deadline_at)
    return s.procurement_stage === 'planning' ? 'Early-stage opportunity' : 'Deadline not published'
  const remaining = Date.parse(s.deadline_at) - now
  const label = date(s.deadline_at, { day: 'numeric', month: 'short' })
  if (remaining <= 0) return `Closed ${label}`
  if (remaining < 3600000) return `${label} · ${Math.ceil(remaining / 60000)}m left`
  if (remaining < 86400000) return `${label} · ${Math.ceil(remaining / 3600000)}h left`
  return `${label}${remaining <= 14 * 86400000 ? ` · ${Math.ceil(remaining / 86400000)}d left` : ''}`
}
export function lifecycleState(s: Signal, now = Date.now()) {
  if (['cancelled', 'canceled', 'unsuccessful'].includes(s.status)) return 'CANCELLED'
  if (s.status === 'withdrawn') return 'WITHDRAWN'
  if (s.signal_type === 'AWARD' || s.status === 'awarded') return 'AWARDED'
  if (['closed', 'complete', 'completed', 'terminated'].includes(s.status)) return 'CLOSED'
  if (s.status === 'postponed') return 'UNKNOWN'
  if (s.status === 'expired' || (s.deadline_at && Date.parse(s.deadline_at) <= now))
    return 'EXPIRED'
  if (s.signal_type === 'RENEWAL_SIGNAL') return 'FUTURE'
  if (['EARLY_MARKET_ENGAGEMENT', 'RFI'].includes(s.signal_type)) {
    return s.deadline_at ||
      s.status === 'active' ||
      now - Date.parse(s.last_material_update || s.published_at || '') <= 90 * 86400000
      ? 'EARLY_ENGAGEMENT'
      : 'UNKNOWN'
  }
  if (
    ['PIPELINE', 'FUTURE_OPPORTUNITY', 'STRATEGIC_INTENT'].includes(s.signal_type) ||
    s.procurement_stage === 'planning'
  )
    return 'FUTURE'
  if (['active', 'open'].includes(s.status) || s.deadline_at) return 'OPEN'
  return 'UNKNOWN'
}
export const lifecycleLabels: Record<string, string> = {
  OPEN: 'Open',
  EARLY_ENGAGEMENT: 'Early engagement',
  FUTURE: 'Future',
  AWARDED: 'Awarded',
  CLOSED: 'Closed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  WITHDRAWN: 'Withdrawn',
  UNKNOWN: 'Status to confirm',
}
export function isAwardIntelligence(s: Signal) {
  return (
    s.signal_type === 'AWARD' ||
    s.status.toLowerCase() === 'awarded' ||
    s.lifecycle_state === 'AWARDED' ||
    (s.signal_type === 'RENEWAL_SIGNAL' &&
      !!(s.related_signal_id || s.status === 'inferred' || s.renewal_basis))
  )
}
export function isAvailableOpportunity(s: Signal, now = Date.now()) {
  return (
    !isAwardIntelligence(s) &&
    s.status !== 'postponed' &&
    !['AWARDED', 'CLOSED', 'EXPIRED', 'CANCELLED', 'WITHDRAWN'].includes(lifecycleState(s, now)) &&
    !s.exclusion_reasons?.length &&
    !s.analysis?.eligibility_checks?.some((check) => check.status === 'CONFIRMED_BLOCKER')
  )
}
export const isLive = (s: Signal, now = Date.now()) =>
  !s.exclusion_reasons?.length && lifecycleState(s, now) === 'OPEN'
export const isEarly = (s: Signal, now = Date.now()) =>
  !s.exclusion_reasons?.length && lifecycleState(s, now) === 'EARLY_ENGAGEMENT'

export function searchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function matchesSearch(
  s: Signal,
  query: string,
  capabilities: Dataset['capabilities'] = [],
) {
  const q = searchText(query)
  if (!q) return true
  const text = searchText(
    [s.title, s.description, s.buyer_name, s.ocid, ...(s.external_ids || [])]
      .filter(Boolean)
      .join(' '),
  )
  const words = new Set(text.split(' '))
  if (q.split(' ').every((word) => (word.length <= 3 ? words.has(word) : text.includes(word))))
    return true
  const matched = new Set([...(s.discovery_families || []), ...s.matched_capabilities])
  return capabilities.some(
    (c) =>
      matched.has(c.id) &&
      [c.id, c.label, ...(c.search_terms || [])].some((term) => searchText(term) === q),
  )
}
export const isNew = (s: Signal, now = Date.now()) => now - Date.parse(s.first_seen_at) < 86400000
const collectionDay = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
export function isAddedToday(s: Signal, now = Date.now()) {
  const collected = Date.parse(s.first_seen_at)
  return (
    Number.isFinite(collected) &&
    collected <= now &&
    collectionDay.format(collected) === collectionDay.format(now)
  )
}
export const isUpdated = (s: Signal, now = Date.now()) =>
  !isNew(s, now) && now - Date.parse(s.last_material_update) < 86400000
export function normaliseFilters(value: Partial<Filters>): Filters {
  const result = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      value[key as keyof Filters] ?? fallback,
    ]),
  ) as unknown as Filters
  if (['top', 'awards', 'renewals', 'sources'].includes(result.view)) result.view = 'all'
  if (result.view === 'pipeline') result.view = 'early'
  if (result.view === 'updates') result.view = 'today'
  if (result.view === 'frameworks') {
    result.view = 'all'
    result.type ||= 'FRAMEWORK'
  }
  if (result.view === 'funding') result.view = 'all'
  if (['recommended', 'fit', 'confidence'].includes(result.sort)) result.sort = 'recent'
  if (['AWARD', 'RENEWAL_SIGNAL'].includes(result.type)) result.type = ''
  result.score = result.confidence = result.recommendation = ''
  return result
}
export function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search)
  return normaliseFilters(Object.fromEntries(params))
}
const platformFamilies = new Set([
  'salesforce',
  'crm',
  'relationships',
  'service',
  'contact_centre',
  'portals',
  'sales_revenue',
  'marketing',
  'data',
  'integration',
  'analytics',
  'field_service',
  'transformation',
  'workflow',
  'managed',
  'industry',
  'external_integration',
  'collaboration',
])
const aiFamilies = new Set(['ai', 'genai', 'automation', 'knowledge'])
export function priorityTier(signal: Signal) {
  if (signal.delivery_priority) return { platform: 0, ai: 1, other: 2 }[signal.delivery_priority]
  const families = signal.discovery_families || signal.matched_capabilities
  if (families.some((id) => platformFamilies.has(id))) return 0
  return families.some((id) => aiFamilies.has(id)) ? 1 : 2
}
export function filterSignals(
  signals: Signal[],
  f: Filters,
  saved: string[] = [],
  now = Date.now(),
  capabilities: Dataset['capabilities'] = [],
) {
  const currentViews = ['live', 'closing', 'early', 'pipeline', 'frameworks', 'funding']
  const result = signals.filter((s) => {
    if (!isAvailableOpportunity(s, now)) return false
    if (!matchesMarket(s, f.market)) return false
    const state = lifecycleState(s, now)
    if (
      currentViews.includes(f.view) &&
      (s.exclusion_reasons?.length || !['OPEN', 'EARLY_ENGAGEMENT', 'FUTURE'].includes(state))
    )
      return false
    switch (f.view) {
      case 'live':
        if (!isLive(s, now)) return false
        break
      case 'closing':
        if (!isLive(s, now) || daysLeft(s, now) === null || daysLeft(s, now)! > 7) return false
        break
      case 'early':
      case 'pipeline':
        if (!['EARLY_ENGAGEMENT', 'FUTURE'].includes(state)) return false
        break
      case 'frameworks':
        if (s.signal_type !== 'FRAMEWORK') return false
        break
      case 'funding':
        if (!['FUNDING', 'PARTNERSHIP'].includes(s.signal_type)) return false
        break
      case 'saved':
        if (!saved.includes(s.id)) return false
        break
      case 'today':
        if (!isAddedToday(s, now)) return false
        break
    }
    if (!matchesSearch(s, f.q, capabilities)) return false
    if (f.source && !s.provenance.some((p) => p.source === f.source)) return false
    if (f.type && s.signal_type !== f.type) return false
    if (f.capability && !s.matched_capabilities.includes(f.capability)) return false
    if (f.sector && !s.categories.includes(f.sector)) return false
    if (f.buyer && !(s.buyer_name || '').toLowerCase().includes(f.buyer.toLowerCase())) return false
    if (f.region && !s.regions.some((r) => r.toLowerCase().includes(f.region.toLowerCase())))
      return false
    if (f.cpv && !s.cpv_codes.some((c) => c.startsWith(f.cpv))) return false
    if (
      f.minValue &&
      (s.value_max === null || s.value_max < Number(f.minValue) || s.currency !== valueCurrency(f))
    )
      return false
    if (
      f.maxValue &&
      (s.value_max === null || s.value_max > Number(f.maxValue) || s.currency !== valueCurrency(f))
    )
      return false
    if (
      f.deadline &&
      (!s.deadline_at || Date.parse(s.deadline_at) <= now || daysLeft(s, now)! > Number(f.deadline))
    )
      return false
    if (f.currency && s.currency !== f.currency) return false
    if (f.change === 'new' && !isNew(s, now)) return false
    if (f.change === 'updated' && !isUpdated(s, now)) return false
    return true
  })
  return result.sort((a, b) => {
    const priority = priorityTier(a) - priorityTier(b)
    if (priority) return priority
    switch (f.sort) {
      case 'recent':
        return (
          Date.parse(b.published_at || b.first_seen_at) -
          Date.parse(a.published_at || a.first_seen_at)
        )
      case 'updated':
        return (
          Date.parse(b.last_material_update || b.first_seen_at) -
          Date.parse(a.last_material_update || a.first_seen_at)
        )
      case 'deadline':
        return (
          (a.deadline_at ? Date.parse(a.deadline_at) : Infinity) -
          (b.deadline_at ? Date.parse(b.deadline_at) : Infinity)
        )
      case 'value':
        return (
          (b.currency === valueCurrency(f) ? (b.value_max ?? -1) : -1) -
          (a.currency === valueCurrency(f) ? (a.value_max ?? -1) : -1)
        )
      default:
        return compareRecommended(a, b, now)
    }
  })
}
export function compareRecommended(a: Signal, b: Signal, now = Date.now()) {
  void now
  return (
    priorityTier(a) - priorityTier(b) ||
    Date.parse(b.published_at || b.first_seen_at) - Date.parse(a.published_at || a.first_seen_at) ||
    a.id.localeCompare(b.id)
  )
}
export function safeURL(value: string) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? value
      : '#'
  } catch {
    return '#'
  }
}
export function csv(signals: Signal[]) {
  const escape = (value: unknown) =>
    '"' +
    String(value ?? '')
      .replace(/^[\s\x00-\x1f]*[=+@\-\t\r]/, "'$&")
      .replace(/"/g, '""') +
    '"'
  return [
    ['Title', 'Buyer', 'Type', 'Lifecycle', 'Value', 'Currency', 'Deadline', 'Source URL'],
    ...signals.map((s) => [
      s.title,
      s.buyer_name,
      typeLabels[s.signal_type],
      lifecycleLabels[lifecycleState(s)],
      s.value_max,
      s.currency,
      s.deadline_at,
      s.primary_source_url,
    ]),
  ]
    .map((row) => row.map(escape).join(','))
    .join('\r\n')
}
export function download(name: string, body: string, mime: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function calendar(s: Signal) {
  if (!s.deadline_at) return
  const escape = (v: string) =>
    v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
  const dt = new Date(s.deadline_at)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Anthrion//Signal//EN',
    'BEGIN:VEVENT',
    `UID:${s.id}@anthrion-signal`,
    `DTSTAMP:${new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')}`,
    `DTSTART:${dt}`,
    `SUMMARY:${escape(s.title)}`,
    `DESCRIPTION:${escape(s.buyer_name || '')}\\n${s.primary_source_url}`,
    `URL:${s.primary_source_url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  download('anthrion-deadline.ics', content, 'text/calendar')
}
