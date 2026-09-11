from datetime import timedelta
from urllib.parse import parse_qs

import httpx
import pytest

from anthrion_signal.collectors import (
    Http, SourceUnavailable, collect_cursor, collect_digital, collect_grants,
    collect_monthly, collect_with_backfill, digital_deadline, wales_listing,
)
from anthrion_signal.normalise import normalise_ocds


def test_rate_limit_cooldown_prevents_another_call_to_the_same_host():
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(429, headers={"Retry-After": "120"})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    for path in ("current", "backfill"):
        with pytest.raises(SourceUnavailable) as error:
            http.json("https://source.gov.uk/" + path)
        assert error.value.retry_at is not None
    assert len(calls) == 1


def test_cursor_page_resumes_without_repeating_the_first_page(source, config, now, release):
    calls = []
    def handler(request):
        calls.append(parse_qs(request.url.query.decode()))
        more = {} if request.url.params.get("cursor") else {"next": source["url"] + "?cursor=page2"}
        return httpx.Response(200, json={"releases": [release], "links": more})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    initial = {"watermark": (now - timedelta(hours=1)).isoformat()}
    first = collect_cursor(source, initial, now, http, {**config["runtime"], "max_pages": 1}, {})
    second = collect_cursor(source, first.state, now, http, config["runtime"], {})
    assert first.state["watermark"] == initial["watermark"]
    assert second.complete and "cursor_window" not in second.state
    assert calls[1]["cursor"] == ["page2"]
    assert calls[0]["updatedFrom"] == calls[1]["updatedFrom"]
    assert calls[0]["updatedTo"] == calls[1]["updatedTo"]


def test_rejected_resume_cursor_rewinds_only_the_unfinished_window(source, config, now):
    state = {"watermark": (now - timedelta(days=1)).isoformat(),
             "cursor_window": {"from": (now - timedelta(hours=6)).isoformat(), "to": now.isoformat(), "cursor": "expired"}}
    http = Http(transport=httpx.MockTransport(lambda _: httpx.Response(400)), sleeper=lambda _: None)
    result = collect_cursor(source, state, now, http, config["runtime"], {})
    assert not result.complete and "cursor_window" not in result.state
    assert result.state["watermark"] == state["watermark"]
    assert "cursor_window" in state


def test_retry_after_blocks_backfill_and_is_persisted(source, config, now):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(429, headers={"Retry-After": "120"})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_with_backfill(source, {"watermark": (now - timedelta(hours=1)).isoformat()},
                                   now, http, {**config["runtime"], "max_pages": 8},
                                   config["search_terms"], config["capabilities"])
    assert not result.complete and result.state["retry_at"]
    assert len(calls) == 1
    again = collect_with_backfill(source, {**result.state, "retry_at": (now + timedelta(minutes=2)).isoformat()},
                                  now, http, config["runtime"], config["search_terms"], config["capabilities"])
    assert not again.complete and again.pages == 0 and len(calls) == 1


def test_monthly_budget_resumes_later_notice_types(source, config, now, release):
    calls = []
    def handler(request):
        calls.append((request.url.params["dateFrom"], request.url.params["noticeType"]))
        return httpx.Response(200, json={"releases": [release]})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    source = {**source, "notice_types": [1, 2, 3], "recent_months": 2}
    first = collect_monthly(source, {}, now, http, {**config["runtime"], "max_pages": 4}, {})
    second = collect_monthly(source, first.state, now, http, {**config["runtime"], "max_pages": 4}, {})
    assert not first.complete and second.complete
    assert calls == [("09-2026", "1"), ("09-2026", "2"), ("09-2026", "3"),
                     ("08-2026", "1"), ("08-2026", "2"), ("08-2026", "3")]
    assert "monthly_cycle" not in second.state
    assert len(first.state["monthly_cycle"]["pending"]) == 2


def test_monthly_failed_requests_consume_budget(source, config, now):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(404)
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    source = {**source, "notice_types": [1, 2, 3], "recent_months": 2}
    result = collect_monthly(source, {}, now, http, {**config["runtime"], "max_pages": 2}, {})
    assert result.pages == 2 and len(calls) == 2 and not result.complete
    assert len(result.state["monthly_cycle"]["pending"]) == 6


