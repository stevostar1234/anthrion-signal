from datetime import timedelta
from pathlib import Path

import httpx
import pytest

from anthrion_signal.collectors import Http, RawRecord, SourceUnavailable, reconstruct_notice
from anthrion_signal.dedupe import reconcile
from anthrion_signal.intelligence import analyse_candidates, score, validate_grounding
from anthrion_signal.normalise import set_hashes, normalise_ocds, classify
from anthrion_signal.retention import archive_expired, read_archive, restore_matching
from anthrion_signal.utils import atomic_json, read_json, iso


def test_atomic_publication_retries_windows_read_lock(tmp_path, monkeypatch):
    path = tmp_path / "current.json"
    path.write_text('{"old":true}', encoding="utf-8")
    replace = Path.replace
    calls = []
    def locked_then_released(self, target):
        calls.append(target)
        if len(calls) < 3:
            raise PermissionError("Simulated sharing violation")
        return replace(self, target)
    monkeypatch.setattr(Path, "replace", locked_then_released)
    monkeypatch.setattr("anthrion_signal.utils.time.sleep", lambda _: None)
    assert atomic_json(path, {"new": True})
    assert read_json(path, {}) == {"new": True}
    assert len(calls) == 3
    assert not list(tmp_path.glob("*.tmp"))
    assert not atomic_json(path, {"new": True})


def test_ted_calendar_date_timezone_is_not_misread_as_time():
    assert iso("2026-09-07+02:00") == "2026-09-06T22:00:00+00:00"


def test_distinct_same_source_ocids_do_not_merge_on_reused_reference(signal):
    other = signal.model_copy(deep=True)
    other.id, other.ocid = "distinct-procurement", "ocds-different-family"
    records, _, _ = reconcile([], [signal, other])
    assert len(records) == 2


def test_sparse_cancellation_uses_known_family_scope(signal, source, now, config):
    raw = RawRecord({"id": "cancel-2026", "ocid": signal.ocid, "date": now.isoformat(),
                     "tag": ["tenderCancellation"], "tender": {"status": "cancelled"}}, source, now.isoformat())
    update = normalise_ocds(raw, prior=signal)
    assert update.title == signal.title
    assert update.status == "cancelled"
    assert update.provenance[0].release_id == "cancel-2026"
    merged, _, _ = reconcile([signal], [update])
    assert score(merged[0], config, now).recommendation == "LOW_PRIORITY"
    assert classify("planning", "Case management RFI", "") == "RFI"


def test_lot_only_scope_does_not_grow_on_repeated_collection(release, source, now):
    release["tender"]["description"] = ""
    release["tender"]["lots"] = [{"id": "1", "title": "Delivery", "description": "CRM implementation"}]
    raw = RawRecord(release, source, now.isoformat())
    first = normalise_ocds(raw)
    second = normalise_ocds(raw, prior=first)
    assert first.description == second.description
    assert first.content_hash == second.content_hash


def test_archive_preserves_provenance_and_restores_updates(signal, now, tmp_path):
    signal.updated_at = (now - timedelta(days=220)).isoformat()
    signal.deadline_at = (now - timedelta(days=190)).isoformat()
    set_hashes(signal)
    active = signal.model_copy(deep=True)
    active.id, active.ocid = "active", "ocds-active"
    active.deadline_at = (now + timedelta(days=10)).isoformat()
    set_hashes(active)
    assert [s.id for s in archive_expired(tmp_path, [signal, active], now, 180)] == ["active"]
    month = signal.updated_at[:7]
    assert read_archive(tmp_path, month)[signal.id].provenance == signal.provenance
    incoming = signal.model_copy(deep=True)
    incoming.updated_at = now.isoformat()
    restored = restore_matching(tmp_path, [incoming], set())
    assert len(restored) == 1
    merged, _, _ = reconcile(restored, [incoming])
    assert merged[0].first_seen_at == signal.first_seen_at
    assert len(archive_expired(tmp_path, merged, now, 180)) == 1
    with pytest.raises(ValueError):
        read_archive(tmp_path, "../private")


def test_official_record_reconstruction_checks_ocid(source, release):
    source = {**source, "record_url": "https://example.gov.uk/record/{ocid}"}
    http = Http(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"records": [{"compiledRelease": release}]})), sleeper=lambda _: None)
    assert reconstruct_notice(source, release["ocid"], http) == [release]
    with pytest.raises(SourceUnavailable):
        reconstruct_notice(source, "ocds-another", http)
    with pytest.raises(SourceUnavailable):
        reconstruct_notice(source, "../../private", http)


def test_expired_early_engagement_is_not_actionable(signal, analysis, config, now):
    signal.analysis = analysis
    signal.signal_type, signal.procurement_stage = "RFI", "planning"
    signal.deadline_at = (now - timedelta(hours=1)).isoformat()
    assert score(signal, config, now).recommendation == "WATCH"


def test_delivery_evidence_cannot_borrow_geography_points(signal, analysis, config):
    analysis.delivery.company_evidence_ids = ["geographies"]
    with pytest.raises(ValueError, match="own profile dimension"):
        validate_grounding(analysis, signal, config["company_profile"])


def test_unavailable_ai_client_does_not_break_collection(signal, config, now, tmp_path, monkeypatch):
    signal.prefilter_score = 100
    monkeypatch.setenv("GEMINI_API_KEY", "synthetic-test-key")
    config["runtime"]["model"] = "test-model"
    def unavailable(**_):
        raise ValueError("Unavailable client")
    monkeypatch.setattr("anthrion_signal.intelligence.genai.Client", unavailable)
    stats = analyse_candidates([signal], config, tmp_path, now)
    assert stats["ai_failures"] == 1
    assert signal.analysis is None and signal.fit_score is None
    assert signal.ai_status == "failed"
