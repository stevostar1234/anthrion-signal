import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

from anthrion_signal import cli
from anthrion_signal.discovery import discovery_text, hard_exclusions, is_award_intelligence, is_public_opportunity, prefilter
from anthrion_signal.models import SourceHealth
from anthrion_signal.utils import atomic_json, read_json


@pytest.mark.parametrize("fields", [
    {"signal_type": "AWARD"},
    {"status": "awarded"},
    {"lifecycle_state": "AWARDED"},
    {"signal_type": "AWARD", "status": "cancelled"},
    {"signal_type": "RENEWAL_SIGNAL", "related_signal_id": "prior-award"},
    {"signal_type": "RENEWAL_SIGNAL", "status": "inferred"},
])
def test_award_publication_gate_recognises_all_supported_representations(signal, fields):
    assert is_award_intelligence(signal.model_copy(update=fields)) is True
    assert is_award_intelligence(signal) is False


@pytest.mark.parametrize("fields,expected", [
    ({"status": "closed"}, False),
    ({"status": "cancelled"}, False),
    ({"status": "withdrawn"}, False),
    ({"status": "postponed", "deadline_at": None}, False),
    ({"status": "postponed", "deadline_at": "2039-09-09T12:00:00Z"}, False),
    ({"deadline_at": "2020-01-01T12:00:00Z"}, False),
    ({"exclusion_reasons": ["Incompatible platform restriction"]}, False),
    ({"signal_type": "RFI"}, True),
    ({"signal_type": "PIPELINE", "deadline_at": None}, True),
    ({"status": "unknown", "deadline_at": None}, True),
])
def test_only_available_or_unconfirmed_candidates_can_be_published(signal, now, fields, expected):
    assert is_public_opportunity(signal.model_copy(update=fields), now) is expected


@pytest.mark.parametrize("title,description,format,excluded", [
    ("Existing case-management search", "An AI search tool already used by case workers.", "algorithmic_transparency_record", True),
    ("Minister for data", "Responsible for digital technology and procurement policy.", "ministerial_role", True),
    ("How procurement frameworks work", "Guidance on government software purchasing.", "guidance", True),
    ("CRM supplier engagement", "Seeking suppliers for a new customer platform.", "news_story", False),
    ("Digital procurement pipeline", "Planned procurement of a new case-management platform.", "corporate_report", False),
    ("AI funding competition", "Apply for funding to develop AI systems.", "guidance", False),
])
def test_general_publications_need_real_buying_intent(signal, config, title, description, format, excluded):
    signal = signal.model_copy(update={"source": "govuk", "title": title, "description": description, "notice_type": format})
    assert bool(hard_exclusions(signal, config["capabilities"])) is excluded


def test_portal_hostnames_do_not_create_salesforce_requirements(signal, config):
    signal = signal.model_copy(update={"title": "Community audiology services", "description": "Provide hearing assessment. Submit through https://atamis.my.salesforce.com and https://health-family.force.com/s/Welcome", "cpv_codes": ["85121240"]})
    prefilter([signal], config["company_profile"], config["search_terms"], config["capabilities"])
    assert "salesforce" not in signal.discovery_families
    assert signal.exclusion_reasons
    assert "https://atamis.my.salesforce.com" in signal.description


@pytest.mark.parametrize("title,description,expected", [
    ("Salesforce CRM implementation", "Implement Service Cloud with AI agents.", "platform"),
    ("Case management platform", "Replace the CRM and migrate customer data.", "platform"),
    ("Generative AI discovery", "An artificial intelligence proof of concept. Monthly reporting is required.", "ai"),
    ("Kundenbeziehungsmanagement", "CRM-System Implementierung und Datenmigration.", "platform"),
])
def test_delivery_priority_requires_an_explicit_capability_not_context(signal, config, title, description, expected):
    record = signal.model_copy(update={"title": title, "description": description, "cpv_codes": []})
    prefilter([record], config["company_profile"], config["search_terms"], config["capabilities"])
    assert record.delivery_priority == expected


