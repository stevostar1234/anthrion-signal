"""Read-only NYC City Record adapter using the official DCAS open dataset."""

import re
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from .collectors import Collection, RawRecord, SourceUnavailable
from .models import Document
from .normalise import base, money
from .utils import canonical_url, clean, parse_date, unique


DATASET_URL = "https://data.cityofnewyork.us/resource/dg92-zbpx.json"
NOTICE_URL = "https://a856-cityrecord.nyc.gov/RequestDetail/{}"
QUERY_VERSION = "nyc-procurement-v1"
PUBLIC_FIELDS = (
    "request_id", "start_date", "end_date", "agency_name", "type_of_notice_description",
    "category_description", "short_title", "selection_method_description", "section_name",
    "special_case_reason_description", "pin", "due_date", "contract_amount", "vendor_name",
    "additional_description_1", "additional_description_2", "additional_description_3",
    "other_info_1", "other_info_2", "other_info_3", "document_links",
)


def nyc_timestamp(value):
    """Socrata calendar_date is NYC wall time, not a UTC timestamp."""
    if not isinstance(value, str) or not value:
        return None
    try:
        local = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if local.tzinfo is not None:
        return local.astimezone(UTC).isoformat(timespec="seconds")
    zone = ZoneInfo("America/New_York")
    first, second = local.replace(tzinfo=zone, fold=0), local.replace(tzinfo=zone, fold=1)
    # A nonexistent or repeated clock time needs a source check, not a guessed deadline.
    if first.utcoffset() != second.utcoffset():
        return None
    return first.astimezone(UTC).isoformat(timespec="seconds")


def _local_datetime(value):
    return value.astimezone(ZoneInfo("America/New_York")).replace(tzinfo=None).isoformat(timespec="seconds")


def _unconfirmed_postponement(description, deadline, reference):
    event = r"\b(?:bid|proposal|tender)\s+(?:opening|opens|closing|deadline|due date)\b"
    # Some DOE notices put POSTPONED in the date's position and retain a distant
    # catalogue date. Neither field establishes a reliable response window.
    placeholder = re.search(event + r"[^.!?\n]{0,140}\bon\s*[\W_]*postponed\b", description, re.IGNORECASE)
    indefinite = re.search(event + r"\s+(?:(?:has been|is|will be)\s+)?postponed\s+"
                           r"(?:indefinitely|until further notice)\b", description, re.IGNORECASE)
    due = parse_date(deadline)
    distant = bool(due and reference and due - reference > timedelta(days=5 * 366))
    return bool((placeholder or indefinite) and (not due or distant))


def collect_nyc_city_record(source, state, frozen, http, settings, terms):
    """Replay current solicitations plus recent changes, with resumable keyset paging."""
    result = Collection(state=dict(state))
    pending = state.get("pending") if state.get("query_version") == QUERY_VERSION else None
    watermark = parse_date(state.get("watermark"))
    refresh_hours = max(1, int(source.get("refresh_hours", 24)))
    if not settings.get("refresh_daily") and not pending and state.get("query_version") == QUERY_VERSION and watermark:
        if timedelta(0) <= frozen - watermark < timedelta(hours=refresh_hours):
            return result
    if not isinstance(pending, dict) or not all(parse_date(pending.get(k)) for k in ("from", "until")):
        start = watermark - timedelta(days=7) if watermark else frozen - timedelta(days=settings["lookback_days"])
        pending = {"from": start.isoformat(), "until": frozen.isoformat(), "cursor": "0"}
    else:
        pending = dict(pending)
    cursor = str(pending.get("cursor", "0"))
    if not re.fullmatch(r"\d{1,16}", cursor):
        cursor = "0"
    result.state.update(query_version=QUERY_VERSION, pending=pending)
    start = _local_datetime(parse_date(pending["from"]))
    end = _local_datetime(parse_date(pending["until"]))
    limit = max(1, min(int(source.get("limit", 200)), 500))
    budget = max(0, min(settings["max_pages"], int(source.get("max_pages_per_run", settings["max_pages"]))))
    try:
        while result.pages < budget:
            where = (
                "section_name='Procurement' "
                f"AND start_date <= '{end}' "
                f"AND (start_date >= '{start}' OR due_date >= '{end}') "
                f"AND request_id > {cursor}"
            )
            result.pages += 1
            rows = http.json(source.get("url", DATASET_URL), params={
                "$select": ",".join(PUBLIC_FIELDS), "$where": where,
                "$order": "request_id ASC", "$limit": limit,
            })
            if not isinstance(rows, list):
                raise SourceUnavailable("NYC returned an invalid procurement page")
            batch, last = [], int(cursor)
            for row in rows:
                ident = str(row.get("request_id", "")) if isinstance(row, dict) else ""
                if not re.fullmatch(r"\d{1,16}", ident) or int(ident) <= last:
                    raise SourceUnavailable("NYC procurement pagination did not advance")
                if not row.get("short_title") or row.get("section_name") != "Procurement":
                    raise SourceUnavailable("NYC procurement page omitted required notice fields")
                facts = {k: row[k] for k in PUBLIC_FIELDS if k in row}
                facts["id"] = ident
                batch.append(RawRecord(facts, source, frozen.isoformat(), "nyc_city_record"))
                last = int(ident)
            result.records.extend(batch)
            cursor = str(last)
            pending["cursor"] = cursor
            if len(rows) < limit:
                result.state["watermark"] = pending["until"]
                result.state.pop("pending", None)
                return result
        result.complete = False
        result.message = "NYC collection budget reached; remaining notices resume next run."
    except SourceUnavailable as exc:
        result.complete = False
        result.message = str(exc)
    return result


