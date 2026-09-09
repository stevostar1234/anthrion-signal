from datetime import UTC, datetime
from pathlib import Path

import pytest

from anthrion_signal.collectors import RawRecord
from anthrion_signal.config import load_config
from anthrion_signal.models import Analysis
from anthrion_signal.normalise import normalise_ocds


@pytest.fixture
def now():
    return datetime(2026, 9, 9, 12, tzinfo=UTC)


@pytest.fixture
def config():
    return load_config(Path(__file__).resolve().parents[2])


@pytest.fixture
def source(config):
    return config["sources"]["sources"][0]


@pytest.fixture
def release():
    return {"ocid": "ocds-test-001", "id": "001-2026", "date": "2026-09-08T10:00:00Z", "tag": ["tender"],
        "buyer": {"id": "buyer-1", "name": "Example Council"},
        "parties": [{"id": "buyer-1", "name": "Example Council", "roles": ["buyer"], "address": {"countryName": "United Kingdom"}}],
        "tender": {"id": "CRM-2026-001", "title": "Salesforce CRM implementation",
            "description": "The council requires Salesforce implementation and systems integration. Delivery in GB. Managed services are required. Framework membership must be confirmed.",
            "status": "active", "value": {"amount": 250000, "currency": "GBP"},
            "tenderPeriod": {"endDate": "2026-10-01T12:00:00Z"},
            "items": [{"id": "1", "classification": {"scheme": "CPV", "id": "72200000"}}],
            "documents": [{"id": "notice", "documentType": "tenderNotice", "url": "https://www.find-tender.service.gov.uk/Notice/001-2026"}]}}


@pytest.fixture
def signal(release, source, now):
    return normalise_ocds(RawRecord(release, source, now.isoformat()))


@pytest.fixture
def analysis(signal):
    def ev(quote):
        return {"quote": quote, "source_url": signal.primary_source_url}
    def dimension(level="UNKNOWN", ids=None, quote=None):
        return {"level": level, "company_evidence_ids": ids or [], "opportunity_evidence": [ev(quote)] if quote else [], "explanation": "Supported by the supplied evidence."}
    return Analysis.model_validate({"summary": "The council is procuring Salesforce implementation and integration services.",
        "requirements": [{"text": "Salesforce implementation", "importance": 5, "category": "platform",
            "evidence": ev("Salesforce implementation"), "capability_id": "salesforce", "match_level": "DIRECT",
            "company_evidence_ids": ["salesforce"], "explanation": "The documented Salesforce implementation capability directly matches."},
            {"text": "Systems integration", "importance": 5, "category": "integration", "evidence": ev("systems integration"),
             "capability_id": "integration", "match_level": "STRONG_ADJACENT", "company_evidence_ids": ["integration"], "explanation": "Documented MuleSoft delivery provides adjacent integration experience."}],
        "references": {"level": "ONE_DIRECT", "reference_ids": ["troester"], "opportunity_evidence": [ev("Salesforce implementation")], "explanation": "TROESTER provides Salesforce and integration evidence."},
        "delivery": dimension("DIRECT", ["implementation"], "Salesforce implementation"),
        "sector": dimension("DIRECT", ["public_services"], "Example Council"),
        "geography": dimension("DIRECT", ["geographies"], "Delivery in GB"),
        "feasibility": dimension(), "risks": [], "hard_blockers": [], "information_gaps": ["Framework membership is unknown."],
        "recommendation_evidence": [ev("Salesforce implementation")]})
