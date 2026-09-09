export interface Evidence {
  quote: string
  source_url: string
}
export interface Requirement {
  text: string
  importance: number
  category: string
  evidence: Evidence
  capability_id: string | null
  match_level: string
  company_evidence_ids: string[]
  explanation: string
}
export interface ScoreComponent {
  id: string
  label: string
  points: number | null
  max_points: number
  known_weight: number
  explanation: string
  evidence: Evidence[]
  company_evidence_ids: string[]
}
export interface Signal {
  id: string
  title: string
  description: string
  buyer_name: string | null
  source: string
  source_type: string
  primary_source_url: string
  source_urls: string[]
  ocid: string | null
  external_ids: string[]
  signal_type: string
  procurement_stage: string
  status: string
  notice_type: string | null
  published_at: string | null
  updated_at: string | null
  deadline_at: string | null
  contract_start: string | null
  contract_end: string | null
  extension_end: string | null
  value_min: number | null
  value_max: number | null
  currency: string | null
  regions: string[]
  countries: string[]
  categories: string[]
  cpv_codes: string[]
  framework: string | null
  lot_ids: string[]
  incumbent_supplier: string | null
  first_seen_at: string
  last_seen_at: string
  last_material_update: string
  fit_score: number | null
  confidence_score: number
  known_weight: number
  score_components: ScoreComponent[]
  prefilter_score: number
  prefilter_matches: string[]
  matched_capabilities: string[]
  recommendation: string
  score_explanation: string
  ai_status: string
  ai_model: string | null
  ai_scored_at: string | null
  analysis: {
    summary: string
    requirements: Requirement[]
    risks: { text: string; kind: string; evidence: Evidence }[]
    hard_blockers: { text: string; evidence: Evidence; company_evidence_id: string }[]
    information_gaps: string[]
  } | null
  documents: { title: string; url: string; kind: string }[]
  provenance: {
    source: string
    source_name: string
    url: string
    release_id: string
    retrieved_at: string
    published_at: string | null
  }[]
  changes: { at: string; kind: string; fields: string[]; source_url: string }[]
  related_signal_id: string | null
  renewal_basis: string | null
}
export interface Source {
  id: string
  name: string
  website: string
  enabled: boolean
  status: string
  last_attempt: string | null
  last_success: string | null
  records: number
  message: string | null
}
export interface Dataset {
  schema_version: string
  generated_at: string
  data_updated_at: string
  profile_version: string
  scoring_version: string
  sources: Source[]
  capabilities: { id: string; label: string; family: string }[]
  evidence_catalog: Record<
    string,
    { label: string; quote: string; page?: number; section?: string; document: string }
  >
  markets: Record<string, { name: string; enabled: boolean }>
  signals: Signal[]
  run: {
    sources_attempted: number
    sources_succeeded: number
    raw_records: number
    new_signals: number
    material_updates: number
    gemini_calls: number
    cache_hits: number
    ai_failures: number
    [key: string]: unknown
  }
}
export interface Filters {
  q: string
  view: string
  sort: string
  market: string
  score: string
  confidence: string
  source: string
  type: string
  recommendation: string
  capability: string
  sector: string
  buyer: string
  region: string
  cpv: string
  minValue: string
  maxValue: string
  deadline: string
  change: string
}
