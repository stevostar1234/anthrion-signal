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

from .utils import clean, digest, iso, parse_date


class SourceUnavailable(Exception):
    def __init__(self, message, *, status_code=None, retry_at=None, data_error=False):
        super().__init__(message)
        self.status_code = status_code
        self.retry_at = retry_at
        self.data_error = data_error


class Http:
    def __init__(self, user_agent="AnthrionSignal/1.0", transport=None, sleeper=time.sleep):
        self.client = httpx.Client(verify=ssl.create_default_context(), timeout=40, follow_redirects=True,
                                  headers={"User-Agent": user_agent, "Accept": "application/json,text/html"},
                                  transport=transport)
        self.sleeper = sleeper
        self.robots = {}
        self.last_request = 0.0
        self.deferred_hosts = {}

    def request(self, method, url, **kwargs):
        host = urlparse(url).netloc
        deferred = self.deferred_hosts.get(host)
        if deferred and deferred.retry_at > datetime.now(UTC):
            raise deferred
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
                if response.status_code == 500 and "Error converting data type nvarchar to float" in response.text[:20000]:
                    raise SourceUnavailable("Source data conversion failed (HTTP 500)", status_code=500, data_error=True)
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
                    deferred = SourceUnavailable(f"Source deferred request (HTTP {response.status_code})",
                                                 status_code=response.status_code,
                                                 retry_at=datetime.now(UTC) + timedelta(seconds=max(delay, 60)))
                    if response.status_code in (429, 503):
                        self.deferred_hosts[host] = deferred
                    raise deferred
                self.sleeper(delay)
                continue
            if response.status_code >= 400:
                raise SourceUnavailable(f"Source returned HTTP {response.status_code}", status_code=response.status_code)
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
            try:
                response = self.request("GET", origin + "/robots.txt", headers={"Accept": "text/plain,*/*;q=0.1"})
            except SourceUnavailable as exc:
                if exc.status_code not in (404, 410):
                    raise
                response = httpx.Response(exc.status_code)
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
        response = self.request("GET", url, headers={"Accept": "text/html,application/xhtml+xml,*/*;q=0.1"})
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


def defer_collection(result, exc):
    result.complete, result.message = False, str(exc)
    if exc.retry_at:
        result.state["retry_at"] = exc.retry_at.isoformat()
    elif exc.data_error:
        result.state["retry_at"] = (datetime.now(UTC) + timedelta(hours=1)).isoformat()


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
    pending = state.get("cursor_window", {})
    if pending.get("from") and pending.get("to"):
        start = parse_date(pending["from"]) or start
    seen = set()
    while start < frozen:
        end = parse_date(pending.get("to")) or min(start + timedelta(hours=source.get("window_hours", 24)), frozen)
        date_format = source.get("date_format", "%Y-%m-%dT%H:%M:%SZ")
        params = {source["from_param"]: start.strftime(date_format),
                  source["to_param"]: end.strftime(date_format),
                  "limit": source.get("limit", 100)}
        # FTS silently returns no records for comma-separated stages. Fetch all when more
        # than one stage is selected, then apply the stage selection locally.
        if len(source["stages"]) == 1:
            params["stages"] = source["stages"][0]
        if pending.get("cursor"):
            params["cursor"] = pending["cursor"]
        cursors = set()
        try:
            while True:
                if result.pages >= settings["max_pages"]:
                    result.complete = False
                    result.message = "Collection budget reached; remaining windows will resume next run."
                    return result
                result.pages += 1
                package = http.json(source["url"], params=params)
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
                result.state["cursor_window"] = {"from": start.isoformat(), "to": end.isoformat(), "cursor": cursor}
            # Only fully consumed, fixed windows advance the watermark.
            result.state["watermark"] = end.isoformat()
            result.state.pop("cursor_window", None)
            pending = {}
            start = end
        except SourceUnavailable as exc:
            defer_collection(result, exc)
            if exc.status_code == 400 and params.get("cursor"):
                result.state.pop("cursor_window", None)
                result.message = "Source cursor expired; the unfinished window will be replayed next run."
            return result
    return result