@pytest.mark.parametrize("title,description,excluded", [
    ("Timber preservation and dampness control", "Building repairs raised as work orders.", True),
    ("Case management software for community audiology services", "CRM implementation and data migration.", False),
    ("Timber preservation", "Lot 1: Repairs. Lot 2: CRM software implementation for tracking work orders.", False),
    ("Field service platform", "Work order software and engineer scheduling.", False),
])
def test_physical_service_delivery_is_distinct_from_software_for_that_service(signal, config, title, description, excluded):
    signal = signal.model_copy(update={"title": title, "description": description})
    assert bool(hard_exclusions(signal, config["capabilities"])) is excluded


@pytest.mark.parametrize("title,description,codes,excluded", [
    ("Insurance and risk related services", "Insurance cover, claims management and brokerage services.", ["66510000"], True),
    ("New claims management platform", "Insurance claims software with CRM implementation.", ["66510000"], False),
    ("Housing development contractor", "Construction of homes. Register your organisation on our supplier portal.", ["45211000"], True),
    ("Peacock Centre construction", "Appoint a principal contractor to build homes. Register your organisation on our supplier portal.", ["45211000"], True),
    ("Clinical pharmacy services", "Medicines dispensing and clinical support.", ["85149000"], True),
    ("Design consultancy framework", "Estates design and construction consultancy. Reporting on the construction programme.", ["71000000", "72224000"], True),
    ("Healthcare digital services", "Implement a citizen portal and patient case management.", ["85000000"], False),
    ("Care home provision", "Lot 1: Care. Lot 2: CRM software implementation.", ["85000000"], False),
])
def test_non_technology_services_need_an_addressable_digital_scope(signal, config, title, description, codes, excluded):
    record = signal.model_copy(update={"title": title, "description": description, "cpv_codes": codes})
    assert bool(hard_exclusions(record, config["capabilities"])) is excluded


def test_submission_instructions_do_not_create_portal_requirements():
    assert "supplier portal" not in discovery_text("Build homes. Register your organisation on our supplier portal.")
    assert "supplier portal" in discovery_text("Develop a supplier portal for registration and onboarding.")


def test_submission_platform_descriptions_are_not_implementation_scope(signal, config):
    boilerplate = ("This Competitive Sealed Bid is being released through PASSPort, New York City's online procurement portal. "
                   "Responses to this RFx should be submitted via PASSPort. "
                   "To access the solicitation, vendors should visit the PASSPort Public Portal Navigator. "
                   "This will take you to the Public Portal of all procurements in the PASSPort system. "
                   "If you need assistance submitting a response, please contact MOCS Service Desk.")
    record = signal.model_copy(update={"title": "Supply of treatment chemicals", "description": boilerplate, "cpv_codes": []})
    prefilter([record], config["company_profile"], config["search_terms"], config["capabilities"])
    assert not record.discovery_families
    assert record.delivery_priority == "other"
    assert record.prefilter_score == 0
    assert "supplier portal" in discovery_text("Develop a supplier portal so vendors can submit their bids online.")
    assert "customer portal" not in discovery_text("Help: mocssupport.atlassian.net/servicedesk/customer/portal/8")


def test_relationship_database_is_discovered_without_naming_salesforce(signal, config):
    description = ("New York City Emergency Management is seeking an off-the-shelf, secure database to manage its Strengthening Communities program. "
                   "This database should serve as a central communication hub between staff and community coalitions.")
    record = signal.model_copy(update={"title": "Strengthening Communities Database", "description": description, "cpv_codes": []})
    prefilter([record], config["company_profile"], config["search_terms"], config["capabilities"])
    assert record.delivery_priority == "platform"
    assert "relationships" in record.discovery_families
    assert "salesforce" not in record.discovery_families
    assert record.prefilter_score >= config["capabilities"]["discovery"]["minimum_candidate_score"]


@pytest.mark.parametrize("restriction,blocked", [
    ("The requested services are limited to government entities, specifically CUNY and SUNY.", True),
    ("The requested services are limited to non-public entities nationwide.", False),
])
def test_explicit_public_institution_only_eligibility_is_not_inferred_from_the_buyer(signal, config, restriction, blocked):
    record = signal.model_copy(update={"title": "CRM implementation", "description": restriction, "buyer_name": "CUNY"})
    assert bool(hard_exclusions(record, config["capabilities"])) is blocked