def normalise_nyc_city_record(raw):
    r = raw.data
    ident = str(r.get("request_id", ""))
    if not re.fullmatch(r"\d{1,16}", ident) or r.get("section_name") != "Procurement":
        return None
    notice = clean(r.get("type_of_notice_description"))
    method = clean(r.get("selection_method_description"))
    title = clean(r.get("short_title"))
    body = clean(" ".join(str(r.get(f"additional_description_{n}") or "") for n in range(1, 4)))
    other = clean(" ".join(str(r.get(f"other_info_{n}") or "") for n in range(1, 4)))
    description = "\n\n".join(part for part in (body, other) if part)
    notice_lower, method_lower = notice.lower(), method.lower()
    terminal = bool(re.search(r"cancelled|canceled|withdrawn|rescinded", notice_lower + " " + title.lower()))
    awarded = notice_lower in ("award", "intent to award")
    if not terminal and not awarded and notice_lower != "solicitation":
        return None
    unavailable_route = bool(re.search(r"sole source|renewal|negotiated acquisition extension", method_lower))
    if terminal:
        signal_type, stage, status = "LIVE_TENDER", "tender", "cancelled"
    elif awarded:
        signal_type, stage, status = "AWARD", "award", "awarded"
    elif unavailable_route:
        signal_type, stage, status = "LIVE_TENDER", "tender", "closed"
    elif method_lower == "request for information":
        signal_type, stage, status = "RFI", "planning", "active"
    elif method_lower in ("request for proposals", "competitive sealed proposals"):
        signal_type, stage, status = "RFP", "tender", "active"
    else:
        signal_type, stage, status = "LIVE_TENDER", "tender", "active"
    buyer = clean(r.get("agency_name"))
    pin = clean(r.get("pin"))
    url = NOTICE_URL.format(ident)
    linked = r.get("document_links") or {}
    document_url = canonical_url(linked.get("url", "")) if isinstance(linked, dict) else ""
    documents = [Document(title="Official procurement notice", url=url, kind="tenderNotice")]
    if document_url and document_url != url:
        documents.append(Document(title="Procurement documents", url=document_url))
    deadline = nyc_timestamp(r.get("due_date"))
    published = nyc_timestamp(r.get("start_date"))
    postponed = status == "active" and _unconfirmed_postponement(
        description, deadline, parse_date(published) or parse_date(raw.retrieved_at))
    if postponed:
        status, deadline = "postponed", None
    if r.get("due_date") and not deadline:
        if not postponed:
            description += f"\n\nPublished NYC deadline requires source verification: {clean(r['due_date'])}."
    signal = base(raw, title=title, description=description, url=url,
        buyer_name=buyer or None, signal_type=signal_type, procurement_stage=stage, status=status,
        notice_type=notice, published_at=published, updated_at=published, deadline_at=deadline,
        external_ids=unique(["nyc:" + ident, f"buyer-ref:{buyer.lower()}:{pin}" if buyer and pin else None]),
        countries=["US"], regions=["New York City"],
        value_max=money(r.get("contract_amount")) if awarded else None,
        currency="USD" if awarded and money(r.get("contract_amount")) is not None else None,
        incumbent_supplier=clean(r.get("vendor_name")) or None if awarded else None,
        eligibility_text=clean(r.get("special_case_reason_description")) or None, documents=documents)
    if signal and unavailable_route:
        signal.exclusion_reasons.append("Source identifies a noncompetitive or incumbent-only procurement route.")
    if signal and postponed:
        signal.exclusion_reasons.append("Source postpones the bid opening without a reliable replacement response deadline.")
    return signal