def collect_monthly(source, state, frozen, http, settings, terms):
    result = Collection(state=dict(state))
    cycle = state.get("monthly_cycle", {})
    partitions = [dict(p) for p in cycle.get("pending", [])]
    if not partitions:
        month = frozen.replace(day=1)
        for _ in range(source.get("recent_months", 2)):
            partitions.extend({"month": month.strftime("%m-%Y"), "type": t} for t in source["notice_types"])
            month = (month - timedelta(days=1)).replace(day=1)
        cycle = {"through": frozen.isoformat()}
    pending = list(partitions)
    result.state["monthly_cycle"] = {"through": cycle["through"], "pending": pending}
    errors = 0
    for partition in partitions:
        if result.pages >= settings["max_pages"]:
            result.complete, result.message = False, "Monthly collection budget reached; remaining partitions resume next run."
            break
        params = {"dateFrom": partition["month"], "noticeType": partition["type"], "outputType": 0}
        if "locale" in source:
            params["locale"] = source["locale"]
        try:
            result.pages += 1
            package = http.json(source["url"], params=params)
            result.records.extend(RawRecord(r, source, frozen.isoformat()) for r in releases(package))
            pending.remove(partition)
        except SourceUnavailable as exc:
            errors += 1
            defer_collection(result, exc)
            # Retry failed partitions only after the other partitions have had a turn.
            pending.remove(partition)
            pending.append(partition)
            if exc.data_error or exc.status_code in (429, 503) or (errors >= 3 and not result.records):
                break
    if result.complete:
        result.state["watermark"] = cycle["through"]
        result.state.pop("monthly_cycle", None)
    elif source.get("fallback_url") and result.pages < settings["max_pages"]:
        try:
            result.pages += 1
            result.records.extend(wales_listing(source, frozen, http))
            result.message = f"{result.message}; latest public listing retained with partial coverage."
        except SourceUnavailable:
            result.message = f"{result.message}; public listing fallback also unavailable."
    return result


def wales_listing(source, frozen, http):
    """Recover only the published latest page, without claiming an API backfill."""
    soup = BeautifulSoup(http.html(source["fallback_url"]), "html.parser")
    items = soup.select(".search-result")
    if not items:
        raise SourceUnavailable("Sell2Wales public listing structure changed")
    records = []
    for item in items:
        link = item.select_one("a.notice-title[href]")
        fields = {}
        for row in item.select(".notice-property"):
            cells = row.find_all("span", recursive=False)
            if len(cells) >= 2:
                fields[clean(cells[0].get_text()).rstrip(":")] = clean(cells[1].get_text())
        ocid = fields.get("OCID", "")
        if not link or not re.fullmatch(r"[A-Za-z0-9._-]{5,160}", ocid):
            continue
        notice_type = fields.get("Notice Type", "").lower()
        if notice_type in ("uk2", "prior information notice"):
            tag, status = "planning", "planned"
        elif notice_type in ("uk1", "uk01", "uk3", "pipeline notice"):
            tag, status = "planning", "planned"
        elif "award" in notice_type or notice_type in ("uk5", "uk6", "uk7", "uk8", "uk9", "uk10"):
            tag, status = "award", "complete"
        elif "termination" in notice_type or notice_type in ("uk11", "uk12"):
            tag, status = "tenderCancellation", "cancelled"
        elif notice_type in ("uk4", "contract notice", "sub-contract opportunity"):
            tag, status = "tender", "active"
        else:
            continue  # Do not invent a lifecycle from unrecognised notice conventions.
        url = urljoin(source["fallback_url"], link["href"])
        if urlparse(url).netloc != urlparse(source["fallback_url"]).netloc:
            continue
        abstract = item.select_one(".notice-abstract span")
        description = clean(abstract.get("aria-label") or abstract.get_text()) if abstract else ""
        tender = {"id": fields.get("Reference no", ocid), "title": link.get_text(" ", strip=True),
                  "description": description, "status": status, "documents": [{"url": url, "documentType": "tenderNotice"}]}
        deadline = parse_date(fields.get("Deadline date"))
        published = parse_date(fields.get("Publication date"))
        if deadline:
            tender["tenderPeriod"] = {"endDate": deadline.isoformat()}
        value = fields.get("Value", "").replace(",", "").replace("\u00a3", "").strip()
        if re.fullmatch(r"\d+(?:\.\d+)?", value):
            tender["value"] = {"amount": float(value), "currency": "GBP"}
        records.append(RawRecord({"ocid": ocid, "id": fields.get("Reference no", ocid),
                                  "date": (published or frozen).isoformat(), "tag": [tag],
                                  "buyer": {"name": fields.get("Published by")}, "tender": tender},
                                 source, frozen.isoformat()))
    return records


