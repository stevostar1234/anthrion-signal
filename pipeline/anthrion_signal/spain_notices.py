"""Bounded PLACSP Atom/CODICE discovery from Spain's official contracting profiles."""

import copy
import re
import unicodedata
from datetime import UTC, date, datetime, timedelta
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

from .collectors import Collection, RawRecord, SourceUnavailable, defer_collection
from .models import Document
from .normalise import base, money
from .utils import canonical_url, clean, digest, iso, unique


FEED_URL = "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom"
VERSION = "placsp-atom-v1"
HOSTS = {"contrataciondelestado.es", "contrataciondelsectorpublico.gob.es"}
NS = {
    "a": "http://www.w3.org/2005/Atom",
    "cac": "urn:dgpe:names:draft:codice:schema:xsd:CommonAggregateComponents-2",
    "cbc": "urn:dgpe:names:draft:codice:schema:xsd:CommonBasicComponents-2",
    "ext": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonAggregateComponents-2",
    "ebc": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonBasicComponents-2",
    "at": "http://purl.org/atompub/tombstones/1.0",
}
FEED_PATH = re.compile(r"/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3(?:_\d{8}_\d{6}(?:_\d+)?)?\.atom")
ENTRY_PATH = re.compile(r"/sindicacion/licitacionesPerfilContratante/(\d{1,20})")
STATES = {"PRE", "PUB", "EV", "ADJ", "RES", "ANUL", "WITHDRAWN"}
TERMINAL = {"EV", "ADJ", "RES", "ANUL", "WITHDRAWN"}
MAX_XML_BYTES = 40 * 1024 * 1024


def _aware(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.astimezone(UTC) if parsed.tzinfo is not None else None
    except (TypeError, ValueError):
        return None


def _official_url(value, pattern):
    try:
        url = urlsplit(value)
        match = pattern.fullmatch(url.path)
        if (url.scheme != "https" or url.hostname not in HOSTS or url.port not in (None, 443)
                or url.username or url.password or url.query or url.fragment or not match):
            raise ValueError
        return match
    except (TypeError, ValueError):
        raise SourceUnavailable("PLACSP returned an invalid official feed or entry URL") from None


def _page_key(url):
    _official_url(url, FEED_PATH)
    return urlsplit(url).path


def _request_page(http, url, headers):
    response = http.request("GET", url, headers=headers, follow_redirects=False)
    if response.status_code not in (200, 304):
        raise SourceUnavailable(f"PLACSP returned unexpected HTTP {response.status_code}; checkpoint retained")
    return response


def _text(node, path):
    found = node.find(path, NS)
    return clean(" ".join(found.itertext())) if found is not None else ""


def _texts(node, path):
    return unique(clean(" ".join(found.itertext())) for found in node.findall(path, NS))


def submission_deadline(day, clock):
    """Only a source-supplied UTC offset can turn a CODICE deadline into an instant."""
    day_match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})(Z|[+-]\d{2}:\d{2})?", day or "")
    time_match = re.fullmatch(r"(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?", clock or "")
    if not day_match or not time_match:
        return None
    date_zone, time_zone = day_match[2], time_match[2]
    if date_zone and time_zone and date_zone.replace("Z", "+00:00") != time_zone.replace("Z", "+00:00"):
        return None
    zone = time_zone or date_zone
    parsed = _aware(day_match[1] + "T" + time_match[1] + zone) if zone else None
    return parsed.isoformat(timespec="seconds") if parsed else None


def _deadline_passed(facts, frozen):
    exact = _aware(facts.get("deadline_at"))
    if exact:
        return exact <= frozen
    # No time zone is published for most CODICE deadlines. Two calendar days of
    # grace avoids claiming an exact cutoff, including Spanish island clocks.
    try:
        local_day = date.fromisoformat(facts.get("deadline_date", "")[:10])
        return frozen.astimezone(UTC).date() > local_day + timedelta(days=1)
    except ValueError:
        return False


