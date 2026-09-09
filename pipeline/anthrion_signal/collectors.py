"""Official public adapters. Each source has an isolated, resumable collection result."""
import re
import ssl
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import parse_qs, urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup

from .utils import clean, iso, parse_date


class SourceUnavailable(Exception):
    pass


class Http:
    def __init__(self, user_agent="AnthrionSignal/1.0", transport=None, sleeper=time.sleep):
        self.client = httpx.Client(verify=ssl.create_default_context(), timeout=40, follow_redirects=True,
                                  headers={"User-Agent": user_agent, "Accept": "application/json,text/html"},
                                  transport=transport)
        self.sleeper = sleeper
        self.robots = {}
        self.last_request = 0.0

    def request(self, method, url, **kwargs):
        for attempt in range(3):
            interval = 10.1 if "find-tender" in url else 0.2
            self.sleeper(max(0, interval - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                response = self.client.request(method, url, **kwargs)
            except httpx.TransportError:
                if attempt == 2:
                    raise SourceUnavailable("Source connection failed") from None
                self.sleeper(2 ** (attempt + 1))
                continue
            if response.status_code in (429, 500, 502, 503, 504):
                header = response.headers.get("Retry-After")
                delay = 2 ** (attempt + 1)
                if header:
                    try:
                        delay = max(delay, float(header))
                    except ValueError:
                        try:
                            delay = max(delay, (parsedate_to_datetime(header) - datetime.now(UTC)).total_seconds())
                        except (TypeError, ValueError):
                            pass
                if attempt == 2 or delay > 60:
                    raise SourceUnavailable(f"Source deferred request (HTTP {response.status_code})")
                self.sleeper(delay)
                continue
            if response.status_code >= 400:
                raise SourceUnavailable(f"Source returned HTTP {response.status_code}")
            if len(response.content) > 45_000_000:
                raise SourceUnavailable("Source response exceeded the configured size limit")
            return response
        raise SourceUnavailable("Source unavailable")

    def json(self, url, **kwargs):
        try:
            return self.request("GET", url, **kwargs).json()
        except ValueError:
            raise SourceUnavailable("Source did not return JSON") from None

    def html(self, url):
        origin = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        if origin not in self.robots:
            response = self.client.get(origin + "/robots.txt")
            if response.status_code in (401, 403, 429) or response.status_code >= 500:
                raise SourceUnavailable("Public crawling policy is temporarily unavailable")
            robot = RobotFileParser()
            if response.status_code == 200 and "<html" not in response.text.lower()[:1000]:
                robot.parse(response.text.splitlines())
            elif response.status_code in (404, 410) or "<html" in response.text.lower()[:1000]:
                # The Digital Outcomes host routes unknown paths, including robots.txt, to sign-in.
                # No authenticated pages are requested; only its explicitly public opportunity pages.
                robot.parse(["User-agent: *", "Allow: /"])
            else:
                raise SourceUnavailable("Public crawling policy could not be verified")
            self.robots[origin] = robot
        if not self.robots[origin].can_fetch("AnthrionSignal", url):
            raise SourceUnavailable("Source disallows collection of this public page")
        response = self.request("GET", url)
        if urlparse(str(response.url)).netloc != urlparse(url).netloc:
            raise SourceUnavailable("Public page redirected to another host; review source configuration")
        self.sleeper(0.4)
        return response.text

    def close(self):
        self.client.close()


@dataclass
class RawRecord:
    data: dict
    source: dict
    retrieved_at: str
    kind: str = "ocds"


@dataclass
class Collection:
    records: list[RawRecord] = field(default_factory=list)
    state: dict = field(default_factory=dict)
    complete: bool = True
    message: str | None = None
    pages: int = 0


def releases(package):
    if isinstance(package, list):
        return [release for item in package for release in releases(item)]
    if not isinstance(package, dict):
        raise SourceUnavailable("Unexpected OCDS envelope")
    if "releases" in package:
        return package["releases"] or []
    if "records" in package:
        return [r["compiledRelease"] for r in package["records"] if r.get("compiledRelease")]
    if "ocid" in package:
        return [package]
    if package.get("version") and package.get("publisher") and package.get("uri"):
        return []  # The devolved APIs omit the releases key for empty monthly partitions.
    raise SourceUnavailable("OCDS response has no releases or records")


def reconstruct_notice(source, ocid, http):
    if not re.fullmatch(r"[A-Za-z0-9._-]{5,160}", ocid):
        raise SourceUnavailable("Invalid procurement identifier")
    package = http.json(source["record_url"].format(ocid=ocid))
    records = [r for r in releases(package) if r.get("ocid") == ocid]
    if not records:
        raise SourceUnavailable("Notice family did not contain its expected identifier")
    return records


def hydrate_sparse(result, source, frozen, http, settings):
    if not source.get("hydrate_records"):
        return
    candidates = {}
    for raw in result.records:
        tender = raw.data.get("tender") or {}
        text = clean(tender.get("description")) + " ".join(clean(lot.get("description")) for lot in tender.get("lots", []))
        if raw.data.get("ocid") and (not tender.get("title") or len(text) < 80):
            candidates[raw.data["ocid"]] = raw
    budget = min(source.get("record_limit", 4), max(0, settings["max_pages"] - result.pages))
    for ocid in list(candidates)[:budget]:
        try:
            result.pages += 1
            result.records.extend(RawRecord(r, source, frozen.isoformat()) for r in reconstruct_notice(source, ocid, http))
        except SourceUnavailable:
            # Release facts are still valid; optional family enrichment must not discard them.
            continue


def collect_cursor(source, state, frozen, http, settings, terms):
    result = Collection(state=dict(state))
    overlap = timedelta(minutes=source.get("overlap_minutes", 30))
    start = (parse_date(state.get("watermark")) or frozen - timedelta(days=settings["lookback_days"])) - overlap
    seen = set()
    while start < frozen:
        end = min(start + timedelta(hours=source.get("window_hours", 24)), frozen)
        date_format = source.get("date_format", "%Y-%m-%dT%H:%M:%SZ")
        params = {source["from_param"]: start.strftime(date_format),
                  source["to_param"]: end.strftime(date_format),
                  "limit": source.get("limit", 100)}
        # FTS silently returns no records for comma-separated stages. Fetch all when more
        # than one stage is selected, then apply the stage selection locally.
        if len(source["stages"]) == 1:
            params["stages"] = source["stages"][0]
        cursors = set()
        try:
            while True:
                if result.pages >= settings["max_pages"]:
                    result.complete = False
                    result.message = "Collection budget reached; remaining windows will resume next run."
                    return result
                package = http.json(source["url"], params=params)
                result.pages += 1
                for release in releases(package):
                    tags = " ".join(release.get("tag", [])).lower()
                    effective_stage = "award" if "award" in tags or "contract" in tags else "planning" if "planning" in tags else "implementation" if "implementation" in tags else "tender"
                    if effective_stage not in source["stages"]:
                        continue
                    key = (release.get("ocid"), release.get("id"))
                    if key not in seen:
                        seen.add(key)
                        result.records.append(RawRecord(release, source, frozen.isoformat()))
                next_url = package.get("links", {}).get("next")
                cursor = package.get("nextCursor") or package.get("cursor")
                if next_url:
                    if urlparse(next_url).netloc != urlparse(source["url"]).netloc:
                        raise SourceUnavailable("Pagination returned an unexpected host")
                    cursor = parse_qs(urlparse(next_url).query).get("cursor", [None])[0]
                    if not cursor:
                        raise SourceUnavailable("Pagination link omitted its cursor")
                if not cursor:
                    break
                if cursor in cursors:
                    raise SourceUnavailable("Source repeated a pagination cursor")
                cursors.add(cursor)
                params["cursor"] = cursor
            # Only fully consumed, fixed windows advance the watermark.
            result.state["watermark"] = end.isoformat()
            start = end
        except SourceUnavailable as exc:
            result.complete = False
            result.message = str(exc)
            return result
    return result


def collect_monthly(source, state, frozen, http, settings, terms):
    result = Collection(state=dict(state))
    month = frozen.replace(day=1)
    errors = 0
    for _ in range(source.get("recent_months", 2)):
        for notice_type in source["notice_types"]:
            if result.pages >= settings["max_pages"]:
                result.complete = False
                result.message = "Monthly collection budget reached."
                return result
            params = {"dateFrom": month.strftime("%m-%Y"), "noticeType": notice_type, "outputType": 0}
            if "locale" in source:
                params["locale"] = source["locale"]
            try:
                package = http.json(source["url"], params=params)
                result.pages += 1
                result.records.extend(RawRecord(r, source, frozen.isoformat()) for r in releases(package))
            except SourceUnavailable:
                errors += 1
                if errors >= 3 and not result.records:
                    result.complete = False
                    result.message = "Monthly source is unavailable; prior records retained."
                    return result
        month = (month - timedelta(days=1)).replace(day=1)
    result.complete = errors == 0
    result.message = f"{errors} monthly notice partitions unavailable." if errors else None
    if result.complete:
        result.state["watermark"] = frozen.isoformat()
    return result


def collect_govuk(source, state, frozen, http, settings, terms):
    result = Collection(state=dict(state))
    start = (parse_date(state.get("watermark")) or frozen - timedelta(days=90)) - timedelta(days=1)
    seen = set()
    try:
        query_state = dict(state.get("queries", {}))
        result.state["queries"] = query_state
        per_query_budget = max(1, settings["max_pages"] // len(terms["govuk_queries"]))
        for query in terms["govuk_queries"]:
            checkpoint = query_state.get(query, {})
            query_from = parse_date(checkpoint.get("from")) or start
            query_to = parse_date(checkpoint.get("to")) or frozen
            offset = checkpoint.get("offset", 0)
            query_pages = 0
            while True:
                if result.pages >= settings["max_pages"]:
                    result.complete = False
                    result.message = "Search collection budget reached."
                    return result
                data = http.json(source["url"], params={"q": query, "count": source.get("limit", 100),
                    "start": offset, "order": "-public_timestamp",
                    "filter_public_timestamp": f"from:{query_from.isoformat()},to:{query_to.isoformat()}"})
                result.pages += 1
                query_pages += 1
                batch = data.get("results", [])
                for entry in batch:
                    if entry.get("format") in ("person", "role", "organisation", "minister", "world_location", "statistics_announcement"):
                        continue
                    published = parse_date(entry.get("public_timestamp"))
                    if published and not query_from <= published <= query_to:
                        continue
                    if entry.get("link") not in seen:
                        seen.add(entry.get("link"))
                        result.records.append(RawRecord(entry, source, frozen.isoformat(), "govuk"))
                offset += len(batch)
                if not batch or offset >= data.get("total", 0):
                    query_state[query] = {"from": (query_to - timedelta(days=1)).isoformat(), "offset": 0}
                    break
                if query_pages >= per_query_budget:
                    query_state[query] = {"from": query_from.isoformat(), "to": query_to.isoformat(), "offset": offset}
                    result.complete = False
                    result.message = "Some search queries are still catching up; all query families were checked."
                    break
        result.state["queries"] = query_state
        result.state["watermark"] = frozen.isoformat()
    except SourceUnavailable as exc:
        result.complete, result.message = False, str(exc)
    return result


def public_detail(http, url):
    soup = BeautifulSoup(http.html(url), "html.parser")
    main = soup.select_one("main")
    if not main:
        raise SourceUnavailable("Public page no longer contains its expected content")
    return main


def collect_digital(source, state, frozen, http, settings, terms):
    result = Collection(state=dict(state))
    main = public_detail(http, source["url"])
    links = main.select('a[href*="/opportunity-details/"]')
    if not links and "0 results" not in main.get_text():
        raise SourceUnavailable("Digital Outcomes listing structure changed")
    for link in links:
        item = link.find_parent("li")
        if not item:
            continue
        paragraphs = [p.get_text(" ", strip=True) for p in item.find_all("p", recursive=False)]
        url = urljoin(source["url"], link["href"])
        text = item.get_text(" ", strip=True)
        value = re.search(r"Value:\s*[\u00a3]([\d,.]+)", text)
        framework = next((p for p in paragraphs if re.search(r"Digital Outcomes.*Lot \d", p)), None)
        status = next((p.lower() for p in paragraphs if p.lower() in ("open", "closed", "awarded", "cancelled")), "unknown")
        data = {"id": url.rsplit("/", 1)[-1], "title": link.get_text(" ", strip=True),
                "buyer": paragraphs[0] if paragraphs else None, "description": paragraphs[-1] if paragraphs else "",
                "url": url, "value": float(value.group(1).replace(",", "")) if value else None,
                "framework": framework, "status": status, "signal_type": "LIVE_TENDER", "stage": "tender"}
        # Fetch active scope detail only, within the source's request budget.
        if status == "open" and result.pages < min(settings["max_pages"], 40):
            try:
                detail = public_detail(http, url)
                detail_text = detail.get_text(" ", strip=True)
                data["description"] = clean(detail_text, 18000)
                closing = re.search(r"(\d{1,2} [A-Za-z]+ \d{4})\s+Application closing date", detail_text)
                data["deadline"] = iso(closing.group(1)) if closing else None
                result.pages += 1
            except SourceUnavailable:
                result.complete = False
                result.message = "Some opportunity details unavailable; listing facts retained."
        result.records.append(RawRecord(data, source, frozen.isoformat(), "html"))
    if result.complete:
        result.state["watermark"] = frozen.isoformat()
    return result


def collect_upcoming(source, state, frozen, http, settings, terms):
    result = Collection(state=dict(state))
    main = public_detail(http, source["url"])
    items = main.select("li.upcoming-result")
    if not items:
        raise SourceUnavailable("Upcoming agreements listing structure changed")
    for item in items:
        link = item.select_one('a[href^="/agreements/RM"]')
        if not link:
            continue
        heading = item.find_previous(["h2", "h3"])
        stage_text = heading.get_text(" ", strip=True).lower() if heading else "future pipeline"
        stage = "award" if "awarded" in stage_text else "tender" if "in progress" in stage_text else "planning"
        fields = {}
        for row in item.select("li"):
            label = row.find("strong")
            if label:
                fields[label.get_text(strip=True).rstrip(":")] = row.get_text(" ", strip=True).split(":", 1)[-1].strip()
        url = urljoin(source["url"], link["href"])
        data = {"id": fields.get("Agreement ID", url.rsplit("/", 1)[-1]), "url": url,
                "title": link.get_text(" ", strip=True), "buyer": "Government Commercial Agency",
                "description": item.get_text(" ", strip=True), "framework": fields.get("Agreement ID"),
                "status": "awarded" if stage == "award" else "active" if stage == "tender" else "planned",
                "signal_type": "AWARD" if stage == "award" else "FRAMEWORK", "stage": stage,
                "deadline": iso(fields.get("Tenders Close")), "contract_start": iso(fields.get("Expected Live")),
                "contract_end": iso(fields.get("End Date"))}
        if any(x in stage_text for x in ("currently open", "dynamic market")):
            data["stage"], data["status"] = "tender", "active"
        # Linked agreement pages provide authoritative scope and tender notice links.
        if result.pages < min(settings["max_pages"], 30) and any(
            term in data["description"].lower() for term in ("digital", "software", "technology", "artificial", "automation", "consultancy")
        ):
            try:
                detail = public_detail(http, url)
                for node in detail.select("nav, footer, script, style"):
                    node.decompose()
                data["description"] = clean(detail.get_text(" ", strip=True), 20000)
                data["source_links"] = [a["href"] for a in detail.select('a[href*="find-tender.service.gov.uk/Notice/"]')]
                result.pages += 1
            except SourceUnavailable:
                result.complete = False
                result.message = "Some agreement details unavailable; listing facts retained."
        result.records.append(RawRecord(data, source, frozen.isoformat(), "html"))
    if result.complete:
        result.state["watermark"] = frozen.isoformat()
    return result


def collect_ted(source, state, frozen, http, settings, terms):
    result = Collection(state=dict(state))
    countries = [code for market in terms["markets"].values() if market["enabled"] for code in market["ted_codes"]]
    if not countries:
        return result
    start = (parse_date(state.get("watermark")) or frozen - timedelta(days=settings["lookback_days"])) - timedelta(days=1)
    body = {"query": f"publication-date >= {start:%Y%m%d} AND publication-date <= {frozen:%Y%m%d} "
            f"AND place-of-performance IN ({' '.join(countries)}) AND classification-cpv IN (48* 72* 794*)",
            "fields": ["publication-number", "notice-title", "buyer-name", "publication-date", "form-type",
                       "notice-type", "place-of-performance", "classification-cpv", "deadline-receipt-tender-date-lot"],
            "limit": source.get("limit", 100), "paginationMode": "ITERATION", "scope": "ALL"}
    seen_tokens = set()
    try:
        while True:
            if result.pages >= settings["max_pages"]:
                result.complete, result.message = False, "TED iteration budget reached."
                break
            data = http.request("POST", source["url"], json=body).json()
            result.pages += 1
            result.records.extend(RawRecord(n, source, frozen.isoformat(), "ted") for n in data.get("notices", []))
            token = data.get("iterationNextToken")
            if not token or not data.get("notices"):
                result.state["watermark"] = frozen.isoformat()
                break
            if token in seen_tokens:
                raise SourceUnavailable("TED repeated its iteration token")
            seen_tokens.add(token)
            body["iterationNextToken"] = token
    except SourceUnavailable as exc:
        result.complete, result.message = False, str(exc)
    return result


class EmailAlertCollector:
    """Extension contract: accept verified supplier-alert exports, never an authenticated scraper."""
    def collect(self, source, state, frozen, http, settings, terms):
        raise SourceUnavailable("Email alerts require an authorised mailbox integration and sender mapping")


COLLECTORS = {"ocds_cursor": collect_cursor, "ocds_monthly": collect_monthly, "govuk": collect_govuk,
              "digital_outcomes": collect_digital, "upcoming_agreements": collect_upcoming, "ted": collect_ted}
