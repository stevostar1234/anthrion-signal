from datetime import timedelta
from types import SimpleNamespace

import httpx
import pytest

from anthrion_signal import cli
from anthrion_signal.collectors import Http, collect_govuk, collect_with_backfill
from anthrion_signal.discovery import lifecycle, prefilter, ranking_key
from anthrion_signal.intelligence import analyse_candidates, cache_key, candidate_queue, retry_delay, score, validate_grounding
from anthrion_signal.utils import atomic_json


@pytest.mark.parametrize("title,description", [
    ("Salesforce implementation", "A partner to implement Salesforce Sales Cloud."),
    ("Customer relationship management", "Procurement of a vendor-neutral CRM platform."),
    ("Unified customer service", "A contact centre platform with a single customer view."),
    ("Case management platform", "Case management workflows and a public portal."),
    ("Enterprise AI agents", "Knowledge retrieval and artificial intelligence assistants."),
    ("Generative AI service assistant", "A generative AI assistant for customer enquiries."),
    ("API management", "API management and integration of legacy systems."),
    ("Customer data platform", "Master data management and data quality for a single customer view."),
    ("Marketing automation", "Customer journeys and campaign management."),
    ("Field service management", "A field service platform for mobile workforce scheduling."),
    ("New CRM platform", "We use SAP ERP; we require a new CRM platform."),
    ("New CRM platform", "Our existing Microsoft estate needs a new CRM solution."),
    ("CRM procurement", "Dynamics 365, Salesforce or equivalent platforms may be proposed."),
    ("AI assistant", "An AI assistant integrated into our Dynamics 365 estate."),
    ("Verwaltung", "Beschaffung eines Systems für Kundenbeziehungsmanagement und Fallmanagement."),
    ("Piattaforma digitale", "Servizi di intelligenza artificiale e integrazione sistemi."),
    ("Servicios digitales", "Plataforma de gestión de expedientes y atención ciudadana."),
    ("Πλατφόρμα", "Υπηρεσίες τεχνητής νοημοσύνης και διαχείριση αιτημάτων."),
    ("Tjänsteplattform", "Ärendehanteringssystem med artificiell intelligens."),
])
def test_independent_needs_and_languages_surface_candidates(signal, config, title, description):
    signal.title, signal.description, signal.cpv_codes = title, description, []
    prefilter([signal], config["company_profile"], config["search_terms"], config["capabilities"])
    assert signal.prefilter_score >= 25
    assert signal.discovery_families
    assert not signal.exclusion_reasons


@pytest.mark.parametrize("text", ["Apex catering services", "AI road resurfacing", "Digital consulting services", "Cloud service", "Annual maintenance of chairs"])
def test_generic_or_ambiguous_words_do_not_prove_fit(signal, config, text):
    signal.title, signal.description, signal.cpv_codes = text, "", []
    prefilter([signal], config["company_profile"], config["search_terms"], config["capabilities"])
    assert signal.prefilter_score < 25


@pytest.mark.parametrize("title,description", [
    ("Permanent Salesforce employee", "A permanent employee vacancy for a Salesforce administrator."),
    ("Construction materials", "Supply of construction materials and bricks."),
    ("Dynamics implementation", "Microsoft Dynamics 365 only: no alternative platforms will be considered."),
])
def test_explicit_non_supplier_or_incompatible_scope_is_excluded(signal, config, title, description):
    signal.title, signal.description, signal.cpv_codes = title, description, []
    prefilter([signal], config["company_profile"], config["search_terms"], config["capabilities"])
    assert signal.exclusion_reasons
    assert signal.prefilter_score == 0


def test_contract_staff_are_not_treated_as_permanent_vacancies(signal, config):
    signal.title = "Salesforce contract staffing"
    signal.description = "Supplier to provide contract staffing for Salesforce implementation alongside permanent employees."
    prefilter([signal], config["company_profile"], config["search_terms"], config["capabilities"])
    assert not signal.exclusion_reasons