def _entry_facts(entry):
    entry_id = _text(entry, "a:id")
    ident = _official_url(entry_id, ENTRY_PATH)[1]
    updated = _aware(_text(entry, "a:updated"))
    folder = entry.find("ext:ContractFolderStatus", NS)
    if folder is None or updated is None:
        raise SourceUnavailable("PLACSP entry omitted its dated contract state")
    state = _text(folder, "ebc:ContractFolderStatusCode")
    if state not in STATES - {"WITHDRAWN"}:
        raise SourceUnavailable("PLACSP returned an unknown contract state")
    title = _text(folder, "cac:ProcurementProject/cbc:Name")
    if not title:
        raise SourceUnavailable("PLACSP entry omitted its procurement title")
    links = [link.get("href", "") for link in entry.findall("a:link", NS)
             if link.get("rel", "alternate") == "alternate"]
    url = next((canonical_url(link) for link in links if urlsplit(link).hostname in HOSTS), None)
    if not url:
        raise SourceUnavailable("PLACSP entry omitted its official notice link")
    process = "cac:TenderingProcess/"
    deadline = process + "cac:TenderSubmissionDeadlinePeriod/"
    day, clock = _text(folder, deadline + "cbc:EndDate"), _text(folder, deadline + "cbc:EndTime")
    buyer_path = "ext:LocatedContractingParty/cac:Party/"
    amount_node = None
    for name in ("EstimatedOverallContractAmount", "TaxExclusiveAmount", "TotalAmount"):
        candidate = folder.find("cac:ProcurementProject/cac:BudgetAmount/cbc:" + name, NS)
        if candidate is not None and money(candidate.text) is not None:
            amount_node = candidate
            break
    cpvs = _texts(folder, "cac:ProcurementProject/cac:RequiredCommodityClassification/cbc:ItemClassificationCode")
    lots = []
    for lot in folder.findall("cac:ProcurementProjectLot", NS):
        lot_cpvs = _texts(lot, "cac:ProcurementProject/cac:RequiredCommodityClassification/cbc:ItemClassificationCode")
        cpvs.extend(lot_cpvs)
        lots.append({"id": _text(lot, "cbc:ID"), "title": _text(lot, "cac:ProcurementProject/cbc:Name"),
                     "description": _text(lot, "cac:ProcurementProject/cbc:Description"), "cpv_codes": lot_cpvs})
    result_codes = _texts(folder, "cac:TenderResult/cbc:ResultCode")
    publications = _texts(folder, "ext:ValidNoticeInfo/ext:AdditionalPublicationStatus/"
                          "ext:AdditionalPublicationDocumentReference/cbc:IssueDate")
    documents = []
    for doc in folder.findall("cac:LegalDocumentReference", NS) + folder.findall("cac:TechnicalDocumentReference", NS):
        link = canonical_url(_text(doc, "cac:Attachment/cac:ExternalReference/cbc:URI"))
        if link:
            documents.append({"url": link, "title": _text(doc, "cbc:ID") or "Procurement documents"})
    ted_ids = []
    for element in folder.iter():
        if element.tag not in ("{" + NS["cbc"] + "}URI", "{" + NS["cbc"] + "}ID"):
            continue
        link = urlsplit(clean(element.text))
        if link.scheme == "https" and link.hostname == "ted.europa.eu":
            number = re.search(r"(?:^|/)(\d{1,8}-\d{4})(?:$|/)", link.path)
            if number:
                ted_ids.append("ted:" + number[1])
    return {
        "id": ident, "entry_id": entry_id, "url": url, "updated": updated.isoformat(), "state": state,
        "title": title, "description": _text(folder, "cac:ProcurementProject/cbc:Description"),
        "buyer": _text(folder, buyer_path + "cac:PartyName/cbc:Name"),
        "buyer_identifiers": _texts(folder, buyer_path + "cac:PartyIdentification/cbc:ID"),
        "reference": _text(folder, "cbc:ContractFolderID"), "cpv_codes": unique(cpvs), "lots": lots,
        "regions": _texts(folder, "cac:ProcurementProject/cac:RealizedLocation/cbc:CountrySubentity"),
        "value": money(amount_node.text) if amount_node is not None else None,
        "currency": amount_node.get("currencyID") if amount_node is not None else None,
        "deadline_date": day, "deadline_time": clock, "deadline_at": submission_deadline(day, clock),
        "deadline_description": _text(folder, deadline + "cbc:Description"),
        "procedure": _text(folder, process + "cbc:ProcedureCode"),
        "contracting_system": _text(folder, process + "cbc:ContractingSystemCode"),
        "result_codes": result_codes,
        "winner": "; ".join(_texts(folder, "cac:TenderResult/cac:WinningParty/cac:PartyName/cbc:Name")),
        "published": min((value for value in publications if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)), default=None),
        "documents": documents, "ted_ids": unique(ted_ids),
    }


