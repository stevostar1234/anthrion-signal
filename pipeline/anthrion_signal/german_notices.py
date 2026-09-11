"""Germany's documented daily exports, enriched from their original eForms XML."""

import copy
import io
import json
import re
from datetime import UTC, timedelta
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

from .collectors import Collection, RawRecord, SourceUnavailable, releases
from .normalise import normalise_ocds, set_hashes
from .utils import clean, iso, parse_date, unique


NS = {
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
}
NOTICE_ID = re.compile(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")
MAX_ARCHIVE_BYTES = 45_000_000
MAX_EXPANDED_BYTES = 100_000_000
MAX_FILE_BYTES = 8_000_000


def archive_files(content, suffix):
    """Read bounded archives in memory; never extract source-controlled paths."""
    if len(content) > MAX_ARCHIVE_BYTES:
        raise SourceUnavailable("German export exceeded its compressed size limit")
    try:
        with ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            if len(entries) > 10_000 or sum(item.file_size for item in entries) > MAX_EXPANDED_BYTES:
                raise SourceUnavailable("German export exceeded its expanded size limit")
            result = {}
            for item in entries:
                path = PurePosixPath(item.filename)
                if item.is_dir():
                    continue
                if path.is_absolute() or ".." in path.parts or "\\" in item.filename:
                    raise SourceUnavailable("German export contained an unexpected archive path")
                if path.suffix.lower() != suffix or item.file_size > MAX_FILE_BYTES:
                    raise SourceUnavailable("German export contained an unexpected file")
                if path.stem in result:
                    raise SourceUnavailable("German export repeated a notice file")
                result[path.stem] = archive.read(item)
            return result
    except (BadZipFile, OSError, RuntimeError, ValueError):
        raise SourceUnavailable("German export was not a valid notice archive") from None


def xml_text(node, path):
    return clean(node.findtext(path, default="", namespaces=NS))


def response_deadline(period):
    day = xml_text(period, "cbc:EndDate")
    clock = xml_text(period, "cbc:EndTime")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:Z|[+-]\d{2}:\d{2})?", day):
        return None
    if not clock:
        return iso(day[:10])
    # UBL dates and times can both carry an offset. Use the time's offset once.
    if not re.fullmatch(r"\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?", clock):
        return None
    if not re.search(r"(?:Z|[+-]\d{2}:\d{2})$", clock):
        offset = re.search(r"(?:Z|[+-]\d{2}:\d{2})$", day)
        if not offset:
            return iso(day[:10])  # Do not invent a local submission time.
        clock += offset.group()
    return iso(day[:10] + "T" + clock)


def enrich_release(release, xml, stem):
    if b"<!DOCTYPE" in xml.upper() or b"<!ENTITY" in xml.upper():
        raise SourceUnavailable("German notice contained unsupported XML declarations")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        raise SourceUnavailable("German notice contained invalid eForms XML") from None
    identifier = xml_text(root, "cbc:ID")
    version = xml_text(root, "cbc:VersionID")
    valid_identifier = NOTICE_ID.fullmatch(identifier) or re.fullmatch(r"\d{1,16}", identifier)
    if not valid_identifier or f"{identifier}-{version}" != stem:
        raise SourceUnavailable("German notice identifier did not match its archive entry")
    if release.get("id") != identifier:
        raise SourceUnavailable("German OCDS and eForms identifiers did not agree")
    result = copy.deepcopy(release)
    result["id"] = f"{identifier}-{version}"
    result["german_notice_id"] = identifier
    result["german_notice_version"] = version
    result["previous_notice_ids"] = unique([
        match.group() for ref in root.findall(".//cac:NoticeDocumentReference/cbc:ID", NS)
        if (match := NOTICE_ID.match(clean(ref.text)))
    ])
    tender = result.setdefault("tender", {})
    internal_reference = xml_text(root, "cac:ProcurementProject/cbc:ID")
    if internal_reference:
        tender["id"] = internal_reference
    notice_type = xml_text(root, "cbc:NoticeTypeCode")
    tag = " ".join(result.get("tag") or []).lower()
    is_result = root.tag.endswith("}ContractAwardNotice") or "award" in tag or "contract" in tag
    if is_result or notice_type == "dir-awa-pre":
        result["tag"] = ["award"]
        tender["status"] = "complete"
    elif any(word in tag for word in ("cancel", "withdraw")):
        tender["status"] = "withdrawn" if "withdraw" in tag else "cancelled"
    else:
        tender.setdefault("status", "active" if "tender" in tag else "planned")
    documents = tender.setdefault("documents", [])
    documents.insert(0, {
        "id": f"german-notice-{identifier}-{version}",
        "title": "Official procurement notice",
        "documentType": "awardNotice" if is_result else "tenderNotice",
        "noticeType": notice_type,
        "url": f"https://oeffentlichevergabe.de/ui/de/notices/{identifier}",
    })
    deadlines = []
    for lot_node in root.findall("cac:ProcurementProjectLot", NS):
        lot_id = xml_text(lot_node, "cbc:ID")
        periods = lot_node.findall("cac:TenderingProcess/cac:TenderSubmissionDeadlinePeriod", NS)
        periods += lot_node.findall("cac:TenderingProcess/cac:ParticipationRequestReceptionPeriod", NS)
        lot_deadlines = [value for period in periods if (value := response_deadline(period))]
        if lot_deadlines:
            deadline = min(lot_deadlines, key=parse_date)
            deadlines.append(deadline)
            for lot in tender.get("lots", []):
                if lot.get("id") == lot_id:
                    lot["tenderPeriod"] = {"endDate": deadline}
        systems = lot_node.findall("cac:TenderingProcess/cac:ContractingSystem/cbc:ContractingSystemTypeCode", NS)
        if any(code.get("listName") == "framework-agreement" and clean(code.text) in
               ("fa-mix", "fa-w-rc", "fa-wo-rc") for code in systems):
            tender.setdefault("techniques", {})["frameworkAgreement"] = {"description": "Framework agreement"}
    if deadlines:
        tender["tenderPeriod"] = {"endDate": min(deadlines, key=parse_date)}
        if len(set(deadlines)) > 1:
            tender["eligibilityCriteria"] = clean(tender.get("eligibilityCriteria")) + (
                " Multiple lot deadlines are published. The earliest is shown; check the source notice for the relevant lot."
            )
    return result


