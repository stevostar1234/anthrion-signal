import io
import json
from datetime import UTC, datetime
from zipfile import ZipFile

import httpx
import pytest

from anthrion_signal.collectors import Http, RawRecord, SourceUnavailable
from anthrion_signal.german_notices import (
    archive_files,
    collect_german_notices,
    enrich_release,
    normalise_german_notice,
    relevant_release,
)


IDENTIFIER = "f2c07763-c9f4-4041-ab50-8c12f0e8e6eb"
OCID = "ocds-mnwr74-f5c14b56-5b1b-43fb-9de8-b86cd27b9857"
SOURCE = {
    "id": "germany", "name": "German Procurement Notices", "country": "DE",
    "source_type": "official_notice", "url": "https://oeffentlichevergabe.de/api/notice-exports",
    "website": "https://oeffentlichevergabe.de", "initial_lookback_days": 2,
    "record_url": "https://oeffentlichevergabe.de/ui/de/notices/{ocid}",
}
FROZEN = datetime(2026, 9, 11, 12, tzinfo=UTC)


def ocds(identifier=IDENTIFIER, award=False):
    return {
        "ocid": OCID, "id": identifier, "date": "2026-09-10T00:00:00+02:00",
        "tag": ["award" if award else "tender"],
        "buyer": {"id": "buyer-1", "name": "Example German Authority"},
        "tender": {"id": "internal-2026", "title": "CRM platform implementation",
                   "description": "Delivery and integration of a customer relationship management platform.",
                   "lots": [{"id": "LOT-0001", "title": "CRM"}],
                   "items": [{"classification": {"scheme": "CPV", "id": "72200000"}}]},
    }


def eforms(identifier=IDENTIFIER, award=False, version="01", extra="", second_deadline=""):
    root = "ContractAwardNotice" if award else "ContractNotice"
    another_lot = "" if not second_deadline else f"""
      <cac:ProcurementProjectLot><cbc:ID>LOT-0002</cbc:ID><cac:TenderingProcess>
        <cac:TenderSubmissionDeadlinePeriod><cbc:EndDate>{second_deadline}+02:00</cbc:EndDate>
          <cbc:EndTime>10:00:00+02:00</cbc:EndTime></cac:TenderSubmissionDeadlinePeriod>
      </cac:TenderingProcess></cac:ProcurementProjectLot>"""
    return f"""<{root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:{root}-2"
      xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
      xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
      <cbc:ID>{identifier}</cbc:ID><cbc:VersionID>{version}</cbc:VersionID>
      <cbc:NoticeTypeCode>{'can-standard' if award else 'cn-standard'}</cbc:NoticeTypeCode>
      <cac:ProcurementProject><cbc:ID>original-buyer-reference</cbc:ID></cac:ProcurementProject>
      {extra}
      <cac:ProcurementProjectLot><cbc:ID>LOT-0001</cbc:ID><cac:TenderingProcess>
        <cac:TenderSubmissionDeadlinePeriod><cbc:EndDate>2026-10-15+02:00</cbc:EndDate>
          <cbc:EndTime>10:00:00+02:00</cbc:EndTime></cac:TenderSubmissionDeadlinePeriod>
        <cac:ContractingSystem><cbc:ContractingSystemTypeCode listName="framework-agreement">fa-w-rc</cbc:ContractingSystemTypeCode></cac:ContractingSystem>
      </cac:TenderingProcess></cac:ProcurementProjectLot>{another_lot}
    </{root}>""".encode()


def zipped(files):
    stream = io.BytesIO()
    with ZipFile(stream, "w") as archive:
        for filename, content in files.items():
            archive.writestr(filename, content)
    return stream.getvalue()


def exported_pair():
    stem = IDENTIFIER + "-01"
    return {
        "ocds.zip": zipped({stem + ".json": json.dumps({"releases": [ocds()]})}),
        "eforms.zip": zipped({stem + ".xml": eforms()}),
    }


def test_deadline_framework_source_url_and_ted_identifier_are_preserved():
    release = enrich_release(ocds(), eforms(), IDENTIFIER + "-01")
    assert release["tender"]["tenderPeriod"]["endDate"] == "2026-10-15T08:00:00+00:00"
    assert release["tender"]["lots"][0]["tenderPeriod"]["endDate"] == "2026-10-15T08:00:00+00:00"
    signal = normalise_german_notice(RawRecord(release, SOURCE, FROZEN.isoformat(), "german_ocds"))
    assert signal.ocid == OCID
    assert signal.signal_type == "FRAMEWORK"
    assert signal.framework == "Framework agreement"
    assert signal.countries == ["DE"]
    assert signal.primary_source_url == f"https://oeffentlichevergabe.de/ui/de/notices/{IDENTIFIER}"
    assert "ted-notice:" + IDENTIFIER in signal.external_ids
    assert "buyer-ref:example german authority:original-buyer-reference" in signal.external_ids


def test_mixed_lot_deadlines_are_conservative_and_retained():
    release = ocds()
    release["tender"]["lots"].append({"id": "LOT-0002"})
    enriched = enrich_release(release, eforms(second_deadline="2026-10-12"), IDENTIFIER + "-01")
    assert enriched["tender"]["tenderPeriod"]["endDate"].startswith("2026-10-12")
    assert enriched["tender"]["lots"][0]["tenderPeriod"]["endDate"].startswith("2026-10-15")
    assert "earliest" in enriched["tender"]["eligibilityCriteria"]