def parse_placsp_page(content):
    if not isinstance(content, bytes) or len(content) > MAX_XML_BYTES or b"\x00" in content:
        raise SourceUnavailable("PLACSP XML exceeded the size or encoding limit")
    try:
        text = content.decode("utf-8-sig")
        if re.search(r"<!\s*(?:DOCTYPE|ENTITY)\b", text, re.IGNORECASE):
            raise ValueError
        root = ET.fromstring(text)
    except (UnicodeDecodeError, ET.ParseError, ValueError):
        raise SourceUnavailable("PLACSP returned invalid or unsafe XML") from None
    if root.tag != "{" + NS["a"] + "}feed":
        raise SourceUnavailable("PLACSP returned a non-Atom response")
    stack, count = [(root, 0)], 0
    while stack:
        node, depth = stack.pop()
        count += 1
        if count > 400_000 or depth > 70:
            raise SourceUnavailable("PLACSP XML exceeded the structure limit")
        stack.extend((child, depth + 1) for child in node)
    updated = _aware(_text(root, "a:updated"))
    if not updated:
        raise SourceUnavailable("PLACSP feed omitted its update timestamp")
    next_links = [link.get("href", "") for link in root.findall("a:link", NS) if link.get("rel") == "next"]
    if len(next_links) > 1:
        raise SourceUnavailable("PLACSP returned ambiguous pagination")
    next_url = next_links[0] if next_links else None
    if next_url:
        _official_url(next_url, FEED_PATH)
    entries = root.findall("a:entry", NS)
    tombstones = root.findall("at:deleted-entry", NS)
    if len(entries) + len(tombstones) > 2_000:
        raise SourceUnavailable("PLACSP page exceeded its notice limit")
    facts = [_entry_facts(entry) for entry in entries]
    dates = [_aware(record["updated"]) for record in facts]
    if dates != sorted(dates, reverse=True):
        raise SourceUnavailable("PLACSP notice pagination is not newest first")
    for tombstone in tombstones:
        entry_id = tombstone.get("ref", "")
        ident = _official_url(entry_id, ENTRY_PATH)[1]
        when = _aware(tombstone.get("when"))
        if not when:
            raise SourceUnavailable("PLACSP withdrawal omitted its update timestamp")
        facts.append({"id": ident, "entry_id": entry_id, "url": entry_id, "state": "WITHDRAWN",
                      "updated": when.isoformat(), "title": "Withdrawn PLACSP notice " + ident})
    if any(_aware(record["updated"]) > updated for record in facts):
        raise SourceUnavailable("PLACSP entry is newer than its feed checkpoint")
    return {"updated": updated.isoformat(), "records": facts, "next": next_url,
            "oldest_entry": min(dates).isoformat() if dates else None}


def relevant_placsp_record(record, terms):
    if record["state"] in TERMINAL:
        return True
    if any(str(code).startswith(("48", "72")) for code in record.get("cpv_codes", [])):
        return True
    text = " ".join([record.get("title", ""), record.get("description", ""),
                     *[lot.get("title", "") + " " + lot.get("description", "") for lot in record.get("lots", [])]])
    text = "".join(char for char in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(char))
    keywords = {"crm", "salesforce", "mulesoft", "customer relationship", "gestion de clientes",
                "relacion con clientes", "plataforma digital", "inteligencia artificial", "automatizacion",
                "software", "integracion de sistemas", "gestion de expedientes", "portal ciudadano"}
    configured = terms.get("keywords", []) if isinstance(terms, dict) else terms if isinstance(terms, (list, tuple)) else []
    keywords.update(str(term).casefold() for term in configured if isinstance(term, str) and len(term) > 2)
    return any(re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text) for term in keywords)


def _retain_records(result, page, lane, source, frozen, terms):
    after, through = _aware(lane["after"]), _aware(lane["through"])
    versions, active = result.state["versions"], result.state["active_records"]
    for record in sorted(page["records"], key=lambda item: (item["updated"], item["state"] in TERMINAL)):
        updated = _aware(record["updated"])
        if not after <= updated <= through or not relevant_placsp_record(record, terms):
            continue
        ident = record["id"]
        previous = versions.get(ident)
        fingerprint = digest(record)
        terminal = record["state"] in TERMINAL
        if previous:
            old_time = _aware(previous[0])
            if old_time > updated or (old_time == updated and (previous[1] == fingerprint or (previous[2] and not terminal))):
                continue
        versions[ident] = [record["updated"], fingerprint, terminal]
        if record["state"] == "WITHDRAWN" and ident in active:
            record = {**active[ident], **record, "title": active[ident]["title"], "url": active[ident]["url"]}
        if record["state"] == "PUB" and _deadline_passed(record, frozen):
            record = {**record, "expired": True}
        if record["state"] == "PUB" and record.get("deadline_date") and not record.get("expired"):
            active[ident] = record
        else:
            active.pop(ident, None)
        result.records.append(RawRecord(record, source, frozen.isoformat(), "spain_placsp"))