def relevant_release(release, terms, tracked):
    # Closing notices can omit the original title/CPV and arrive before their
    # older competition during backfill. Never discard that retirement evidence.
    tags = " ".join(release.get("tag") or []).lower()
    if any(word in tags for word in ("award", "contract", "cancel", "withdraw")):
        return True
    if release.get("ocid") in tracked:
        return True
    tender = release.get("tender") or {}
    prefixes = tuple(str(value) for value in terms.get("cpv_prefixes", ("48", "72")))
    classes = [tender.get("classification") or {}]
    for item in tender.get("items") or []:
        classes.extend([item.get("classification") or {}, *(item.get("additionalClassifications") or [])])
    if any(str(item.get("id", "")).startswith(prefixes) for item in classes if item.get("scheme", "CPV") == "CPV"):
        return True
    text = " ".join([clean(tender.get("title")), clean(tender.get("description")),
                     *(clean(lot.get("description")) for lot in tender.get("lots") or [])])
    text = re.sub(r"https?://\S+", " ", text).casefold()
    keywords = [*terms.get("high_intent", []), *terms.get("supplementary", []),
                "kundenbeziehungsmanagement", "kundenmanagement", "fallmanagement", "kuenstliche intelligenz",
                "k\u00fcnstliche intelligenz", "digitalisierung", "datenplattform", "prozessautomatisierung"]
    return any(re.search(r"(?<!\w)" + re.escape(keyword.casefold()) + r"(?!\w)", text) for keyword in keywords)


def collect_german_notices(source, state, frozen, http, settings, terms):
    result = Collection(state=copy.deepcopy(state))
    last_day = frozen.astimezone(UTC).date() - timedelta(days=1)
    scheduled = parse_date(state.get("scheduled_through"))
    first_day = scheduled.date() + timedelta(days=1) if scheduled else last_day - timedelta(
        days=max(1, min(365, int(source.get("initial_lookback_days", settings["lookback_days"]))))) + timedelta(days=1)
    pending = {day for value in state.get("pending_days", []) if (day := parse_date(value)) and day.date() <= last_day}
    days = {value.date() for value in pending}
    if first_day <= last_day:
        days.update(first_day + timedelta(days=i) for i in range((last_day - first_day).days + 1))
    days = sorted(days, reverse=True)
    result.state["scheduled_through"] = last_day.isoformat()
    result.state["pending_days"] = [day.isoformat() for day in days]
    tracked = set(state.get("tracked_ocids", []))
    budget = min(max(0, settings["max_pages"] // 2), int(source.get("max_days_per_run", 3)))
    for day in days[:budget]:
        try:
            result.pages += 1
            package = http.request("GET", source["url"], params={"pubDay": day.isoformat(), "format": "ocds.zip"})
            ocds = archive_files(package.content, ".json")
            result.pages += 1
            original = http.request("GET", source["url"], params={"pubDay": day.isoformat(), "format": "eforms.zip"})
            eforms = archive_files(original.content, ".xml")
            if set(ocds) != set(eforms):
                raise SourceUnavailable("German exports did not contain matching notice versions")
            day_records = []
            for stem, data in ocds.items():
                try:
                    package_releases = releases(json.loads(data))
                except (ValueError, UnicodeDecodeError):
                    raise SourceUnavailable("German export contained invalid OCDS JSON") from None
                for release in package_releases:
                    enriched = enrich_release(release, eforms[stem], stem)
                    if relevant_release(enriched, terms, tracked):
                        day_records.append(RawRecord(enriched, source, frozen.isoformat(), "german_ocds"))
            # A failed or incomplete format pair never advances that day's checkpoint.
            result.records.extend(day_records)
            tracked.update(raw.data["ocid"] for raw in day_records if raw.data.get("ocid") and
                           not any(tag in " ".join(raw.data.get("tag", [])) for tag in ("award", "contract")))
            result.state["pending_days"].remove(day.isoformat())
            result.state["watermark"] = max(result.state.get("watermark", ""), day.isoformat())
        except SourceUnavailable as exc:
            result.complete, result.message = False, str(exc)
            break
    result.state["tracked_ocids"] = sorted(tracked)
    if result.state["pending_days"] and result.complete:
        result.complete = False
        result.message = "German daily export budget reached; remaining days will resume next run."
    return result


def normalise_german_notice(raw, prior=None):
    signal = normalise_ocds(raw, prior)
    if signal:
        signal.external_ids = unique([
            *signal.external_ids,
            "ted-notice:" + raw.data["german_notice_id"] if NOTICE_ID.fullmatch(raw.data["german_notice_id"]) else None,
            *("ted-notice:" + identifier for identifier in raw.data.get("previous_notice_ids", [])),
        ])
        return set_hashes(signal)
    return None