def collect_govuk(source, state, frozen, http, settings, terms):
    result = Collection(state=dict(state))
    start = (parse_date(state.get("watermark")) or frozen - timedelta(days=90)) - timedelta(days=1)
    seen = set()
    cycle_end = parse_date(state.get("query_cycle_to")) or frozen
    result.state["query_cycle_to"] = cycle_end.isoformat()
    try:
        query_state = dict(state.get("queries", {}))
        result.state["queries"] = query_state
        queries = terms["govuk_queries"]
        position = state.get("next_query", 0) % len(queries)
        ordered = queries[position:] + queries[:position]
        per_query_budget = max(1, settings["max_pages"] // len(queries))
        for query in ordered:
            checkpoint = query_state.get(query, {})
            if (parse_date(checkpoint.get("through")) or start) >= cycle_end:
                continue
            query_from = parse_date(checkpoint.get("from")) or start
            query_to = parse_date(checkpoint.get("to")) or cycle_end
            offset = checkpoint.get("offset", 0)
            query_pages = 0
            while True:
                if result.pages >= settings["max_pages"]:
                    result.complete = False
                    result.message = "Search collection budget reached; remaining query families resume next run."
                    result.state["next_query"] = queries.index(query)
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
                    query_state[query] = {"from": (query_to - timedelta(days=1)).isoformat(), "offset": 0, "through": query_to.isoformat()}
                    break
                if query_pages >= per_query_budget:
                    query_state[query] = {"from": query_from.isoformat(), "to": query_to.isoformat(), "offset": offset}
                    result.complete = False
                    result.message = "Some search queries are still catching up; offsets are retained."
                    break
        result.state["queries"] = query_state
        if result.complete:
            result.state["watermark"] = cycle_end.isoformat()
            result.state.pop("query_cycle_to", None)
            result.state["next_query"] = 0
    except SourceUnavailable as exc:
        result.complete, result.message = False, str(exc)
    return result


def public_detail(http, url):
    soup = BeautifulSoup(http.html(url), "html.parser")
    main = soup.select_one("main")
    if not main:
        raise SourceUnavailable("Public page no longer contains its expected content")
    return main


def digital_deadline(text):
    date = r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})"
    match = re.search(r"(?:application closing date|tender submission deadline|closing date|deadline for (?:applications|responses|tenders))[^.!?]{0,90}?" + date, text, re.I)
    if not match:
        match = re.search(date + r"\s+Application closing date", text, re.I)
    return iso(" ".join(match.groups())) if match else None