@pytest.mark.parametrize("title,description", [
    ("RFP Appraisal of Real Estate", "Perform real estate appraisals through work orders."),
    ("Maintenance and Repair of Fire Systems", "Inspection of fire alarm systems and equipment."),
    ("RFP Civil Service Examination", "Administer civil service exams and develop study guides and title classification."),
])
def test_municipal_physical_and_professional_services_do_not_become_software_leads(signal, config, title, description):
    record = signal.model_copy(update={"title": title, "description": description, "cpv_codes": []})
    prefilter([record], config["company_profile"], config["search_terms"], config["capabilities"])
    assert record.exclusion_reasons
    assert record.prefilter_score == 0


@pytest.mark.parametrize("include_open", [True, False])
def test_rescore_removes_awards_from_publication_but_preserves_source_history(tmp_path, signal, now, monkeypatch, include_open):
    shutil.copytree(Path(__file__).resolve().parents[2] / "config", tmp_path / "config")
    award = signal.model_copy(update={"id": "awarded", "signal_type": "AWARD", "status": "awarded"})
    records = [award, signal] if include_open else [award]
    data = tmp_path / "data"
    data.mkdir()
    (data / "signals.jsonl").write_text("\n".join(s.model_dump_json() for s in records) + "\n", encoding="utf-8")
    checkpoints = {"find_tender": {"watermark": now.isoformat()}}
    atomic_json(data / "source_state.json", checkpoints)

    def forbidden(*args, **kwargs):
        raise AssertionError("An offline publication update must not fetch sources")

    monkeypatch.setattr(cli, "_collect", forbidden)
    args = SimpleNamespace(command="rescore", days=None, max_pages=None, max_ai=0, no_ai=True, sources=None)
    for _ in range(2):
        result = cli.run(tmp_path, args)
        assert [s.id for s in result.signals] == ([signal.id] if include_open else [])
        assert result.run["gemini_calls"] == result.run["sources_attempted"] == 0
        assert result.run["candidates_shortlisted"] == sum(s.prefilter_score >= 25 for s in result.signals)
        assert read_json(data / "source_state.json", {}) == checkpoints
        assert '"id":"awarded"' in (data / "signals.jsonl").read_text(encoding="utf-8")
        assert not any(is_award_intelligence(s) for s in cli.export(tmp_path).signals)
        published = read_json(tmp_path / "app/public/data/current.json", {})
        assert published["scoring_version"] == "none"
        for item in published["signals"]:
            assert not {"analysis", "fit_score", "confidence_score", "ai_status", "score_components", "recommendation"}.intersection(item)
            assert item["delivery_priority"] in {"platform", "ai", "other"}
        assert not {"gemini_calls", "candidates_shortlisted", "high_fit_signals"}.intersection(published["run"])

    # Exporting an older dataset must not reintroduce awards either.
    result.signals.extend([award, award.model_copy(update={"id": "inferred", "signal_type": "RENEWAL_SIGNAL", "status": "inferred", "related_signal_id": award.id})])
    atomic_json(data / "current.json", result.model_dump())
    assert [s.id for s in cli.export(tmp_path).signals] == ([signal.id] if include_open else [])


def test_sparse_award_alias_retires_a_prior_lead_even_without_keywords(tmp_path, signal, now, monkeypatch):
    shutil.copytree(Path(__file__).resolve().parents[2] / "config", tmp_path / "config")
    data = tmp_path / "data"
    data.mkdir()
    prior = signal.model_copy(update={"external_ids": ["buyer-ref:nyc:12345"]})
    (data / "signals.jsonl").write_text(prior.model_dump_json() + "\n", encoding="utf-8")
    award = prior.model_copy(update={"id": "new-award-id", "ocid": None, "title": "Award notification", "description": "Contract placed.", "cpv_codes": [], "signal_type": "AWARD", "procurement_stage": "award", "status": "awarded", "updated_at": now.isoformat(), "published_at": now.isoformat()})
    status = SourceHealth(id="nyc_city_record", name="NYC City Record", website="https://a856-cityrecord.nyc.gov", enabled=True, status="healthy")
    monkeypatch.setattr(cli, "_collect", lambda *args: ("nyc_city_record", [award], {}, status, 1))
    args = SimpleNamespace(command="ingest", days=None, max_pages=None, max_ai=0, no_ai=True, sources="nyc_city_record")
    result = cli.run(tmp_path, args)
    assert result.signals == []
    assert result.run["raw_records"] == 1
