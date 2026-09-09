import type { Filters, Signal } from './types'

export const defaults: Filters = { q: '', view: 'top', sort: 'recommended', market: 'GB', score: '', confidence: '', source: '', type: '', recommendation: '', capability: '', sector: '', buyer: '', region: '', cpv: '', minValue: '', maxValue: '', deadline: '', change: '' }
export const typeLabels: Record<string, string> = { LIVE_TENDER: 'Live tender', EARLY_MARKET_ENGAGEMENT: 'Early engagement', PIPELINE: 'Pipeline', FUTURE_OPPORTUNITY: 'Future opportunity', FRAMEWORK: 'Framework', RFI: 'Request for information', RFP: 'Request for proposal', RENEWAL_SIGNAL: 'Renewal signal', AWARD: 'Contract award', STRATEGIC_INTENT: 'Strategic intent', FUNDING: 'Funding', PARTNERSHIP: 'Partnership' }
export const recommendationLabels: Record<string, string> = { PURSUE: 'Pursue', ENGAGE_NOW: 'Engage now', WATCH: 'Watch', PARTNER: 'Partner', FUNDING: 'Explore funding', REVIEW: 'Review', LOW_PRIORITY: 'Low priority' }
export const date = (value: string | null, options?: Intl.DateTimeFormatOptions) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-GB', options || { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not published'
export const amount = (value: number | null, currency: string | null, compact = true) => {
  if (value === null) return 'Value not published'
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 0 }).format(value) }
  catch { return `${value.toLocaleString('en-GB')} ${currency || ''}` }
}
export const daysLeft = (s: Signal, now = Date.now()) => s.deadline_at ? Math.ceil((Date.parse(s.deadline_at) - now) / 86400000) : null
export const isLive = (s: Signal, now = Date.now()) => s.procurement_stage === 'tender' && !['cancelled', 'withdrawn', 'complete', 'awarded', 'unsuccessful', 'closed'].includes(s.status) && (!s.deadline_at || Date.parse(s.deadline_at) > now)
export const isEarly = (s: Signal) => ['EARLY_MARKET_ENGAGEMENT', 'RFI'].includes(s.signal_type)
export const isNew = (s: Signal, now = Date.now()) => now - Date.parse(s.first_seen_at) < 86400000
export const isUpdated = (s: Signal, now = Date.now()) => !isNew(s, now) && now - Date.parse(s.last_material_update) < 86400000
export function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search)
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, params.get(key) ?? fallback])) as unknown as Filters
}
export function filterSignals(signals: Signal[], f: Filters, saved: string[] = [], now = Date.now()) {
  const result = signals.filter(s => {
    if (f.market && !s.countries.includes(f.market)) return false
    switch (f.view) {
      case 'top':
        if (s.recommendation === 'LOW_PRIORITY' || s.signal_type === 'AWARD' || s.status === 'cancelled'
          || (s.deadline_at && Date.parse(s.deadline_at) <= now) || (s.procurement_stage === 'tender' && !isLive(s, now))
          || (s.fit_score === null ? s.prefilter_score < 40 : s.fit_score < 72)) return false
        break
      case 'live': if (!isLive(s, now)) return false; break
      case 'early': if (!isEarly(s)) return false; break
      case 'pipeline': if (!['PIPELINE', 'FUTURE_OPPORTUNITY', 'STRATEGIC_INTENT'].includes(s.signal_type)) return false; break
      case 'renewals': if (s.signal_type !== 'RENEWAL_SIGNAL') return false; break
      case 'frameworks': if (s.signal_type !== 'FRAMEWORK') return false; break
      case 'funding': if (!['FUNDING', 'PARTNERSHIP'].includes(s.signal_type)) return false; break
      case 'awards': if (s.signal_type !== 'AWARD') return false; break
      case 'saved': if (!saved.includes(s.id)) return false; break
      case 'updates': if (!isNew(s, now) && !isUpdated(s, now)) return false; break
    }
    const text = `${s.title} ${s.description} ${s.buyer_name || ''} ${s.ocid || ''}`.toLowerCase()
    if (f.q && !f.q.toLowerCase().split(/\s+/).every(q => text.includes(q))) return false
    if (f.score && (s.fit_score === null || s.fit_score < Number(f.score))) return false
    if (f.confidence && s.confidence_score < Number(f.confidence)) return false
    if (f.source && !s.provenance.some(p => p.source === f.source)) return false
    if (f.type && s.signal_type !== f.type) return false
    if (f.recommendation && s.recommendation !== f.recommendation) return false
    if (f.capability && !s.matched_capabilities.includes(f.capability)) return false
    if (f.sector && !s.categories.includes(f.sector)) return false
    if (f.buyer && !(s.buyer_name || '').toLowerCase().includes(f.buyer.toLowerCase())) return false
    if (f.region && !s.regions.some(r => r.toLowerCase().includes(f.region.toLowerCase()))) return false
    if (f.cpv && !s.cpv_codes.some(c => c.startsWith(f.cpv))) return false
    if (f.minValue && (s.value_max === null || s.value_max < Number(f.minValue) || s.currency !== 'GBP')) return false
    if (f.maxValue && (s.value_max === null || s.value_max > Number(f.maxValue) || s.currency !== 'GBP')) return false
    if (f.deadline && (!s.deadline_at || Date.parse(s.deadline_at) <= now || daysLeft(s, now)! > Number(f.deadline))) return false
    if (f.change === 'new' && !isNew(s, now)) return false
    if (f.change === 'updated' && !isUpdated(s, now)) return false
    return true
  })
  return result.sort((a, b) => {
    switch (f.sort) {
      case 'fit': return (b.fit_score ?? -1) - (a.fit_score ?? -1)
      case 'recent': return Date.parse(b.updated_at || b.first_seen_at) - Date.parse(a.updated_at || a.first_seen_at)
      case 'deadline': return (a.deadline_at ? Date.parse(a.deadline_at) : Infinity) - (b.deadline_at ? Date.parse(b.deadline_at) : Infinity)
      case 'value': return (b.currency === 'GBP' ? b.value_max ?? -1 : -1) - (a.currency === 'GBP' ? a.value_max ?? -1 : -1)
      case 'confidence': return b.confidence_score - a.confidence_score
      default: return rank(b) - rank(a)
    }
  })
}
function rank(s: Signal) { return ({ PURSUE: 200, ENGAGE_NOW: 180, PARTNER: 100, FUNDING: 100, WATCH: 30, REVIEW: 20, LOW_PRIORITY: 0 }[s.recommendation] || 0) + (s.fit_score ?? s.prefilter_score * .6) + s.confidence_score / 100 }
export function safeURL(value: string) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : '#' } catch { return '#' } }
export function csv(signals: Signal[]) {
  const escape = (value: unknown) => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"'
  return [['Title', 'Buyer', 'Type', 'Recommendation', 'Fit', 'Confidence', 'Value', 'Currency', 'Deadline', 'Source URL'], ...signals.map(s => [s.title, s.buyer_name, typeLabels[s.signal_type], recommendationLabels[s.recommendation], s.fit_score, s.confidence_score, s.value_max, s.currency, s.deadline_at, s.primary_source_url])].map(row => row.map(escape).join(',')).join('\r\n')
}
export function download(name: string, body: string, mime: string) { const url = URL.createObjectURL(new Blob([body], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
export function calendar(s: Signal) {
  if (!s.deadline_at) return
  const escape = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
  const dt = new Date(s.deadline_at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const content = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Anthrion//Signal//EN', 'BEGIN:VEVENT', `UID:${s.id}@anthrion-signal`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, `DTSTART:${dt}`, `SUMMARY:${escape(s.title)}`, `DESCRIPTION:${escape(s.buyer_name || '')}\\n${s.primary_source_url}`, `URL:${s.primary_source_url}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  download('anthrion-deadline.ics', content, 'text/calendar')
}
