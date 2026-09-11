from datetime import UTC, datetime, timedelta

import httpx
import pytest

from anthrion_signal.collectors import Http, RawRecord, SourceUnavailable
from anthrion_signal.dedupe import reconcile
from anthrion_signal.discovery import is_public_opportunity
from anthrion_signal.spain_notices import (
    FEED_URL,
    NS,
    collect_spain_notices,
    normalise_spain_notice,
    parse_placsp_page,
    relevant_placsp_record,
    submission_deadline,
)


FROZEN = datetime(2026, 9, 11, 12, tzinfo=UTC)
SOURCE = {"id": "spain", "name": "Spanish Procurement Notices", "source_type": "official_notice",
          "url": FEED_URL, "country": "ES", "initial_lookback_days": 7}
ARCHIVE = "https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3_20260911_120000.atom"
OLDER = ARCHIVE.replace(".atom", "_1.atom")
NEW_ARCHIVE = ARCHIVE.replace("20260911", "20260912")


def entry(ident="123", state="PUB", updated="2026-09-11T11:00:00+00:00", deadline="2026-10-15",
          clock="12:00:00", cpv="72200000", title="CRM implementation", extra="", procedure="1", system="0"):
    return f"""<a:entry>
      <a:id>https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/{ident}</a:id>
      <a:updated>{updated}</a:updated><a:link href="https://contrataciondelestado.es/wps/poc?idEvl={ident}"/>
      <ext:ContractFolderStatus><cbc:ContractFolderID>REF-{ident}</cbc:ContractFolderID>
        <ebc:ContractFolderStatusCode>{state}</ebc:ContractFolderStatusCode>
        <ext:LocatedContractingParty><cac:Party><cac:PartyName><cbc:Name>Example Spanish Authority</cbc:Name>
          </cac:PartyName><cac:PartyIdentification><cbc:ID>BUYER-1</cbc:ID></cac:PartyIdentification>
        </cac:Party></ext:LocatedContractingParty>
        <cac:ProcurementProject><cbc:Name>{title}</cbc:Name><cbc:Description>CRM delivery and integration.</cbc:Description>
          <cac:RequiredCommodityClassification><cbc:ItemClassificationCode>{cpv}</cbc:ItemClassificationCode>
          </cac:RequiredCommodityClassification><cac:BudgetAmount>
          <cbc:EstimatedOverallContractAmount currencyID="EUR">500000</cbc:EstimatedOverallContractAmount>
          </cac:BudgetAmount></cac:ProcurementProject>
        <cac:TenderingProcess><cbc:ProcedureCode>{procedure}</cbc:ProcedureCode>
          <cbc:ContractingSystemCode>{system}</cbc:ContractingSystemCode>
          <cac:TenderSubmissionDeadlinePeriod><cbc:EndDate>{deadline}</cbc:EndDate><cbc:EndTime>{clock}</cbc:EndTime>
          </cac:TenderSubmissionDeadlinePeriod></cac:TenderingProcess>{extra}
      </ext:ContractFolderStatus></a:entry>"""


def page(entries="", next_url=None, updated="2026-09-11T12:00:00+00:00", tombstones=""):
    namespaces = " ".join(f'xmlns:{key}="{value}"' for key, value in NS.items())
    link = f'<a:link rel="next" href="{next_url}"/>' if next_url else ""
    return f'<a:feed {namespaces}><a:updated>{updated}</a:updated>{link}{tombstones}{entries}</a:feed>'.encode()


def withdraw(ident="123", updated="2026-09-11T12:00:00+00:00"):
    return f'<at:deleted-entry ref="https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/{ident}" when="{updated}"/>'


def signal_from(xml):
    record = parse_placsp_page(page(xml))["records"][0]
    return normalise_spain_notice(RawRecord(record, SOURCE, FROZEN.isoformat(), "spain_placsp"))


@pytest.mark.parametrize("state,status,available", [
    ("PRE", "published", True), ("PUB", "active", True), ("EV", "closed", False),
    ("ADJ", "awarded", False), ("RES", "closed", False), ("ANUL", "cancelled", False),
])
def test_official_lifecycle_codes_control_availability(state, status, available):
    signal = signal_from(entry(state=state))
    assert signal.status == status
    assert is_public_opportunity(signal, FROZEN) is available


def test_native_identity_source_and_budget_are_preserved_without_fake_ocid():
    signal = signal_from(entry())
    assert signal.ocid is None
    assert "placsp:123" in signal.external_ids
    assert "buyer-ref:example spanish authority:REF-123" in signal.external_ids
    assert signal.buyer_identifiers == ["BUYER-1"]
    assert signal.countries == ["ES"]
    assert signal.value_max == 500000
    assert signal.currency == "EUR"
    assert "idEvl=123" in signal.primary_source_url
    assert signal.id == signal_from(entry(state="ADJ")).id


