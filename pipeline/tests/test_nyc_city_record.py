from datetime import UTC, datetime

import pytest

from anthrion_signal.collectors import RawRecord, SourceUnavailable
from anthrion_signal.nyc_city_record import (
    QUERY_VERSION, collect_nyc_city_record, normalise_nyc_city_record, nyc_timestamp,
)


FROZEN = datetime(2026, 9, 11, 12, tzinfo=UTC)
SOURCE = {"id": "nyc_city_record", "name": "NYC City Record", "source_type": "official_notice",
          "limit": 2, "country": "US"}
SETTINGS = {"max_pages": 4, "lookback_days": 90}


def notice(ident="20260825021", **kwargs):
    return {"request_id": ident, "id": ident, "section_name": "Procurement",
            "type_of_notice_description": "Solicitation", "short_title": "Community relationship database",
            "agency_name": "Emergency Management", "pin": "01727P0002",
            "start_date": "2026-09-01T00:00:00", "end_date": "2026-09-01T00:00:00",
            "due_date": "2026-09-21T14:00:00", "selection_method_description": "Competitive Sealed Proposals",
            "additional_description_1": "<p>A secure database for community communications.</p>", **kwargs}


class Pages:
    def __init__(self, pages):
        self.pages, self.calls = iter(pages), []

    def json(self, url, **kwargs):
        self.calls.append((url, kwargs))
        page = next(self.pages)
        if isinstance(page, Exception):
            raise page
        return page


def test_normalises_scope_and_eastern_deadline_without_inventing_tender_value():
    signal = normalise_nyc_city_record(RawRecord(notice(contract_amount="500000"), SOURCE, FROZEN.isoformat()))
    assert signal.signal_type == "RFP"
    assert signal.deadline_at == "2026-09-21T18:00:00+00:00"
    assert signal.published_at == "2026-09-01T04:00:00+00:00"
    assert signal.countries == ["US"]
    assert signal.value_max is None and signal.currency is None
    assert signal.description == "A secure database for community communications."
    assert signal.primary_source_url.endswith("/20260825021")


@pytest.mark.parametrize(("value", "expected"), [
    ("2026-01-15T14:00:00", "2026-01-15T19:00:00+00:00"),
    ("2026-07-15T14:00:00", "2026-07-15T18:00:00+00:00"),
    ("2026-07-15T14:00:00Z", "2026-07-15T14:00:00+00:00"),
    ("2026-03-08T02:30:00", None), ("2026-11-01T01:30:00", None), ("not a date", None),
])
def test_uses_real_timezone_rules(value, expected):
    assert nyc_timestamp(value) == expected


@pytest.mark.parametrize(("changes", "kind", "status"), [
    ({"type_of_notice_description": "Award", "vendor_name": "Existing supplier"}, "AWARD", "awarded"),
    ({"type_of_notice_description": "Intent to Award"}, "AWARD", "awarded"),
    ({"short_title": "Cancelled: community database"}, "LIVE_TENDER", "cancelled"),
    ({"selection_method_description": "Renewal"}, "LIVE_TENDER", "closed"),
    ({"selection_method_description": "Sole Source"}, "LIVE_TENDER", "closed"),
    ({"selection_method_description": "Negotiated Acquisition Extension"}, "LIVE_TENDER", "closed"),
    ({"selection_method_description": "Negotiated Acquisition"}, "LIVE_TENDER", "active"),
    ({"selection_method_description": "Request for Information"}, "RFI", "active"),
])
def test_preserves_lifecycle_and_excludes_unavailable_routes(changes, kind, status):
    signal = normalise_nyc_city_record(RawRecord(notice(**changes), SOURCE, FROZEN.isoformat()))
    assert (signal.signal_type, signal.status) == (kind, status)


def test_bid_deadline_extension_is_not_an_incumbent_contract_extension():
    signal = normalise_nyc_city_record(RawRecord(notice(
        short_title="Bid Extension: Community database services",
        selection_method_description="Request for Proposals",
        additional_description_1=("Proposals are invited from qualified suppliers. "
                                  "The awarded contract will include two options to extend."),
    ), SOURCE, FROZEN.isoformat()))
    assert (signal.signal_type, signal.status) == ("RFP", "active")
    assert signal.deadline_at == "2026-09-21T18:00:00+00:00"
    assert signal.exclusion_reasons == []


@pytest.mark.parametrize("deadline", ["2039-09-09T16:00:00", None, "unconfirmed"])
def test_postponed_opening_with_no_reliable_deadline_is_not_marked_active(deadline):
    description = 'The Bid opening will be conducted virtually via Microsoft Teams on "POSTPONED" at 11:00 A.M.'
    signal = normalise_nyc_city_record(RawRecord(notice(
        short_title="Bid Extension: Systems Integration Services",
        selection_method_description="Competitive Sealed Bids",
        start_date="2026-04-20T00:00:00", due_date=deadline,
        additional_description_1=description,
    ), SOURCE, FROZEN.isoformat()))
    assert signal.status == "postponed"
    assert signal.deadline_at is None
    assert signal.description == description
    assert signal.exclusion_reasons == [
        "Source postpones the bid opening without a reliable replacement response deadline."]


def test_indefinite_postponement_with_missing_deadline_is_unconfirmed():
    signal = normalise_nyc_city_record(RawRecord(notice(
        due_date=None,
        additional_description_1="The bid opening has been postponed until further notice.",
    ), SOURCE, FROZEN.isoformat()))
    assert signal.status == "postponed"
    assert signal.deadline_at is None