def collect_digital(source, state, frozen, http, settings, terms):
    result = Collection(state=dict(state))
    listing_url = state.get("listing_next_url") or source["url"]
    if urlparse(listing_url).netloc != urlparse(source["url"]).netloc or urlparse(listing_url).path != urlparse(source["url"]).path:
        listing_url = source["url"]
    links, listing_pages, detail_urls = [], set(), set()
    while listing_url:
        if result.pages >= settings["max_pages"]:
            result.complete, result.message = False, "Digital Outcomes listing budget reached; remaining pages resume next run."
            result.state["listing_next_url"] = listing_url
            break
        result.pages += 1
        try:
            main = public_detail(http, listing_url)
        except SourceUnavailable as exc:
            defer_collection(result, exc)
            result.state["listing_next_url"] = listing_url
            break
        page_links = main.select('a[href*="/opportunity-details/"]')
        if not page_links and "0 results" not in main.get_text():
            raise SourceUnavailable("Digital Outcomes listing structure changed")
        for link in page_links:
            if link["href"] not in detail_urls:
                links.append(link)
                detail_urls.add(link["href"])
        current_page = int(parse_qs(urlparse(listing_url).query).get("p", ["1"])[0])
        listing_pages.add(current_page)
        next_pages = {}
        for link in main.select('a[href]'):
            url = urljoin(source["url"], link["href"])
            page = parse_qs(urlparse(url).query).get("p", [""])[0]
            if (page.isdigit() and int(page) > current_page and int(page) not in listing_pages and
                    urlparse(url).netloc == urlparse(source["url"]).netloc and urlparse(url).path == urlparse(source["url"]).path):
                next_pages[int(page)] = url
        listing_url = next_pages[min(next_pages)] if next_pages else None
        if not listing_url:
            result.state.pop("listing_next_url", None)
    cache = dict(state.get("digital_details", {}))
    result.state["digital_details"] = cache
    position = state.get("next_detail", 0) % max(1, len(links))
    links = links[position:] + links[:position]
    first_pending = None
    active_ids = set(state.get("listing_cycle_ids", [])) if state.get("listing_next_url") else set()
    for index, link in enumerate(links):
        item = link.find_parent("li")
        if not item:
            continue
        paragraphs = [p.get_text(" ", strip=True) for p in item.find_all("p", recursive=False)]
        url = urljoin(source["url"], link["href"])
        if urlparse(url).netloc != urlparse(source["url"]).netloc:
            continue
        text = item.get_text(" ", strip=True)
        value = re.search(r"Value:\s*[\u00a3]([\d,.]+)", text)
        framework = next((p for p in paragraphs if re.search(r"Digital Outcomes.*Lot \d", p)), None)
        status = next((p.lower() for p in paragraphs if p.lower() in ("open", "closed", "awarded", "cancelled")), "unknown")
        if re.search(r"(?:-\s*|\()closed\)?$", link.get_text(" ", strip=True), re.I):
            status = "closed"
        data = {"id": url.rsplit("/", 1)[-1], "title": link.get_text(" ", strip=True),
                "buyer": paragraphs[0] if paragraphs else None, "description": paragraphs[-1] if paragraphs else "",
                "url": url, "value": float(value.group(1).replace(",", "")) if value else None,
                "framework": framework, "status": status, "signal_type": "LIVE_TENDER", "stage": "tender"}
        ident = data["id"]
        active_ids.add(ident)
        previous = cache.get(ident, {})
        signature = digest(data)
        if previous.get("data"):
            data.update(previous["data"])
        fresh = (previous.get("signature") == signature and
                 (parse_date(previous.get("fetched_at")) or frozen - timedelta(days=2)) > frozen - timedelta(hours=24))
        retry_at = parse_date(previous.get("retry_at"))
        # Fetch active scope detail only, within the source's request budget.
        needs_detail = status == "open" and not fresh
        if needs_detail and (result.pages >= min(settings["max_pages"], 40) or (retry_at and retry_at > frozen)):
            result.complete = False
            result.message = "Some opportunity details deferred; listing and cached facts retained."
            first_pending = first_pending if first_pending is not None else (position + index) % len(links)
        elif needs_detail:
            try:
                result.pages += 1
                detail = public_detail(http, url)
                detail_text = detail.get_text(" ", strip=True)
                data["description"] = clean(detail_text, 18000)
                data["deadline"] = digital_deadline(detail_text)
                cache[ident] = {"data": {k: data[k] for k in ("description", "deadline")},
                                "fetched_at": frozen.isoformat(), "signature": signature}
            except SourceUnavailable as exc:
                cache[ident] = {**previous, "retry_at": (exc.retry_at or frozen + timedelta(hours=1)).isoformat()}
                result.complete = False
                result.message = "Some opportunity details unavailable; listing facts retained."
                first_pending = first_pending if first_pending is not None else (position + index) % len(links)
        result.records.append(RawRecord(data, source, frozen.isoformat(), "html"))
    if result.state.get("listing_next_url"):
        result.state["listing_cycle_ids"] = sorted(active_ids)
    else:
        result.state.pop("listing_cycle_ids", None)
        result.state["digital_details"] = {ident: cached for ident, cached in cache.items() if ident in active_ids}
    result.state["next_detail"] = first_pending or 0
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
    countries = [code for country, market in terms["markets"].items()
                 if market["enabled"] and country in source.get("countries", terms["markets"])
                 for code in market["ted_codes"]]
    if not countries:
        return result
    query_version = digest([sorted(countries), "buyer-jurisdiction-v2"])
    checkpoint = state.get("watermark") if state.get("query_version") == query_version else None
    start = (parse_date(checkpoint) or frozen - timedelta(days=settings["lookback_days"])) - timedelta(days=1)
    body = {"query": f"publication-date >= {start:%Y%m%d} AND publication-date <= {frozen:%Y%m%d} "
            f"AND buyer-country IN ({' '.join(countries)}) AND classification-cpv IN (48* 72* 7931* 7941*)",
            "fields": ["publication-number", "notice-identifier", "title-proc", "notice-title", "buyer-name",
                       "buyer-country", "publication-date", "form-type", "notice-type", "place-of-performance",
                       "classification-cpv", "description-proc", "description-lot", "estimated-value-proc",
                       "estimated-value-cur-proc", "total-value", "total-value-cur", "framework-agreement-lot",
                       "deadline-receipt-tender-date-lot", "deadline-receipt-tender-time-lot", "winner-name"],
            "limit": min(source.get("limit", 200), 250), "paginationMode": "ITERATION", "scope": "ALL"}
    seen_tokens = set()
    try:
        while True:
            if result.pages >= settings["max_pages"]:
                result.complete, result.message = False, "TED iteration budget reached."
                break
            data = http.request("POST", source["url"], json=body).json()
            result.pages += 1
            if not isinstance(data.get("notices"), list) or data.get("timedOut"):
                raise SourceUnavailable("TED returned an incomplete search response")
            result.records.extend(RawRecord(n, source, frozen.isoformat(), "ted") for n in data["notices"])
            token = data.get("iterationNextToken")
            if not token or not data.get("notices"):
                result.state["watermark"] = frozen.isoformat()
                result.state["query_version"] = query_version
                break
            if token in seen_tokens:
                raise SourceUnavailable("TED repeated its iteration token")
            seen_tokens.add(token)
            body["iterationNextToken"] = token
    except SourceUnavailable as exc:
        result.complete, result.message = False, str(exc)
    return result