def test_eligibility_value_and_geography_never_change_technical_fit(signal, analysis, config, now):
    signal.analysis = analysis
    original = score(signal, config, now).fit_score
    signal.countries = ["US"]
    signal.currency, signal.value_max = "USD", 10
    config["company_profile"]["references"] = []
    score(signal, config, now)
    assert signal.fit_score == original
    assert signal.analysis.eligibility_checks[0].status == "CHECK_REQUIRED"


def test_sparse_scope_cannot_trigger_pursue_or_invent_full_confidence(signal, analysis, config, now):
    signal.analysis = analysis
    signal.description = "Salesforce implementation and systems integration. Framework membership must be confirmed."
    score(signal, config, now)
    assert signal.fit_score == 94
    assert signal.analysis.requirements_completeness == "SPARSE"
    assert signal.confidence_score == 73.8
    assert signal.recommendation == "REVIEW"


def test_goods_catalogue_does_not_prove_implementation(signal, analysis, config):
    signal.description += " Software catalogue."
    analysis.delivery.opportunity_evidence[0].quote = "Software catalogue"
    with pytest.raises(ValueError, match="explicit implementation"):
        validate_grounding(analysis, signal, config)


def test_partial_scope_is_review_only_and_does_not_earn_full_route_points(signal, analysis, config, now):
    signal.analysis = analysis
    analysis.scope_basis = "PARTIAL_OR_UNCERTAIN"
    score(signal, config, now)
    assert signal.score_components[1].points == 15
    assert signal.recommendation == "REVIEW"


def test_analysis_queue_shares_budget_across_markets(signal):
    rows = [signal.model_copy(update={"id": str(i), "countries": ["IT"], "lifecycle_state": "OPEN", "prefilter_score": 100}) for i in range(8)]
    rows += [signal.model_copy(update={"id": "uk", "countries": ["GB"], "lifecycle_state": "OPEN", "prefilter_score": 40})]
    assert [s.id for s in list(candidate_queue(rows))[:2]] == ["uk", "0"]


