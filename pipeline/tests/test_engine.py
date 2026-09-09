import copy
import json
from datetime import timedelta

import pytest
from pydantic import ValidationError

from anthrion_signal.cli import derive_renewals
from anthrion_signal.collectors import RawRecord
from anthrion_signal.dedupe import is_fuzzy_duplicate, merge, reconcile
from anthrion_signal.intelligence import cache_key, score, validate_grounding, provider_schema
from anthrion_signal.models import Analysis, Dataset
from anthrion_signal.normalise import NORMALISERS, normalise_ocds, set_hashes


def test_ocds_normalisation(release, source, signal, now):
    assert signal.title == release["tender"]["title"]
    assert signal.value_max == 250000
    assert signal.cpv_codes == ["72200000"]
    assert signal.deadline_at == "2026-10-01T12:00:00+00:00"
    assert signal.provenance[0].release_id == "001-2026"
    for sid in ("contracts_finder", "scotland", "wales"):
        alternate = {**source, "id": sid, "record_url": "https://example.gov.uk/{ocid}"}
        s = normalise_ocds(RawRecord(copy.deepcopy(release), alternate, now.isoformat()))
        assert s.buyer_name == "Example Council"
        assert s.raw_source_hash == signal.raw_source_hash


def test_all_non_ocds_normalisers(source, now):
    cases = {
        "govuk": {"title": "Digital procurement pipeline", "description": "CRM modernisation", "link": "/government/publications/pipeline", "public_timestamp": now.isoformat(), "organisations": [{"title": "Cabinet Office"}]},
        "html": {"id": "RM123", "title": "Digital outcomes", "description": "Implementation", "url": "https://www.gca.gov.uk/agreements/RM123", "buyer": "GCA", "stage": "planning", "signal_type": "FRAMEWORK"},
        "ted": {"publication-number": "123-2026", "notice-title": {"eng": "CRM delivery"}, "buyer-name": {"eng": ["Buyer"]}, "form-type": "competition", "publication-date": "20260909", "place-of-performance": ["DEU"], "classification-cpv": ["72200000"]},
    }
    for kind, data in cases.items():
        s = NORMALISERS[kind](RawRecord(data, source, now.isoformat(), kind))
        assert s.title
        assert s.primary_source_url.startswith("https://")
        assert s.content_hash
    assert NORMALISERS["ted"](RawRecord(cases["ted"], source, now.isoformat(), "ted")).countries == ["DE"]


def test_exact_dedupe_and_provenance(signal):
    second = signal.model_copy(deep=True)
    second.source = "contracts_finder"
    second.provenance[0].source = "contracts_finder"
    second.primary_source_url = "https://www.contractsfinder.service.gov.uk/Notice/1"
    second.source_urls = [second.primary_source_url]
    records, _, stats = reconcile([], [signal, second])
    assert len(records) == 1
    assert len(records[0].provenance) == 2
    assert len(records[0].source_urls) == 2
    assert stats["duplicates_merged"] == 1


def test_fuzzy_dedupe_requires_independent_anchors(signal):
    second = signal.model_copy(deep=True)
    second.title += "."
    second.source = "other"
    second.ocid = "ocds-other"
    assert is_fuzzy_duplicate(signal, second)
    second.deadline_at = None
    assert not is_fuzzy_duplicate(signal, second)
    second.deadline_at = signal.deadline_at
    second.value_max = 900000
    assert not is_fuzzy_duplicate(signal, second)


def test_separate_lots_never_merge(signal):
    other = signal.model_copy(deep=True)
    signal.lot_id, other.lot_id = "1", "2"
    other.id = "second"
    set_hashes(signal)
    set_hashes(other)
    records, _, _ = reconcile([], [signal, other])
    assert len(records) == 2
    assert not is_fuzzy_duplicate(signal, other)


def test_material_change_vs_cosmetic_and_old_updates(signal, analysis):
    signal.analysis = analysis
    newer = signal.model_copy(deep=True)
    newer.updated_at = "2026-09-09T10:00:00+00:00"
    _, changed = merge(signal, newer)
    assert not changed
    newer.deadline_at = "2026-10-10T12:00:00+00:00"
    result, changed = merge(signal, newer)
    assert changed and result.analysis is None
    assert "deadline_at" in result.changes[-1].fields
    older = signal.model_copy(deep=True)
    older.updated_at = "2026-08-01T00:00:00+00:00"
    older.title = "Old title"
    merged, _ = merge(signal, older)
    assert merged.title == signal.title