def collect_usaspending(source, state, frozen, http, settings, terms):
    result = Collection(state=dict(state))
    # This API's date filter is transaction activity, not last-modified time. Replay
    # a rolling window to pick up corrections; do not pretend it is a change cursor.
    start = frozen - timedelta(days=max(settings["lookback_days"], source.get("lookback_days", 90)))
    body = {"filters": {"keywords": source["keywords"], "award_type_codes": ["A", "B", "C", "D"],
                        "time_period": [{"start_date": start.date().isoformat(), "end_date": frozen.date().isoformat()}]},
            "fields": ["Award ID", "Recipient Name", "Awarding Agency", "Description", "Award Amount",
                       "Start Date", "End Date", "Last Modified Date", "generated_internal_id"],
            "limit": min(source.get("limit", 100), 100), "page": 1, "sort": "Last Modified Date", "order": "desc"}
    seen = set()
    try:
        while result.pages < settings["max_pages"]:
            data = http.request("POST", source["url"], json=body).json()
            result.pages += 1
            rows, metadata = data.get("results"), data.get("page_metadata", {})
            if not isinstance(rows, list) or not isinstance(metadata.get("hasNext"), bool):
                raise SourceUnavailable("USAspending returned an invalid page")
            signature = tuple(r.get("generated_internal_id") for r in rows)
            if signature in seen or (not rows and metadata["hasNext"]):
                raise SourceUnavailable("USAspending pagination did not advance")
            seen.add(signature)
            result.records.extend(RawRecord(r, source, frozen.isoformat(), "usaspending") for r in rows)
            if not metadata["hasNext"]:
                result.state["watermark"] = frozen.isoformat()
                return result
            body["page"] += 1
        raise SourceUnavailable("USAspending page budget reached; previous checkpoint retained")
    except SourceUnavailable as exc:
        result.complete, result.message = False, str(exc)
    return result