def wales_page(notice_type="UK4", deadline="12/10/2026"):
    fields = {"Reference no": "SEP656493", "OCID": "ocds-kuma6s-170420", "Published by": "Public Health Wales",
              "Publication date": "11/09/2026", "Deadline date": deadline, "Notice Type": notice_type, "Value": "40,000"}
    rows = "".join(f'<div class="notice-property"><span>{key}:</span><span>{value}</span></div>' for key, value in fields.items())
    return ('<div class="search-result"><a class="notice-title" href="/search/show/search_view.aspx?ID=SEP656493">'
            'SMS Reminder System</a><div class="notice-abstract"><span aria-label="Full SMS service requirements">Short...</span></div>'
            + rows + '</div>')


def test_wales_server_failure_uses_public_fallback_without_false_completion(config, now):
    source = next(s for s in config["sources"]["sources"] if s["id"] == "wales")
    calls = []
    def handler(request):
        calls.append(request)
        if request.url.host.startswith("api."):
            return httpx.Response(500, text="Error converting data type nvarchar to float.")
        return httpx.Response(200, text="" if request.url.path == "/robots.txt" else wales_page())
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_monthly(source, {}, now, http, {**config["runtime"], "max_pages": 4}, {})
    assert not result.complete and "partial coverage" in result.message
    assert len(result.records) == 1 and "watermark" not in result.state
    assert len([r for r in calls if r.url.host.startswith("api.")]) == 1
    assert next(r for r in calls if r.url.path == "/robots.txt").headers["Accept"].startswith("text/plain")
    assert result.state["monthly_cycle"]["pending"]
    record = normalise_ocds(result.records[0])
    assert record.description == "Full SMS service requirements"
    assert record.deadline_at.startswith("2026-10-12")
    assert record.value_max == 40000


@pytest.mark.parametrize("notice_type,tag,status", [
    ("UK2", "planning", "planned"), ("UK3", "planning", "planned"),
    ("UK4", "tender", "active"), ("UK6", "award", "complete"),
    ("UK8", "award", "complete"), ("UK12", "tenderCancellation", "cancelled"),
])
def test_wales_public_notices_keep_their_actual_lifecycle(config, now, notice_type, tag, status):
    source = next(s for s in config["sources"]["sources"] if s["id"] == "wales")
    http = Http(transport=httpx.MockTransport(lambda r: httpx.Response(200, text="" if r.url.path == "/robots.txt" else wales_page(notice_type))), sleeper=lambda _: None)
    record = wales_listing(source, now, http)[0].data
    assert record["tag"] == [tag] and record["tender"]["status"] == status


def test_wales_fallback_respects_robots(config, now):
    source = next(s for s in config["sources"]["sources"] if s["id"] == "wales")
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, text="User-agent: *\nDisallow: /")
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    with pytest.raises(SourceUnavailable, match="disallows"):
        wales_listing(source, now, http)
    assert len(calls) == 1


@pytest.mark.parametrize("text,expected", [
    ("24 October 2026 Application closing date", "2026-10-24"),
    ("The tender submission deadline will be 12 Noon Friday 29th May 2026.", "2026-05-29"),
    ("Application closing date: 2 September 2026", "2026-09-02"),
    ("Latest start date 2026-08-03. Publish procurement documents on 8 May 2026.", None),
])
def test_digital_deadline_requires_an_explicit_submission_label(text, expected):
    actual = digital_deadline(text)
    assert actual.startswith(expected) if expected else actual is None


def test_digital_listing_and_failed_details_are_bounded_and_reused(config, now):
    source = next(s for s in config["sources"]["sources"] if s["id"] == "digital_outcomes")
    listing = '<main>' + ''.join(f'<li><a href="/digital-outcomes/opportunity-details/{i}">Project {i}</a><p>Buyer</p><p>open</p><p>CRM implementation</p></li>' for i in range(3)) + '</main>'
    calls = []
    def handler(request):
        calls.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="")
        return httpx.Response(200, text=listing if request.url.path.endswith("opportunities") else '<main>Application closing date: 24 October 2026. Full CRM scope.</main>')
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    first = collect_digital(source, {}, now, http, {**config["runtime"], "max_pages": 2}, {})
    assert not first.complete and len(first.records) == 3 and first.pages == 2
    second = collect_digital(source, first.state, now + timedelta(minutes=5), http, {**config["runtime"], "max_pages": 4}, {})
    assert second.complete and second.pages == 3
    assert len([p for p in calls if "opportunity-details/0" in p]) == 1
    assert all(r.data["deadline"].startswith("2026-10-24") for r in second.records)


