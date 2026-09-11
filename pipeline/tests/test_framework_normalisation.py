import copy
from datetime import UTC, datetime

import pytest

from anthrion_signal.collectors import RawRecord
from anthrion_signal.dedupe import reconcile
from anthrion_signal.discovery import is_public_opportunity
from anthrion_signal.normalise import normalise_ocds, set_hashes


FROZEN = datetime(2026, 9, 11, 15, tzinfo=UTC)
SOURCE = {"id": "find_tender", "name": "Find a Tender", "source_type": "official_notice",
          "country": "GB", "website": "https://www.find-tender.service.gov.uk"}
NOTICE_URL = "https://www.find-tender.service.gov.uk/Notice/086253-2026"


def vanguard_release():
    # Structural fields verified against the official record package on 11 Sep.
    # The description is shortened; it remains supplier instructions, not a name.
    return {
        "ocid": "ocds-h6vhtk-06ea20", "id": "086253-2026", "date": "2026-09-11T10:25:08+01:00",
        "tag": ["tender"], "buyer": {"name": "Vanguard Learning Trust"},
        "tender": {
            "title": "Invitation to submit a proposal for human resources information system (HRIS) and fully managed payroll service",
            "description": "Cloud-based HRIS and fully managed payroll for the trust.",
            "status": "active", "procurementMethod": "open",
            "procurementMethodDetails": "Below threshold - open competition",
            "techniques": {"hasFrameworkAgreement": True, "frameworkAgreement": {
                "method": "withAndWithoutReopeningCompetition", "type": "closed",
                "description": "Complete the supplier response columns and commercial template. "
                               "Responses will be evaluated using a scoring system."}},
            "documents": [{"id": "notice", "documentType": "tenderNotice", "noticeType": "UK4", "url": NOTICE_URL}],
        },
    }


def normalise(release):
    return normalise_ocds(RawRecord(release, SOURCE, FROZEN.isoformat()))


def test_published_framework_stays_open_but_freeform_description_is_not_its_name():
    release = vanguard_release()
    untouched = copy.deepcopy(release)
    signal = normalise(release)
    assert signal.framework == "Framework agreement"
    assert signal.signal_type == "FRAMEWORK"
    assert signal.status == "active"
    assert signal.procurement_stage == "tender"
    assert signal.description == release["tender"]["description"]
    assert signal.primary_source_url == NOTICE_URL
    assert is_public_opportunity(signal, FROZEN)
    assert release == untouched


@pytest.mark.parametrize("framework", [None, {}])
def test_explicit_framework_boolean_does_not_require_a_description(framework):
    release = vanguard_release()
    release["tender"]["techniques"]["frameworkAgreement"] = framework
    signal = normalise(release)
    assert signal.framework == "Framework agreement"
    assert signal.signal_type == "FRAMEWORK"


def test_explicit_nonframework_overrides_leftover_details_and_method_mentions():
    release = vanguard_release()
    release["tender"]["techniques"]["hasFrameworkAgreement"] = False
    release["tender"]["procurementMethodDetails"] = "Open competition, not a framework agreement"
    signal = normalise(release)
    assert signal.framework is None
    assert signal.signal_type == "LIVE_TENDER"
    assert is_public_opportunity(signal, FROZEN)


def test_legacy_framework_object_remains_supported_without_boolean():
    release = vanguard_release()
    del release["tender"]["techniques"]["hasFrameworkAgreement"]
    signal = normalise(release)
    assert signal.framework == "Framework agreement"
    assert signal.signal_type == "FRAMEWORK"


def test_method_description_is_not_used_as_compact_framework_label():
    release = vanguard_release()
    release["tender"]["techniques"] = None
    release["tender"]["procurementMethodDetails"] = "Framework agreement with multiple operators. Submit all required forms."
    signal = normalise(release)
    assert signal.framework == "Framework agreement"


def test_dynamic_market_notice_keeps_existing_compact_label():
    release = vanguard_release()
    release["tender"]["documents"][0]["noticeType"] = "UK14"
    signal = normalise(release)
    assert signal.framework == "Dynamic market"


def test_framework_award_is_not_reopened_by_label_correction():
    release = vanguard_release()
    release["tag"] = ["award"]
    release["tender"]["status"] = "awarded"
    signal = normalise(release)
    assert signal.framework == "Framework agreement"
    assert signal.signal_type == "AWARD"
    assert not is_public_opportunity(signal, FROZEN)


def test_renormalised_official_record_corrects_stored_label_with_existing_merge():
    release = vanguard_release()
    fresh = normalise(release)
    stored = fresh.model_copy(deep=True)
    stored.framework = release["tender"]["techniques"]["frameworkAgreement"]["description"]
    set_hashes(stored)
    result, _, stats = reconcile([stored], [fresh])
    assert len(result) == 1
    assert result[0].id == stored.id
    assert result[0].framework == "Framework agreement"
    assert result[0].signal_type == "FRAMEWORK"
    assert stats["new_signals"] == 0
    assert stats["material_updates"] == 1