def _needs_older(page, lane):
    oldest = _aware(page["oldest_entry"])
    return bool(page["next"] and (oldest is None or oldest >= _aware(lane["after"])))


def collect_spain_notices(source, state, frozen, http, settings, terms):
    """Poll the small head conditionally, then resume chronological archive windows."""
    saved = copy.deepcopy(state) if state.get("query_version") == VERSION else {}
    result = Collection(state=saved)
    saved.update(query_version=VERSION)
    saved.setdefault("pending", [])
    saved.setdefault("versions", {})
    saved.setdefault("active_records", {})
    for ident, record in list(saved["active_records"].items()):
        if _deadline_passed(record, frozen):
            result.records.append(RawRecord({**record, "expired": True}, source, frozen.isoformat(), "spain_placsp"))
            del saved["active_records"][ident]
    budget = max(0, min(int(settings["max_pages"]), int(source.get("max_pages_per_run", 3))))
    endpoint = source.get("url", FEED_URL)
    try:
        _official_url(endpoint, FEED_PATH)
        if not budget:
            raise SourceUnavailable("PLACSP request budget is zero; checkpoint retained")
        headers = {"Accept": "application/atom+xml, application/xml"}
        if saved.get("head_etag"):
            headers["If-None-Match"] = saved["head_etag"]
        if saved.get("head_last_modified"):
            headers["If-Modified-Since"] = saved["head_last_modified"]
        result.pages += 1
        response = _request_page(http, endpoint, headers)
        if response.status_code == 304:
            if not _aware(saved.get("head_updated")):
                raise SourceUnavailable("PLACSP returned 304 without an existing head checkpoint")
        else:
            page = parse_placsp_page(response.content)
            old_head, new_head = _aware(saved.get("head_updated")), _aware(page["updated"])
            if old_head and new_head < old_head:
                raise SourceUnavailable("PLACSP head moved backwards; checkpoint retained")
            cutoff = old_head or frozen - timedelta(days=max(1, int(source.get("initial_lookback_days", 7))))
            lane = {"url": endpoint, "after": cutoff.isoformat(), "through": page["updated"], "seen": [_page_key(endpoint)]}
            changed = digest(page) != saved.get("head_hash")
            if changed:
                _retain_records(result, page, lane, source, frozen, terms)
            if changed and _needs_older(page, lane):
                key = _page_key(page["next"])
                if key in lane["seen"]:
                    raise SourceUnavailable("PLACSP pagination repeated the head page")
                existing = next((item for item in saved["pending"] if _page_key(item["url"]) == key), None)
                if existing:
                    existing["after"] = min(_aware(existing["after"]), cutoff).isoformat()
                    existing["through"] = max(_aware(existing["through"]), new_head).isoformat()
                else:
                    if len(saved["pending"]) >= 32:
                        raise SourceUnavailable("PLACSP pending window limit reached; head checkpoint retained")
                    saved["pending"].insert(0, {**lane, "url": page["next"]})
            saved["head_updated"] = page["updated"]
            saved["head_hash"] = digest(page)
            saved["head_etag"] = response.headers.get("etag")
            saved["head_last_modified"] = response.headers.get("last-modified")
        while saved["pending"] and result.pages < budget:
            lane = saved["pending"][0]
            key = _page_key(lane["url"])
            if key in lane.get("seen", []):
                raise SourceUnavailable("PLACSP archive pagination repeated a page; checkpoint retained")
            result.pages += 1
            response = _request_page(http, lane["url"], {"Accept": "application/atom+xml, application/xml"})
            page = parse_placsp_page(response.content)
            next_key = _page_key(page["next"]) if _needs_older(page, lane) else None
            seen = lane.get("seen", []) + [key]
            if next_key and (next_key in seen or len(seen) >= 5_000):
                raise SourceUnavailable("PLACSP archive pagination did not advance safely; checkpoint retained")
            _retain_records(result, page, lane, source, frozen, terms)
            if next_key:
                lane.update(url=page["next"], seen=seen)
            else:
                saved["pending"].pop(0)
        if saved["pending"]:
            result.complete = False
            result.message = "PLACSP page budget reached; older notice windows will resume next run."
        else:
            saved["watermark"] = saved.get("head_updated")
        head_time = _aware(saved.get("head_updated"))
        if head_time and frozen - head_time > timedelta(hours=48):
            result.complete = False
            result.message = " ".join(filter(None, [result.message,
                f"PLACSP's published feed is dated {head_time.date()}; newer source coverage is not verified."]))
        # Older versions are still persisted by the canonical reconciliation layer.
        horizon = min([_aware(lane["after"]) for lane in saved["pending"]] +
                      [head_time - timedelta(days=2) if head_time else frozen - timedelta(days=7)])
        saved["versions"] = {key: value for key, value in saved["versions"].items() if _aware(value[0]) >= horizon}
    except SourceUnavailable as exc:
        defer_collection(result, exc)
    return result


