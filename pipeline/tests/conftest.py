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
            "description": "The council requires Salesforce implementation and systems integration. Delivery in GB. Managed services are required. Framework membership must be confirmed. The scope covers configuration and support for the new platform.",
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
    return Analysis.model_validate({"version": "2.0",
        "summary": "The council is procuring Salesforce implementation and integration services.",
        "assessed_scope": "Salesforce implementation and systems integration",
        "scope_basis": "WHOLE_REQUIREMENT", "scope_evidence": [ev("Salesforce implementation and systems integration")],
        "requirements": [
            {"text": "Salesforce implementation", "importance": 5, "category": "platform",
             "evidence": ev("Salesforce implementation"), "capability_id": "salesforce", "match_level": "DIRECT",
             "possible_products": ["Salesforce Platform"], "explanation": "Salesforce directly addresses the stated platform implementation."},
            {"text": "Systems integration", "importance": 5, "category": "integration", "evidence": ev("systems integration"),
             "capability_id": "integration", "match_level": "STRONG", "possible_products": ["MuleSoft"],
             "explanation": "MuleSoft is a potential route to the buyer's integration requirement."}],
        "solution_route": {"level": "EXPLICIT_ECOSYSTEM", "opportunity_evidence": [ev("Salesforce implementation")],
                           "explanation": "An explicit Salesforce implementation requirement."},
        "delivery": {"level": "BUILD", "opportunity_evidence": [ev("Salesforce implementation")],
                     "explanation": "The buyer requires implementation services."},
        "solution_suggestion": "Salesforce Platform with MuleSoft could address the implementation and systems integration requirements.",
        "solution_evidence": [ev("Salesforce implementation and systems integration")],
        "requirements_completeness": "SUMMARY",
        "eligibility_checks": [{"text": "Confirm framework membership.", "status": "CHECK_REQUIRED",
                                "evidence": ev("Framework membership must be confirmed."), "company_evidence_id": None}],
        "risks": [], "information_gaps": ["Framework membership is unknown."]})
