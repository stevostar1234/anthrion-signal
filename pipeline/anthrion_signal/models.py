from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MatchLevel = Literal["DIRECT", "STRONG_ADJACENT", "WEAK_ADJACENT", "NONE", "UNKNOWN"]
SignalType = Literal[
    "LIVE_TENDER", "EARLY_MARKET_ENGAGEMENT", "PIPELINE", "FUTURE_OPPORTUNITY", "FRAMEWORK",
    "RFI", "RFP", "RENEWAL_SIGNAL", "AWARD", "STRATEGIC_INTENT", "FUNDING", "PARTNERSHIP",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Evidence(StrictModel):
    quote: str = Field(min_length=3, max_length=1500)
    source_url: str


class Requirement(StrictModel):
    text: str = Field(min_length=3, max_length=800)
    importance: int = Field(ge=1, le=5)
    category: str
    evidence: Evidence
    capability_id: str | None
    match_level: MatchLevel
    company_evidence_ids: list[str]
    explanation: str = Field(max_length=1200)

    @model_validator(mode="after")
    def require_grounding(self):
        if self.match_level not in ("NONE", "UNKNOWN") and (
            not self.capability_id or not self.company_evidence_ids or not self.explanation.strip()
        ):
            raise ValueError("Non-zero capability matches require profile evidence and an explanation")
        return self


class DimensionAssessment(StrictModel):
    level: MatchLevel
    opportunity_evidence: list[Evidence]
    company_evidence_ids: list[str]
    explanation: str = Field(max_length=1500)

    @model_validator(mode="after")
    def grounded(self):
        if self.level != "UNKNOWN" and not self.opportunity_evidence:
            raise ValueError("Known dimensions require opportunity evidence")
        if self.level not in ("NONE", "UNKNOWN") and not self.company_evidence_ids:
            raise ValueError("Positive dimensions require company evidence")
        return self


class ReferenceAssessment(StrictModel):
    level: Literal["MULTIPLE_DIRECT", "DIRECT_PLUS_ADJACENT", "ONE_DIRECT", "GENERIC", "NONE", "UNKNOWN"]
    reference_ids: list[str]
    opportunity_evidence: list[Evidence]
    explanation: str = Field(max_length=1500)


class Risk(StrictModel):
    text: str = Field(max_length=700)
    evidence: Evidence
    kind: Literal["eligibility", "delivery", "commercial", "scope", "timing", "information_gap"]


class Blocker(StrictModel):
    text: str = Field(max_length=700)
    evidence: Evidence
    company_evidence_id: str


class Analysis(StrictModel):
    summary: str = Field(min_length=10, max_length=1800)
    requirements: list[Requirement] = Field(max_length=16)
    references: ReferenceAssessment
    delivery: DimensionAssessment
    sector: DimensionAssessment
    geography: DimensionAssessment
    feasibility: DimensionAssessment
    risks: list[Risk] = Field(max_length=12)
    hard_blockers: list[Blocker] = Field(max_length=8)
    information_gaps: list[str] = Field(max_length=12)
    recommendation_evidence: list[Evidence]


class ScoreComponent(StrictModel):
    id: str
    label: str
    points: float | None
    max_points: float
    known_weight: float
    explanation: str
    evidence: list[Evidence] = Field(default_factory=list)
    company_evidence_ids: list[str] = Field(default_factory=list)


class Document(StrictModel):
    title: str
    url: str
    kind: str = "document"


class Provenance(StrictModel):
    source: str
    source_name: str
    url: str
    release_id: str
    ocid: str | None = None
    retrieved_at: str
    published_at: str | None = None
    raw_hash: str


class Change(StrictModel):
    at: str
    kind: str
    fields: list[str]
    source_url: str


class Signal(StrictModel):
    id: str
    fingerprint: str = ""
    ocid: str | None = None
    lot_id: str | None = None
    lot_ids: list[str] = Field(default_factory=list)
    external_ids: list[str] = Field(default_factory=list)
    source: str
    source_type: str
    source_urls: list[str] = Field(default_factory=list)
    primary_source_url: str
    title: str
    description: str
    buyer_name: str | None = None
    buyer_identifiers: list[str] = Field(default_factory=list)
    signal_type: SignalType
    procurement_stage: str
    notice_type: str | None = None
    status: str = "unknown"
    published_at: str | None = None
    updated_at: str | None = None
    deadline_at: str | None = None
    contract_start: str | None = None
    contract_end: str | None = None
    extension_end: str | None = None
    value_min: float | None = Field(default=None, ge=0)
    value_max: float | None = Field(default=None, ge=0)
    currency: str | None = None
    cpv_codes: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    regions: list[str] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list)
    framework: str | None = None
    incumbent_supplier: str | None = None
    eligibility_text: str | None = None
    documents: list[Document] = Field(default_factory=list)
    first_seen_at: str
    last_seen_at: str
    last_material_update: str
    raw_source_hash: str
    content_hash: str = ""
    material_change_hash: str = ""
    prefilter_score: float = 0
    prefilter_matches: list[str] = Field(default_factory=list)
    matched_capabilities: list[str] = Field(default_factory=list)
    fit_score: float | None = Field(default=None, ge=0, le=100)
    confidence_score: float = Field(default=0, ge=0, le=100)
    known_weight: float = 0
    score_components: list[ScoreComponent] = Field(default_factory=list)
    score_explanation: str = "Awaiting evidence analysis."
    recommendation: str = "REVIEW"
    analysis: Analysis | None = None
    ai_status: str = "pending"
    ai_model: str | None = None
    ai_scored_at: str | None = None
    analysis_cache_key: str | None = None
    provenance: list[Provenance] = Field(default_factory=list)
    changes: list[Change] = Field(default_factory=list)
    related_signal_id: str | None = None
    renewal_basis: str | None = None


class SourceHealth(StrictModel):
    id: str
    name: str
    website: str
    enabled: bool
    status: Literal["healthy", "partial", "failed", "disabled", "not_checked"]
    last_attempt: str | None = None
    last_success: str | None = None
    records: int = 0
    message: str | None = None


class Dataset(StrictModel):
    schema_version: str = "1.0"
    generated_at: str
    data_updated_at: str
    company_name: str = "Anthrion"
    profile_version: str
    scoring_version: str
    run: dict[str, Any]
    sources: list[SourceHealth]
    capabilities: list[dict[str, Any]]
    markets: dict[str, Any]
    evidence_catalog: dict[str, Any]
    signals: list[Signal]