@pytest.mark.parametrize(("deadline", "description"), [
    ("2026-10-06T13:00:00", 'The bid opening was listed on "POSTPONED".'),
    ("2039-09-09T16:00:00", "This is an open-ended RFP. Proposals are invited from suppliers."),
    (None, "The pre-bid conference has been postponed until further notice."),
])
def test_normal_extensions_and_postponed_conferences_are_not_blocked(deadline, description):
    signal = normalise_nyc_city_record(RawRecord(notice(
        short_title="Bid Extension: Community database services",
        due_date=deadline, additional_description_1=description,
    ), SOURCE, FROZEN.isoformat()))
    assert signal.status == "active"
    assert signal.deadline_at == nyc_timestamp(deadline)
    assert signal.exclusion_reasons == []


def test_preserves_program_database_scope_without_inventing_platform_requirements():
    description = (
        "New York City Emergency Management (NYCEM) is seeking an off-the-shelf, "
        "secure database to manage its Strengthening Communities program. "
        "This database should serve as a central communication hub between Community "
        "Preparedness staff and community coalitions/networks in the Strengthening Communities program."
    )
    signal = normalise_nyc_city_record(RawRecord(notice(
        short_title="01727P0002-Strengthening Communities Database #2",
        additional_description_1=f"<p>{description}</p>",
    ), SOURCE, FROZEN.isoformat()))
    assert signal.description == description
    assert (signal.signal_type, signal.status) == ("RFP", "active")
    assert signal.matched_capabilities == []
    assert signal.prefilter_score == 0


def test_nonprocurement_and_generic_notices_are_not_opportunities():
    for changes in ({"section_name": "Public Hearings"}, {"type_of_notice_description": "Notice"}):
        assert normalise_nyc_city_record(RawRecord(notice(**changes), SOURCE, FROZEN.isoformat())) is None


def test_complete_collection_uses_keyset_paging_and_omits_contacts():
    http = Pages([[notice("1", email="private@example.org"), notice("2")], [notice("3")]])
    result = collect_nyc_city_record(SOURCE, {}, FROZEN, http, SETTINGS, {})
    assert result.complete and result.pages == 2 and len(result.records) == 3
    assert "request_id > 2" in http.calls[1][1]["params"]["$where"]
    assert result.state["watermark"] == FROZEN.isoformat()
    assert "pending" not in result.state
    assert "email" not in result.records[0].data
    assert "email" not in http.calls[0][1]["params"]["$select"]


def test_budgeted_collection_resumes_same_frozen_window_without_advancing_watermark():
    first = collect_nyc_city_record(SOURCE, {}, FROZEN, Pages([[notice("1"), notice("2")]]),
                                    {**SETTINGS, "max_pages": 1}, {})
    assert not first.complete and "watermark" not in first.state
    http = Pages([[notice("3")]])
    second = collect_nyc_city_record(SOURCE, first.state, FROZEN.replace(day=12), http, SETTINGS, {})
    assert second.complete and second.state["watermark"] == FROZEN.isoformat()
    assert "request_id > 2" in http.calls[0][1]["params"]["$where"]
    assert "2026-09-11T08:00:00" in http.calls[0][1]["params"]["$where"]


@pytest.mark.parametrize("page", [{"error": True}, [notice("2"), notice("1")], [None],
                                  SourceUnavailable("Source deferred request (HTTP 429)")])
def test_bad_pages_are_partial_and_do_not_advance_checkpoint(page):
    state = {"watermark": "2026-09-10T12:00:00+00:00", "query_version": QUERY_VERSION}
    result = collect_nyc_city_record(SOURCE, state, FROZEN, Pages([page]), SETTINGS, {})
    assert not result.complete
    assert result.state["watermark"] == state["watermark"]
    assert not result.records


def test_publication_end_date_is_not_a_submission_deadline():
    signal = normalise_nyc_city_record(RawRecord(notice(due_date=None), SOURCE, FROZEN.isoformat()))
    assert signal.deadline_at is None


def test_daily_source_does_not_refetch_unchanged_snapshot_at_every_scheduler_tick():
    state = {"watermark": FROZEN.isoformat(), "query_version": QUERY_VERSION}
    http = Pages([])
    result = collect_nyc_city_record(SOURCE, state, FROZEN.replace(hour=16), http, SETTINGS, {})
    assert result.complete and result.pages == 0 and not http.calls
    assert result.state == state


def test_deliberate_daily_refresh_preserves_incremental_window_and_request_budget():
    state = {"watermark": FROZEN.isoformat(), "query_version": QUERY_VERSION}
    http = Pages([[notice()]])
    result = collect_nyc_city_record(SOURCE, state, FROZEN.replace(hour=16), http, {**SETTINGS, "refresh_daily": True}, {})
    assert result.complete and result.pages == 1 and len(result.records) == 1
    assert "2026-09-04" in http.calls[0][1]["params"]["$where"]
    assert result.state["watermark"] == FROZEN.replace(hour=16).isoformat()


def test_transport_failure_consumes_a_logical_request():
    result = collect_nyc_city_record(SOURCE, {}, FROZEN, Pages([SourceUnavailable("HTTP 429")]), SETTINGS, {})
    assert result.pages == 1 and not result.complete