def test_score_and_confidence_math(signal, analysis, config, now):
    signal.analysis = analysis
    validate_grounding(analysis, signal, config["company_profile"])
    score(signal, config, now)
    # 30.625 capability + 9 references + 10 delivery + 10 sector + 5 geography + 10 timing.
    assert signal.known_weight == 85
    assert signal.fit_score == round(100 * 74.625 / 85, 1)
    assert next(c for c in signal.score_components if c.id == "commercial").points is None
    assert next(c for c in signal.score_components if c.id == "feasibility").known_weight == 0
    assert signal.confidence_score == 87.5  # 85*.7 + 100*.2 + 80*.1
    assert signal.recommendation == "PURSUE"


def test_unknown_requirement_weight_is_not_a_negative(signal, analysis, config, now):
    signal.analysis = analysis
    analysis.requirements[1].match_level = "UNKNOWN"
    score(signal, config, now)
    capability = signal.score_components[0]
    assert capability.known_weight == 17.5
    assert capability.points == 17.5


def test_pending_analysis_has_no_fabricated_fit(signal, config, now):
    score(signal, config, now)
    assert signal.fit_score is None
    assert signal.recommendation == "REVIEW"


def test_expired_cancelled_and_awarded_never_pursue(signal, analysis, config, now):
    signal.analysis = analysis
    signal.deadline_at = (now - timedelta(hours=1)).isoformat()
    assert score(signal, config, now).recommendation == "WATCH"
    signal.status = "cancelled"
    assert score(signal, config, now).recommendation == "LOW_PRIORITY"
    signal.status, signal.signal_type = "complete", "AWARD"
    assert score(signal, config, now).recommendation == "WATCH"


def test_grounding_rejects_invented_evidence_and_unknown_membership(signal, analysis, config):
    analysis.requirements[0].evidence.quote = "Unsupported invented claim"
    with pytest.raises(ValueError, match="Evidence quote"):
        validate_grounding(analysis, signal, config["company_profile"])
    analysis.requirements[0].evidence.quote = "Salesforce implementation"
    analysis.feasibility = analysis.delivery.model_copy(deep=True)
    with pytest.raises(ValueError, match="eligibility"):
        validate_grounding(analysis, signal, config["company_profile"])


def test_structured_output_rejects_extra_fields_and_bad_importance(analysis):
    data = analysis.model_dump()
    data["score"] = 99
    with pytest.raises(ValidationError):
        Analysis.model_validate(data)
    del data["score"]
    data["requirements"][0]["importance"] = 9
    with pytest.raises(ValidationError):
        Analysis.model_validate(data)
    assert "additionalProperties" not in json.dumps(provider_schema())


def test_cache_invalidation(signal, config):
    first = cache_key(signal, config)
    changed = copy.deepcopy(config)
    changed["company_profile"]["version"] += "new"
    assert cache_key(signal, changed) != first
    changed = copy.deepcopy(config)
    changed["scoring"]["version"] += "new"
    assert cache_key(signal, changed) != first
    changed = copy.deepcopy(config)
    changed["runtime"]["model"] = "another-model"
    assert cache_key(signal, changed) != first


def test_renewal_is_distinct_and_explicitly_inferred(signal, config, now):
    signal.signal_type = "AWARD"
    signal.contract_end = (now + timedelta(days=180)).isoformat()
    renewals = derive_renewals([signal], now, config)
    assert len(renewals) == 1
    assert renewals[0].related_signal_id == signal.id
    assert "not been confirmed" in renewals[0].renewal_basis
    signal.extension_end = (now + timedelta(days=700)).isoformat()
    assert derive_renewals([signal], now, config) == []


def test_public_schema_cannot_include_extra_credentials(config, signal, now):
    dataset = dict(generated_at=now.isoformat(), data_updated_at=now.isoformat(), profile_version="1", scoring_version="1",
                   run={}, sources=[], capabilities=[], markets={}, evidence_catalog={}, signals=[signal.model_dump()])
    assert Dataset.model_validate(dataset)
    dataset["GEMINI_API_KEY"] = "must-not-be-public"
    with pytest.raises(ValidationError):
        Dataset.model_validate(dataset)