def collect_grants(source, state, frozen, http, settings, terms):
    result = Collection(state=dict(state))
    hits, active_ids = {}, set()
    cache = dict(state.get("detail_cache", {}))
    result.state["detail_cache"] = cache
    try:
        for keyword in source["keywords"]:
            offset, seen = 0, set()
            while True:
                if result.pages >= settings["max_pages"]:
                    raise SourceUnavailable("Grants.gov search page budget reached")
                result.pages += 1
                response = http.request("POST", source["url"], json={"keyword": keyword,
                    "oppStatuses": "posted|forecasted", "rows": 100, "startRecordNum": offset}).json()
                data = response.get("data", {})
                rows, count = data.get("oppHits"), data.get("hitCount")
                if response.get("errorcode") != 0 or not isinstance(rows, list) or not isinstance(count, int):
                    raise SourceUnavailable("Grants.gov returned an invalid search page")
                signature = tuple(r.get("id") for r in rows)
                if signature in seen or (not rows and offset < count):
                    raise SourceUnavailable("Grants.gov pagination did not advance")
                seen.add(signature)
                for hit in rows:
                    hits[str(hit["id"])] = hit
                    active_ids.add(str(hit["id"]))
                offset += len(rows)
                if offset >= count:
                    break
        # Re-fetch previously active grants once after they disappear from the
        # active snapshot, so closures cannot remain labelled open indefinitely.
        candidates = active_ids | set(state.get("active_ids", []))
        refresh_after = frozen - timedelta(hours=source.get("detail_cache_hours", 24))
        def priority(ident):
            previous = cache.get(ident, {})
            hit = hits.get(ident, {"id": ident, "oppStatus": "closed"})
            changed = previous.get("signature") != digest(hit)
            return (0 if ident not in active_ids or (previous and changed) else 1 if not previous else 2,
                    previous.get("fetched_at", ""), ident)
        pending_closures = set()
        for ident in sorted(candidates, key=priority):
            hit = hits.get(ident, {"id": ident, "oppStatus": "closed"})
            previous = cache.get(ident, {})
            signature = digest(hit)
            fresh = (previous.get("signature") == signature and
                     (parse_date(previous.get("fetched_at")) or refresh_after) > refresh_after)
            if fresh:
                result.records.append(RawRecord(previous["record"], source, previous["fetched_at"], "grants"))
                continue
            if result.pages >= settings["max_pages"]:
                result.complete, result.message = False, "Grants.gov detail budget reached; cached records retained and missing details resume next run."
                if previous.get("record"):
                    result.records.append(RawRecord(previous["record"], source, previous["fetched_at"], "grants"))
                if ident not in active_ids:
                    pending_closures.add(ident)
                continue
            try:
                result.pages += 1
                response = http.request("POST", source["detail_url"], json={"opportunityId": int(ident)}).json()
                detail = response.get("data", {})
                if response.get("errorcode") != 0 or str(detail.get("id")) != ident or not detail.get("opportunityTitle"):
                    raise SourceUnavailable("Grants.gov detail could not be verified")
                # Keep only public procurement facts, not API tokens or contact records.
                facts = detail.get("synopsis") or detail.get("forecast") or {}
                fields = ("synopsisDesc", "forecastDesc", "agencyName", "postingDateStr", "responseDateStr",
                          "createTimeStampStr", "awardCeiling", "awardFloor", "applicantEligibilityDesc",
                          "applicantTypes", "fundingDescLinkUrl", "fundingDescLinkDesc", "responseDateDesc")
                record = {"id": ident, "title": detail["opportunityTitle"], "number": detail.get("opportunityNumber"),
                          "status": hit["oppStatus"], "openDate": hit.get("openDate"), "closeDate": hit.get("closeDate"),
                          "agency": hit.get("agency"), "facts": {k: facts[k] for k in fields if k in facts}}
                cache[ident] = {"record": record, "signature": signature, "fetched_at": frozen.isoformat()}
                result.records.append(RawRecord(record, source, frozen.isoformat(), "grants"))
            except SourceUnavailable:
                result.complete, result.message = False, "Some Grants.gov details unavailable; previous records retained."
                if previous.get("record"):
                    result.records.append(RawRecord(previous["record"], source, previous["fetched_at"], "grants"))
                if ident not in active_ids:
                    pending_closures.add(ident)
        result.state["active_ids"] = sorted(active_ids | pending_closures)
        result.state["detail_cache"] = {ident: value for ident, value in cache.items() if ident in active_ids | pending_closures}
        if result.complete:
            result.state["watermark"] = frozen.isoformat()
    except SourceUnavailable as exc:
        defer_collection(result, exc)
    return result


class EmailAlertCollector:
    """Extension contract: accept verified supplier-alert exports, never an authenticated scraper."""
    def collect(self, source, state, frozen, http, settings, terms):
        raise SourceUnavailable("Email alerts require an authorised mailbox integration and sender mapping")


