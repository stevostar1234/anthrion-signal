import { describe, expect, test } from 'vitest'
import type { Signal } from './types'
import {
  csv,
  defaults,
  filterSignals,
  isLive,
  safeURL,
  deadlineCaption,
  matchesMarket,
  marketIsEnabled,
} from './lib'
const now = Date.parse('2026-09-09T12:00:00Z')
const signal = {
  id: 'one',
  title: 'Salesforce platform',
  description: 'CRM implementation',
  buyer_name: 'Buyer',
  countries: ['GB'],
  regions: ['Scotland'],
  categories: ['Public services'],
  cpv_codes: ['72200000'],
  provenance: [{ source: 'find_tender' }],
  matched_capabilities: ['salesforce'],
  recommendation: 'PURSUE',
  fit_score: 88,
  confidence_score: 82,
  value_max: 400000,
  currency: 'GBP',
  source_urls: [],
  primary_source_url: 'https://example.gov.uk/notice',
  signal_type: 'LIVE_TENDER',
  procurement_stage: 'tender',
  status: 'active',
  deadline_at: '2026-09-20T12:00:00Z',
  first_seen_at: '2026-09-08T14:00:00Z',
  last_material_update: '2026-09-08T14:00:00Z',
} as unknown as Signal
describe('team workflows', () => {
  test('market selection scopes each country, all markets and the Nordic region', () => {
    expect(matchesMarket(signal, 'GB')).toBe(true)
    expect(matchesMarket(signal, 'US')).toBe(false)
    expect(matchesMarket(signal, '')).toBe(true)
    const nordic = ['SE', 'FI', 'DK', 'NO', 'IS'].map((country) => ({
      ...signal,
      id: country,
      countries: [country],
    }))
    expect(
      filterSignals([signal, ...nordic], { ...defaults, market: 'NORDICS' }, [], now),
    ).toHaveLength(5)
    expect(filterSignals([signal, ...nordic], { ...defaults, market: 'NO' }, [], now)).toHaveLength(
      1,
    )
    expect(marketIsEnabled('NORDICS', { GB: { enabled: true }, SE: { enabled: false } })).toBe(
      false,
    )
    expect(marketIsEnabled('NORDICS', { FI: { enabled: true } })).toBe(true)
  })
  test('same-day deadlines show hours and already passed deadlines show closed', () => {
    expect(deadlineCaption({ ...signal, deadline_at: '2026-09-09T11:59:00Z' }, now)).toMatch(
      /^Closed/,
    )
    expect(deadlineCaption({ ...signal, deadline_at: '2026-09-09T14:00:00Z' }, now)).toContain(
      '2h left',
    )
  })
  test('expired or cancelled tenders are not live', () => {
    expect(isLive(signal, now)).toBe(true)
    expect(isLive({ ...signal, status: 'cancelled' }, now)).toBe(false)
    expect(isLive({ ...signal, deadline_at: '2026-09-01' }, now)).toBe(false)
    expect(isLive({ ...signal, deadline_at: '2026-09-09T11:59:00Z' }, now)).toBe(false)
  })
  test('combines independent filters and excludes unknown scores', () => {
    expect(
      filterSignals(
        [signal],
        {
          ...defaults,
          source: 'find_tender',
          score: '82',
          capability: 'salesforce',
          cpv: '722',
          region: 'scot',
          deadline: '14',
        },
        [],
        now,
      ),
    ).toHaveLength(1)
    expect(
      filterSignals([{ ...signal, fit_score: null }], { ...defaults, score: '1' }, [], now),
    ).toHaveLength(0)
    expect(filterSignals([signal], { ...defaults, q: 'unrelated' }, [], now)).toHaveLength(0)
    expect(filterSignals([signal], { ...defaults, view: 'saved' }, ['one'], now)).toHaveLength(1)
  })
  test('CSV neutralises spreadsheet formulas and preserves quotes', () => {
    const result = csv([{ ...signal, title: '=HYPERLINK("bad")' }])
    expect(result).toContain("'=")
    expect(result).toContain('""bad""')
  })
  test('untrusted links cannot execute script', () => {
    expect(safeURL('javascript:alert(1)')).toBe('#')
    expect(safeURL('https://user:password@example.com')).toBe('#')
    expect(safeURL(signal.primary_source_url)).toBe(signal.primary_source_url)
  })
  test('top signals require plausible fit or strong candidate evidence', () => {
    expect(filterSignals([{ ...signal, fit_score: 68 }], defaults, [], now)).toHaveLength(0)
    expect(
      filterSignals([{ ...signal, fit_score: null, prefilter_score: 18 }], defaults, [], now),
    ).toHaveLength(0)
    expect(
      filterSignals([{ ...signal, fit_score: null, prefilter_score: 65 }], defaults, [], now),
    ).toHaveLength(1)
    expect(
      filterSignals(
        [{ ...signal, deadline_at: '2026-09-09T11:59:00Z' }],
        { ...defaults, deadline: '7', view: 'all' },
        [],
        now,
      ),
    ).toHaveLength(0)
  })
})