@pytest.mark.parametrize("day,clock,expected", [
    ("2026-10-15", "12:00:00", None),
    ("2026-10-15", "", None),
    ("2026-10-15", "12:00:00+02:00", "2026-10-15T10:00:00+00:00"),
    ("2026-10-15+02:00", "12:00:00", "2026-10-15T10:00:00+00:00"),
    ("2026-10-15Z", "12:00:00+02:00", None),
    ("2026-02-30", "12:00:00Z", None),
])
def test_deadline_requires_a_real_source_offset(day, clock, expected):
    assert submission_deadline(day, clock) == expected


def test_timezone_free_deadline_stays_visible_without_fabricated_midnight():
    signal = signal_from(entry())
    assert signal.deadline_at is None
    assert "2026-10-15 12:00:00" in signal.description
    assert "Time zone not supplied" in signal.description


@pytest.mark.parametrize("procedure,system,kind,status", [
    ("1", "1", "FRAMEWORK", "active"), ("1", "2", "FRAMEWORK", "active"),
    ("3", "0", "LIVE_TENDER", "closed"), ("7", "3", "LIVE_TENDER", "closed"),
    ("12", "4", "LIVE_TENDER", "closed"),
])
def test_framework_admission_is_not_confused_with_closed_supplier_calloffs(procedure, system, kind, status):
    signal = signal_from(entry(procedure=procedure, system=system))
    assert signal.signal_type == kind
    assert signal.status == status


def test_lot_result_is_not_a_fresh_whole_procedure_opportunity():
    signal = signal_from(entry(extra="<cac:TenderResult><cbc:ResultCode>8</cbc:ResultCode></cac:TenderResult>"))
    assert not is_public_opportunity(signal, FROZEN)
    assert "remaining open lots" in signal.exclusion_reasons[0]


def test_exact_ted_document_reference_joins_the_procedure():
    signal = signal_from(entry(extra="<cac:DocumentReference><cbc:URI>https://ted.europa.eu/en/notice/-/detail/123456-2026</cbc:URI></cac:DocumentReference>"))
    assert "ted:123456-2026" in signal.external_ids


def test_terminal_updates_retained_without_it_keywords():
    record = parse_placsp_page(page(entry(state="ADJ", cpv="45000000", title="Road works")))["records"][0]
    record["description"] = "Road works"
    assert relevant_placsp_record(record, {})
    record["state"] = "PUB"
    assert not relevant_placsp_record(record, {})


@pytest.mark.parametrize("xml", [
    b'<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><foo>&x;</foo>',
    page(entry()).decode().encode("utf-16"),
    b"<html>Temporary failure</html>",
    page(entry(state="NEW_CODE")),
    page(entry(), next_url="https://evil.example/feed.atom"),
    page(entry(), next_url=ARCHIVE + "?redirect=evil"),
    page(entry(updated="2026-09-11T10:00:00Z") + entry("124", updated="2026-09-11T11:00:00Z")),
    page(entry(updated="2026-09-12T11:00:00Z")),
])
def test_unsafe_or_unreliable_pages_fail_without_advancing(xml):
    with pytest.raises(SourceUnavailable):
        parse_placsp_page(xml)


def test_initial_page_budget_resumes_without_replaying_head():
    calls = []
    def handler(request):
        calls.append(request)
        if str(request.url) == FEED_URL:
            if request.headers.get("if-none-match") == '"v1"':
                return httpx.Response(304)
            return httpx.Response(200, content=page(entry(), ARCHIVE), headers={"ETag": '"v1"'})
        assert str(request.url) == ARCHIVE
        return httpx.Response(200, content=page(entry("124", updated="2026-09-10T12:00:00Z")))
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    first = collect_spain_notices(SOURCE, {}, FROZEN, http, {"max_pages": 1}, {})
    assert not first.complete and first.pages == 1
    assert [raw.data["id"] for raw in first.records] == ["123"]
    assert first.state["pending"][0]["url"] == ARCHIVE
    second = collect_spain_notices(SOURCE, first.state, FROZEN, http, {"max_pages": 2}, {})
    assert second.complete and second.pages == 2
    assert [raw.data["id"] for raw in second.records] == ["124"]
    assert second.state["pending"] == []
    assert first.state["pending"]
    assert len(calls) == 3


def test_unchanged_200_response_does_not_restart_archive_window():
    calls = []
    def handler(request):
        calls.append(str(request.url))
        content = page(entry(), ARCHIVE) if str(request.url) == FEED_URL else page(entry("124"))
        return httpx.Response(200, content=content)
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    first = collect_spain_notices(SOURCE, {}, FROZEN, http, {"max_pages": 2}, {})
    second = collect_spain_notices(SOURCE, first.state, FROZEN, http, {"max_pages": 2}, {})
    assert second.complete and second.pages == 1 and not second.records
    assert calls.count(ARCHIVE) == 1