def test_only_explicit_short_provider_retry_delays_are_retried():
    details = {"error": {"details": [{"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "30s"}]}}
    assert retry_delay(SimpleNamespace(details=details)) == 31
    details["error"]["details"].append({"violations": [{"quotaId": "GenerateRequestsPerDay"}]})
    assert retry_delay(SimpleNamespace(details=details)) is None
    assert retry_delay(SimpleNamespace(details={})) is None


def test_mapping_none_is_not_removed_and_duplicates_are_rejected(signal, analysis, config, now):
    analysis.requirements[1].match_level = "NONE"
    signal.analysis = analysis
    assert score(signal, config, now).fit_score == 70
    analysis.requirements.append(analysis.requirements[0].model_copy(deep=True))
    with pytest.raises(ValueError, match="Duplicate"):
        validate_grounding(analysis, signal, config)


def test_stale_cache_is_invalidated_even_when_no_ai_budget(signal, analysis, config, now, tmp_path):
    signal.analysis, signal.analysis_cache_key, signal.fit_score = analysis, "old-rubric-key", 99
    config["runtime"]["max_ai_calls"] = 0
    stats = analyse_candidates([signal], config, tmp_path, now)
    assert stats["gemini_calls"] == 0
    assert signal.analysis is None and signal.fit_score is None


def test_retired_model_cache_is_not_republished(signal, analysis, config, now, tmp_path, monkeypatch):
    signal.prefilter_score = 90
    key = cache_key(signal, config)
    atomic_json(tmp_path / "data" / "ai_cache" / f"{key}.json", {"analysis": analysis.model_dump(), "at": now.isoformat()})
    config["runtime"]["max_ai_calls"] = 0
    stats = analyse_candidates([signal], config, tmp_path, now)
    assert stats["cache_hits"] == 0
    assert signal.analysis is None


@pytest.mark.parametrize("status,kind,stage,deadline,expected", [
    ("active", "LIVE_TENDER", "tender", 2, "OPEN"),
    ("unknown", "LIVE_TENDER", "tender", None, "UNKNOWN"),
    ("active", "RFI", "planning", -1, "EXPIRED"),
    ("active", "RFI", "planning", 2, "EARLY_ENGAGEMENT"),
    ("planned", "PIPELINE", "planning", None, "FUTURE"),
    ("active", "AWARD", "award", 10, "AWARDED"),
    ("closed", "FRAMEWORK", "tender", 10, "CLOSED"),
    ("cancelled", "LIVE_TENDER", "tender", 10, "CANCELLED"),
    ("withdrawn", "LIVE_TENDER", "tender", 10, "WITHDRAWN"),
])
def test_lifecycle_precedes_conflicting_deadlines(signal, now, status, kind, stage, deadline, expected):
    signal.status, signal.signal_type, signal.procurement_stage = status, kind, stage
    signal.deadline_at = (now + timedelta(days=deadline)).isoformat() if deadline is not None else None
    assert lifecycle(signal, now)[0] == expected


def test_source_order_is_delivery_priority_then_recency_without_model_scores(signal, now):
    crm_old = signal.model_copy(update={"id": "crm-old", "delivery_priority": "platform", "published_at": "2026-09-01", "fit_score": None})
    crm_ai = signal.model_copy(update={"id": "crm-ai", "delivery_priority": "platform", "published_at": "2026-09-07", "discovery_families": ["crm", "ai"]})
    ai = signal.model_copy(update={"id": "ai", "delivery_priority": "ai", "published_at": "2026-09-09", "fit_score": 100})
    ai_old = signal.model_copy(update={"id": "ai-old", "delivery_priority": "ai", "published_at": "2026-09-03", "prefilter_score": 100})
    other = signal.model_copy(update={"id": "other", "delivery_priority": "other", "published_at": "2026-09-09"})
    assert [s.id for s in sorted([ai_old, other, crm_old, ai, crm_ai], key=lambda s: ranking_key(s, now))] == ["crm-ai", "crm-old", "ai", "ai-old", "other"]


def test_query_rotation_does_not_starve_later_families(source, config, now):
    calls = []
    def handler(request):
        calls.append(request.url.params["q"])
        return httpx.Response(200, json={"results": [], "total": 0})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    state, terms = {}, {"govuk_queries": ["CRM procurement", "AI tender", "case management"]}
    for _ in range(3):
        result = collect_govuk(source, state, now, http, {**config["runtime"], "max_pages": 1}, terms)
        state = result.state
    assert calls == terms["govuk_queries"]
    assert result.complete
    assert state["watermark"] == now.isoformat()


def test_backfill_checkpoint_is_separate_from_fresh_collection(source, config, now):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"releases": []})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    state = {"watermark": (now - timedelta(hours=1)).isoformat()}
    result = collect_with_backfill(source, state, now, http, {**config["runtime"], "max_pages": 8}, config["search_terms"], config["capabilities"])
    assert result.state["watermark"] == now.isoformat()
    assert result.state["discovery_backfill"]["cursor"] < (now - timedelta(days=300)).isoformat()
    assert result.state["discovery_backfill"]["cursor"] != result.state["watermark"]
    assert result.pages <= 8
    assert "discovery_backfill" not in state


def test_rescore_never_fetches_sources_or_changes_checkpoints(tmp_path, signal, config, now, monkeypatch):
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    import shutil
    shutil.copytree(root / "config", tmp_path / "config")
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "signals.jsonl").write_text(signal.model_dump_json() + "\n", encoding="utf-8")
    checkpoint = {"find_tender": {"watermark": now.isoformat()}}
    atomic_json(tmp_path / "data" / "source_state.json", checkpoint)
    def forbidden(*args, **kwargs):
        raise AssertionError("Rescore must not call a collector")
    monkeypatch.setattr(cli, "_collect", forbidden)
    result = cli.run(tmp_path, SimpleNamespace(command="rescore", days=None, max_pages=None, max_ai=0, no_ai=True, sources=None))
    assert result.schema_version == "2.0"
    assert result.signals[0].id == signal.id
    assert result.run["sources_attempted"] == 0
    from anthrion_signal.utils import read_json
    assert read_json(tmp_path / "data" / "source_state.json", {}) == checkpoint