def test_digital_listing_pagination_uses_the_published_next_link(config, now):
    source = next(s for s in config["sources"]["sources"] if s["id"] == "digital_outcomes")
    calls = []
    def handler(request):
        calls.append(str(request.url))
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="")
        page = request.url.params.get("p", "1")
        next_link = '<a href="?p=2&amp;status=open">2</a>' if page == "1" else '<a href="?p=1&amp;status=open">1</a>'
        return httpx.Response(200, text=f'<main><li><a href="/digital-outcomes/opportunity-details/{page}">Record {page}</a><p>Buyer</p><p>closed</p></li>{next_link}</main>')
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    first = collect_digital(source, {}, now, http, {**config["runtime"], "max_pages": 1}, {})
    assert not first.complete and first.pages == 1 and first.state["listing_next_url"].endswith("?p=2&status=open")
    second = collect_digital(source, first.state, now, http, {**config["runtime"], "max_pages": 2}, {})
    assert second.complete and second.pages == 1
    assert [r.data["id"] for r in first.records + second.records] == ["1", "2"]
    assert "listing_next_url" not in second.state


def test_digital_failed_detail_is_not_hammered_on_the_next_run(config, now):
    source = next(s for s in config["sources"]["sources"] if s["id"] == "digital_outcomes")
    calls = []
    def handler(request):
        calls.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="")
        if "opportunity-details" in request.url.path:
            return httpx.Response(404)
        return httpx.Response(200, text='<main><li><a href="/digital-outcomes/opportunity-details/1">CRM system</a><p>Buyer</p><p>open</p></li></main>')
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    first = collect_digital(source, {}, now, http, {**config["runtime"], "max_pages": 2}, {})
    second = collect_digital(source, first.state, now + timedelta(minutes=5), http, {**config["runtime"], "max_pages": 2}, {})
    assert not first.complete and not second.complete
    assert first.pages == 2 and second.pages == 1
    assert len(second.records) == 1
    assert len([p for p in calls if "opportunity-details" in p]) == 1


def test_grants_detail_budget_cache_and_changed_listings(config, now):
    source = {**next(s for s in config["sources"]["sources"] if s["id"] == "grants"), "keywords": ["CRM"]}
    details = []
    hits = [{"id": str(i), "oppStatus": "posted", "openDate": "09/11/2026"} for i in range(1, 4)]
    def handler(request):
        if request.url.path.endswith("search2"):
            return httpx.Response(200, json={"errorcode": 0, "data": {"hitCount": len(hits), "oppHits": hits}})
        import json
        ident = json.loads(request.content)["opportunityId"]
        details.append(ident)
        return httpx.Response(200, json={"errorcode": 0, "token": "secret-do-not-store", "data": {"id": ident,
            "opportunityTitle": "CRM grant", "synopsis": {"synopsisDesc": "CRM programme"}}})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    first = collect_grants(source, {}, now, http, {**config["runtime"], "max_pages": 2}, {})
    assert not first.complete and first.pages == 2 and len(first.records) == 1
    second = collect_grants(source, first.state, now + timedelta(minutes=5), http, {**config["runtime"], "max_pages": 3}, {})
    assert second.complete and second.pages == 3 and len(second.records) == 3
    assert details == [1, 2, 3]
    third = collect_grants(source, second.state, now + timedelta(hours=1), http, {**config["runtime"], "max_pages": 3}, {})
    assert third.complete and third.pages == 1 and len(third.records) == 3
    hits[0]["closeDate"] = "10/31/2026"
    fourth = collect_grants(source, third.state, now + timedelta(hours=2), http, {**config["runtime"], "max_pages": 2}, {})
    assert fourth.complete and fourth.pages == 2 and details == [1, 2, 3, 1]
    assert "secret-do-not-store" not in str(fourth.state)


def test_grants_budget_skips_preserve_previous_complete_detail(config, now):
    source = {**next(s for s in config["sources"]["sources"] if s["id"] == "grants"), "keywords": ["CRM"]}
    previous = {"id": "1", "title": "CRM grant", "status": "posted", "facts": {"synopsisDesc": "Full scope"}}
    state = {"active_ids": ["1"], "detail_cache": {"1": {"record": previous, "signature": "old",
              "fetched_at": (now - timedelta(days=2)).isoformat()}}}
    http = Http(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"errorcode": 0,
        "data": {"hitCount": 1, "oppHits": [{"id": "1", "oppStatus": "posted"}]}})), sleeper=lambda _: None)
    result = collect_grants(source, state, now, http, {**config["runtime"], "max_pages": 1}, {})
    assert not result.complete and result.pages == 1
    assert result.records[0].data == previous
    assert "watermark" not in result.state