def test_new_head_is_collected_while_old_backlog_is_preserved():
    calls = []
    def handler(request):
        calls.append(str(request.url))
        if str(request.url) == FEED_URL:
            if len(calls) == 1:
                return httpx.Response(200, content=page(entry(), ARCHIVE))
            return httpx.Response(200, content=page(entry("125", updated="2026-09-12T11:00:00Z"), NEW_ARCHIVE,
                                                    updated="2026-09-12T12:00:00Z"))
        assert str(request.url) == NEW_ARCHIVE
        return httpx.Response(200, content=page(entry("126", updated="2026-09-11T10:00:00Z"), ARCHIVE,
                                                updated="2026-09-12T12:00:00Z"))
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    first = collect_spain_notices(SOURCE, {}, FROZEN, http, {"max_pages": 1}, {})
    second = collect_spain_notices(SOURCE, first.state, FROZEN + timedelta(days=1), http, {"max_pages": 2}, {})
    assert [raw.data["id"] for raw in second.records] == ["125"]
    assert second.state["pending"][0]["url"] == ARCHIVE
    assert len(second.state["pending"]) == 1


def test_archive_failure_retains_exact_cursor_and_no_partial_page():
    def handler(request):
        return httpx.Response(200, content=page(entry(), ARCHIVE) if str(request.url) == FEED_URL else b"broken")
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_spain_notices(SOURCE, {}, FROZEN, http, {"max_pages": 2}, {})
    assert not result.complete and result.pages == 2
    assert result.state["pending"][0]["url"] == ARCHIVE
    assert len(result.records) == 1


def test_archive_cycle_is_not_followed_and_cursor_is_not_lost():
    def handler(request):
        return httpx.Response(200, content=page(entry(), ARCHIVE))
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_spain_notices(SOURCE, {}, FROZEN, http, {"max_pages": 3}, {})
    assert not result.complete and result.pages == 2
    assert "did not advance" in result.message
    assert result.state["pending"][0]["url"] == ARCHIVE


def test_date_only_deadline_expires_from_cache_without_refetching_notice():
    def handler(request):
        if request.headers.get("if-none-match"):
            return httpx.Response(304)
        return httpx.Response(200, content=page(entry(deadline="2026-09-11")), headers={"etag": '"v1"'})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    first = collect_spain_notices(SOURCE, {}, FROZEN, http, {"max_pages": 2}, {})
    assert first.state["active_records"]
    second = collect_spain_notices(SOURCE, first.state, FROZEN + timedelta(days=1), http, {"max_pages": 2}, {})
    assert not second.records
    third = collect_spain_notices(SOURCE, second.state, FROZEN + timedelta(days=2), http, {"max_pages": 2}, {})
    assert third.pages == 1 and len(third.records) == 1
    assert normalise_spain_notice(third.records[0]).status == "expired"
    assert not third.state["active_records"]
    merged, _, _ = reconcile([normalise_spain_notice(first.records[0])], [normalise_spain_notice(third.records[0])])
    assert not is_public_opportunity(merged[0], FROZEN + timedelta(days=2))


def test_withdrawal_before_older_tender_prevents_resurrection_during_backfill():
    def handler(request):
        if str(request.url) == FEED_URL:
            return httpx.Response(200, content=page(next_url=ARCHIVE, tombstones=withdraw()))
        return httpx.Response(200, content=page(entry(updated="2026-09-10T12:00:00Z")))
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_spain_notices(SOURCE, {}, FROZEN, http, {"max_pages": 2}, {})
    assert len(result.records) == 1
    signal = normalise_spain_notice(result.records[0])
    assert signal.status == "withdrawn"
    assert not is_public_opportunity(signal, FROZEN)


def test_stale_head_is_not_reported_as_fresh_complete_coverage():
    http = Http(transport=httpx.MockTransport(lambda _: httpx.Response(200, content=page(
        entry(updated="2026-09-08T11:00:00Z"), updated="2026-09-08T12:00:00Z"))), sleeper=lambda _: None)
    result = collect_spain_notices(SOURCE, {}, FROZEN, http, {"max_pages": 2}, {})
    assert not result.complete
    assert "2026-09-08" in result.message
    assert result.state["watermark"].startswith("2026-09-08")


def test_zero_budget_performs_no_requests_and_preserves_pending():
    http = Http(transport=httpx.MockTransport(lambda _: pytest.fail("No request budget")), sleeper=lambda _: None)
    result = collect_spain_notices(SOURCE, {}, FROZEN, http, {"max_pages": 0}, {})
    assert not result.complete and result.pages == 0


def test_cross_origin_redirect_is_not_followed():
    calls = []
    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(302, headers={"Location": "https://evil.example/"})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_spain_notices(SOURCE, {}, FROZEN, http, {"max_pages": 2}, {})
    assert not result.complete and calls == [FEED_URL]