def normalise_spain_notice(raw):
    record = raw.data
    ident, state = str(record.get("id", "")), record.get("state")
    if not re.fullmatch(r"\d{1,20}", ident) or state not in STATES:
        return None
    framework = {"1": "Framework agreement", "2": "Dynamic purchasing system"}.get(record.get("contracting_system"))
    awarded = state == "ADJ"
    status = {"PRE": "published", "PUB": "active", "EV": "closed", "ADJ": "awarded",
              "RES": "closed", "ANUL": "cancelled", "WITHDRAWN": "withdrawn"}[state]
    # Lot-level awards and direct/call-off routes cannot be advertised as a new
    # whole-procedure competition without a separately addressable open lot.
    noncompetitive = record.get("procedure") in {"3", "6", "7", "11", "12"}
    calloff = record.get("contracting_system") in {"3", "4"}
    partial_result = bool(record.get("result_codes")) and state in {"PRE", "PUB"}
    if state in {"PRE", "PUB"} and (noncompetitive or calloff or partial_result):
        status = "closed"
    elif record.get("expired"):
        status = "expired"
    kind = "AWARD" if awarded else "PIPELINE" if state == "PRE" else "FRAMEWORK" if framework else "LIVE_TENDER"
    stage = "award" if awarded else "planning" if state == "PRE" else "tender"
    description = record.get("description") or record.get("title", "")
    if record.get("deadline_date") and not record.get("deadline_at"):
        local_deadline = " ".join(filter(None, [record["deadline_date"], record.get("deadline_time")]))
        description += f"\n\nSubmission deadline (source local time): {local_deadline}. Time zone not supplied; check the source notice."
    if record.get("deadline_description"):
        description += "\n\n" + record["deadline_description"]
    buyer, reference = record.get("buyer"), record.get("reference")
    url = record.get("url") or record.get("entry_id")
    documents = [Document(title="Official PLACSP notice", url=url, kind="awardNotice" if awarded else "tenderNotice")]
    documents.extend(Document(**document) for document in record.get("documents", []))
    signal = base(raw, title=record.get("title", ""), description=description, url=url,
        buyer_name=buyer, buyer_identifiers=record.get("buyer_identifiers", []),
        signal_type=kind, procurement_stage=stage, status=status, notice_type="PLACSP " + state,
        external_ids=unique(["placsp:" + ident, *record.get("ted_ids", []),
                             f"buyer-ref:{buyer.lower()}:{reference}" if buyer and reference else None]),
        published_at=iso(record.get("published")), updated_at=record.get("updated"),
        deadline_at=record.get("deadline_at"), value_max=record.get("value"), currency=record.get("currency"),
        cpv_codes=record.get("cpv_codes", []), countries=["ES"], regions=record.get("regions", []),
        framework=framework, incumbent_supplier=record.get("winner") or None,
        lot_ids=unique(lot["id"] for lot in record.get("lots", []) if lot.get("id")), documents=documents)
    if signal:
        signal.id = "sig_" + digest(["placsp", ident])[:20]
        if noncompetitive or calloff:
            signal.exclusion_reasons.append("Source identifies a direct or existing supplier-panel procurement route.")
        if partial_result:
            signal.exclusion_reasons.append("Source reports procurement results; remaining open lots are not separately verified.")
    return signal