def collect_german_daily(source, state, frozen, http, settings, terms):
    from .german_notices import collect_german_notices
    return collect_german_notices(source, state, frozen, http, settings, terms)


def collect_nyc(source, state, frozen, http, settings, terms):
    from .nyc_city_record import collect_nyc_city_record
    return collect_nyc_city_record(source, state, frozen, http, settings, terms)


def collect_spain(source, state, frozen, http, settings, terms):
    from .spain_notices import collect_spain_notices
    return collect_spain_notices(source, state, frozen, http, settings, terms)


COLLECTORS = {"ocds_cursor": collect_cursor, "ocds_monthly": collect_monthly, "govuk": collect_govuk,
              "digital_outcomes": collect_digital, "upcoming_agreements": collect_upcoming, "ted": collect_ted,
              "usaspending": collect_usaspending, "grants": collect_grants, "german_daily": collect_german_daily,
              "nyc_city_record": collect_nyc, "spain_atom": collect_spain}


def collect_with_backfill(source, state, frozen, http, settings, terms, charter):
    """Reserve a bounded historical lane without moving the fresh-data checkpoint."""
    retry_at = parse_date(state.get("retry_at"))
    if retry_at and retry_at > frozen:
        result = Collection(state=dict(state), complete=False, message="Source retry cooldown is active; prior records retained.")
        if source.get("fallback_url") and settings["max_pages"] > 0:
            try:
                result.pages += 1
                result.records.extend(wales_listing(source, frozen, http))
                result.message = "API retry cooldown is active; latest public listing retained with partial coverage."
            except SourceUnavailable:
                pass
        return result
    state = {key: value for key, value in state.items() if key != "retry_at"}
    collector = COLLECTORS[source["collector"]]
    supported = source["collector"] in ("ocds_cursor", "ocds_monthly", "ted", "govuk")
    budget = settings["max_pages"]
    policy = charter["discovery"]
    historical = state.get("discovery_backfill", {})
    if historical.get("version") != charter["version"]:
        historical = {"version": charter["version"], "cursor": (frozen - timedelta(days=policy["backfill_days"])).isoformat(),
                      "until": (frozen - timedelta(days=settings["lookback_days"])).isoformat(), "checkpoint": {}}
    if parse_date(historical["cursor"]) >= parse_date(historical["until"]):
        historical = {**historical, "complete": True}
    reserve = max(1, int(budget * policy["backfill_page_fraction"])) if supported and budget >= 4 and not historical.get("complete") else 0
    result = collector(source, state, frozen, http, {**settings, "max_pages": budget - reserve}, terms)
    if not reserve or parse_date(result.state.get("retry_at")):
        return result
    until = parse_date(historical["until"])
    remaining = reserve
    while remaining > 0 and not historical.get("complete"):
        begin = parse_date(historical["cursor"])
        # Search sources amortise their query-family overhead across a larger window.
        span = 30 if source["collector"] == "govuk" else 1
        end = min(begin + timedelta(days=span), until)
        historical_source = dict(source)
        if source["collector"] == "ocds_monthly":
            end = min((begin.replace(day=28) + timedelta(days=4)).replace(day=1), until)
            historical_source["recent_months"] = 1
        checkpoint = historical.get("checkpoint") or {"watermark": begin.isoformat()}
        if source["collector"] == "ted":
            countries = [code for country, market in terms["markets"].items() if market["enabled"] and country in source.get("countries", terms["markets"]) for code in market["ted_codes"]]
            checkpoint = {**checkpoint, "query_version": digest([sorted(countries), "buyer-jurisdiction-v2"])}
        try:
            backfill = collector(historical_source, checkpoint, end - timedelta(seconds=1) if source["collector"] == "ocds_monthly" else end,
                                 http, {**settings, "max_pages": remaining, "lookback_days": span}, terms)
            for raw in backfill.records:
                raw.retrieved_at = frozen.isoformat()
            result.records.extend(backfill.records)
            result.pages += backfill.pages
            remaining -= max(1, backfill.pages)
            historical = {**historical, "checkpoint": backfill.state}
            if not backfill.complete:
                break
            historical.update(cursor=end.isoformat(), checkpoint={}, complete=end >= until)
        except SourceUnavailable:
            break  # Historical failure must not discard successful current retrieval.
    result.state["discovery_backfill"] = historical
    return result
