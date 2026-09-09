from datetime import timedelta
from urllib.parse import parse_qs

import httpx
import pytest

from anthrion_signal.collectors import Http, SourceUnavailable, collect_cursor, collect_monthly, releases


def test_fixed_window_pagination_and_watermark(source, config, now, release):
    requests = []
    def handler(request):
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(200, json={"releases": [release], "links": {"next": source["url"] + "?cursor=page2"}})
        return httpx.Response(200, json={"releases": [release], "links": {}})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    state = {"watermark": (now - timedelta(hours=1)).isoformat()}
    result = collect_cursor(source, state, now, http, config["runtime"], {})
    assert result.complete
    assert len(result.records) == 1
    assert result.state["watermark"] == now.isoformat()
    first, second = [parse_qs(r.url.query.decode()) for r in requests]
    assert first["updatedTo"] == second["updatedTo"]
    assert first["updatedFrom"] == second["updatedFrom"]
    assert "stages" not in first  # Verified FTS multi-stage quirk.
    assert second["cursor"] == ["page2"]
    assert state["watermark"] != result.state["watermark"]


def test_partial_window_never_advances_watermark(source, config, now, release):
    state = {"watermark": (now - timedelta(hours=1)).isoformat()}
    http = Http(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"releases": [release], "links": {"next": source["url"] + "?cursor=again"}})), sleeper=lambda _: None)
    result = collect_cursor(source, state, now, http, {**config["runtime"], "max_pages": 1}, {})
    assert not result.complete
    assert result.state["watermark"] == state["watermark"]
    assert len(result.records) == 1


def test_untrusted_pagination_host_is_rejected(source, config, now, release):
    state = {"watermark": (now - timedelta(hours=1)).isoformat()}
    http = Http(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"releases": [release], "links": {"next": "https://malicious.invalid/?cursor=x"}})), sleeper=lambda _: None)
    result = collect_cursor(source, state, now, http, config["runtime"], {})
    assert not result.complete
    assert result.state == state


def test_retry_after_is_respected_and_long_deferrals_stop():
    waits = []
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(429, headers={"Retry-After": "12"}) if len(requests) == 1 else httpx.Response(200, json={"ok": True})
    http = Http(transport=httpx.MockTransport(handler), sleeper=waits.append)
    assert http.json("https://example.gov.uk/api") == {"ok": True}
    assert 12 in waits
    http = Http(transport=httpx.MockTransport(lambda _: httpx.Response(503, headers={"Retry-After": "120"})), sleeper=lambda _: None)
    with pytest.raises(SourceUnavailable, match="deferred"):
        http.json("https://example.gov.uk/api")


def test_monthly_recollects_and_keeps_successful_partitions(source, config, now, release):
    source = {**source, "notice_types": [1, 2], "recent_months": 2}
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"releases": [release]})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_monthly(source, {}, now, http, config["runtime"], {})
    assert result.complete
    assert len(requests) == 4
    assert {parse_qs(r.url.query.decode())["dateFrom"][0] for r in requests} == {"08-2026", "09-2026"}


def test_ocds_record_reconstruction_uses_compiled_release(release):
    assert releases({"records": [{"compiledRelease": release}]}) == [release]
    assert releases({"version": "1.1", "publisher": {"name": "Official source"}, "uri": "https://example.gov.uk/api"}) == []
    with pytest.raises(SourceUnavailable):
        releases({"unexpected": []})