def test_result_notice_keeps_procedure_identity_and_is_not_a_live_lead():
    award_id = "75f5d711-681f-4628-b70c-45d8a671ed0d"
    reference = f"<cac:NoticeDocumentReference><cbc:ID>{IDENTIFIER}-01</cbc:ID></cac:NoticeDocumentReference>"
    awarded = enrich_release(ocds(award_id, award=True), eforms(award_id, award=True, extra=reference), award_id + "-01")
    signal = normalise_german_notice(RawRecord(awarded, SOURCE, FROZEN.isoformat(), "german_ocds"))
    assert signal.signal_type == "AWARD"
    assert signal.ocid == OCID
    assert "ted-notice:" + IDENTIFIER in signal.external_ids
    assert "ted-notice:" + award_id in signal.external_ids


def test_versions_share_signal_identity_but_not_release_id():
    first = enrich_release(ocds(), eforms(), IDENTIFIER + "-01")
    second = enrich_release(ocds(), eforms(version="02"), IDENTIFIER + "-02")
    records = [normalise_german_notice(RawRecord(data, SOURCE, FROZEN.isoformat())) for data in (first, second)]
    assert records[0].id == records[1].id
    assert records[0].provenance[0].release_id != records[1].provenance[0].release_id


def test_national_numeric_notice_identifier_is_not_claimed_as_a_ted_notice():
    release = enrich_release(ocds("25772216"), eforms("25772216", version="1"), "25772216-1")
    signal = normalise_german_notice(RawRecord(release, SOURCE, FROZEN.isoformat()))
    assert signal.primary_source_url == "https://oeffentlichevergabe.de/ui/de/notices/25772216"
    assert not any(value.startswith("ted-notice:") for value in signal.external_ids)


def test_collection_is_latest_first_bounded_and_resumes_backlog():
    requests = []
    pair = exported_pair()
    def handler(request):
        requests.append((request.url.params["pubDay"], request.url.params["format"]))
        return httpx.Response(200, content=pair[request.url.params["format"]])
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_german_notices(SOURCE, {}, FROZEN, http, {"max_pages": 2, "lookback_days": 7}, {})
    assert requests == [("2026-09-10", "ocds.zip"), ("2026-09-10", "eforms.zip")]
    assert result.pages == 2 and len(result.records) == 1
    assert not result.complete
    assert result.state["pending_days"] == ["2026-09-09"]
    next_result = collect_german_notices(SOURCE, result.state, FROZEN, http, {"max_pages": 2, "lookback_days": 7}, {})
    assert next_result.complete and next_result.state["pending_days"] == []
    assert requests[-1] == ("2026-09-09", "eforms.zip")
    empty = collect_german_notices(SOURCE, next_result.state, FROZEN, http, {"max_pages": 2, "lookback_days": 7}, {})
    assert empty.pages == 0 and empty.complete
    http.close()


def test_failed_second_format_does_not_advance_or_publish_partial_day():
    pair = exported_pair()
    def handler(request):
        return httpx.Response(404) if request.url.params["format"] == "eforms.zip" else httpx.Response(200, content=pair["ocds.zip"])
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_german_notices(SOURCE, {}, FROZEN, http, {"max_pages": 6, "lookback_days": 7}, {})
    assert not result.complete and not result.records
    assert "watermark" not in result.state
    assert result.state["pending_days"] == ["2026-09-10", "2026-09-09"]
    http.close()


def test_small_request_budget_makes_no_requests():
    http = Http(transport=httpx.MockTransport(lambda _: pytest.fail("No request budget")), sleeper=lambda _: None)
    result = collect_german_notices(SOURCE, {}, FROZEN, http, {"max_pages": 1, "lookback_days": 7}, {})
    assert result.pages == 0 and not result.complete
    http.close()


def test_tracked_procedure_updates_survive_missing_cpv_and_title():
    record = ocds(award=True)
    record["tender"] = {"title": "Contract awarded"}
    assert relevant_release(record, {}, {OCID})
    assert relevant_release(record, {}, set())


def test_result_xml_cannot_be_published_as_live_even_if_ocds_tag_is_incomplete():
    from anthrion_signal.discovery import is_public_opportunity
    release = enrich_release(ocds(), eforms(award=True), IDENTIFIER + "-01")
    signal = normalise_german_notice(RawRecord(release, SOURCE, FROZEN.isoformat()))
    assert signal.signal_type == "AWARD"
    assert not is_public_opportunity(signal, FROZEN)


def test_portal_hostname_is_not_a_salesforce_requirement():
    record = ocds()
    record["tender"] = {"title": "Building work", "description": "Apply at https://buyer.my.salesforce.com"}
    assert not relevant_release(record, {"high_intent": ["salesforce"]}, set())


@pytest.mark.parametrize("filename,content", [("../escape.json", b"{}"), ("unexpected.txt", b"{}")])
def test_unsafe_archive_members_are_rejected(filename, content):
    with pytest.raises(SourceUnavailable):
        archive_files(zipped({filename: content}), ".json")


def test_invalid_zip_and_xml_entities_are_rejected():
    with pytest.raises(SourceUnavailable):
        archive_files(b"not a zip", ".json")
    with pytest.raises(SourceUnavailable):
        enrich_release(ocds(), b'<!DOCTYPE x [<!ENTITY x "ab">]><x/>', IDENTIFIER + "-01")


def test_format_pair_mismatch_is_rejected():
    with pytest.raises(SourceUnavailable):
        enrich_release(ocds(), eforms(), IDENTIFIER + "-02")
