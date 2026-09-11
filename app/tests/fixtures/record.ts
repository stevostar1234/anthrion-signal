import type { Dataset, Signal } from '../../src/types'

export const recordTitle =
  'Invitation to submit a proposal for human resources information system (HRIS) and fully managed payroll service'
export const recordDescription = [
  'Vanguard Learning Trust invites qualified suppliers to tender for a cloud-based human resources information system (HRIS) and a fully managed payroll service for approximately 615 employees across six schools and a central Trust team.',
  'The solution will bring employee data into a single system, reduce manual administration and support workforce planning. Scope includes absence management, time and expenses, employee and manager self-service, people analytics, and managed payroll and pensions. UK-based hosting and data security are required.',
].join('\n\n')

export function recordDataset(dataset: Dataset, overrides: Partial<Signal> = {}): Dataset {
  const timestamp = '2026-09-11T10:00:00Z'
  const record: Signal = {
    id: 'panel-a',
    title: recordTitle,
    description: recordDescription,
    buyer_name: 'VANGUARD LEARNING TRUST',
    source: 'find_a_tender',
    source_type: 'official_notice',
    primary_source_url: 'https://example.com/tender/a',
    source_urls: ['https://example.com/tender/a'],
    ocid: null,
    external_ids: [],
    countries: ['GB'],
    regions: [],
    status: 'active',
    signal_type: 'FRAMEWORK',
    notice_type: 'tender',
    lifecycle_state: 'OPEN',
    procurement_stage: 'tender',
    delivery_priority: 'platform',
    deadline_at: '2026-09-14T12:00:00+01:00',
    published_at: timestamp,
    updated_at: timestamp,
    first_seen_at: timestamp,
    last_seen_at: timestamp,
    last_material_update: timestamp,
    value_min: null,
    value_max: null,
    currency: 'GBP',
    contract_start: null,
    contract_end: null,
    extension_end: null,
    categories: [],
    cpv_codes: [],
    framework: 'Framework agreement',
    lot_ids: [],
    incumbent_supplier: null,
    exclusion_reasons: [],
    matched_capabilities: ['service', 'analytics'],
    prefilter_matches: [],
    documents: [],
    provenance: [
      {
        source: 'find_a_tender',
        source_name: 'Find a Tender',
        url: 'https://example.com/tender/a',
        release_id: 'panel-notice',
        retrieved_at: timestamp,
        published_at: timestamp,
      },
    ],
    changes: [],
    related_signal_id: null,
    renewal_basis: null,
    ...overrides,
  }
  return {
    ...dataset,
    generated_at: '2026-09-11T12:00:00Z',
    signals: [
      record,
      {
        ...record,
        id: 'panel-b',
        title: 'Customer platform implementation',
        description: 'A second opportunity with a short description.',
        primary_source_url: 'https://example.com/tender/b',
        published_at: '2026-09-10T10:00:00Z',
      },
    ],
  }
}
