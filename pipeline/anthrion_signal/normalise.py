import math
import re
from urllib.parse import urljoin

from .models import Document, Provenance, Signal
from .utils import canonical_url, clean, digest, iso, unique


MATERIAL_FIELDS = ["title", "description", "buyer_name", "deadline_at", "contract_start", "contract_end",
                   "extension_end", "value_min", "value_max", "currency", "procurement_stage", "signal_type",
                   "status", "framework", "eligibility_text", "incumbent_supplier", "cpv_codes", "lot_ids", "lot_id",
                   "countries", "regions"]


def material_payload(signal):
    data = signal.model_dump() if isinstance(signal, Signal) else signal
    result = {key: data.get(key) for key in MATERIAL_FIELDS}
    result["documents"] = sorted({canonical_url(d["url"]) for d in data.get("documents", [])
                                  if d.get("kind") not in ("tenderNotice", "awardNotice", "plannedProcurementNotice")})
    return result


def set_hashes(signal):
    payload = material_payload(signal)
    signal.content_hash = digest(payload)
    signal.material_change_hash = signal.content_hash
    signal.fingerprint = digest([clean(signal.buyer_name).casefold(), clean(signal.title).casefold(),
                                 (signal.deadline_at or "")[:10], signal.value_max, signal.currency, signal.lot_id])
    return signal


def money(value):
    try:
        amount = float(value)
        return amount if math.isfinite(amount) and amount >= 0 else None
    except (TypeError, ValueError):
        return None


def base(raw, *, title, description, url, **kwargs):
    source = raw.source
    data = raw.data
    url = canonical_url(url)
    if not url or not clean(title):
        return None
    ocid = kwargs.get("ocid")
    external_id = str(data.get("id", ""))
    signal = Signal(
        id="sig_" + digest([ocid or url, kwargs.get("lot_id")])[:20], source=source["id"],
        source_type=source["source_type"], source_urls=[url], primary_source_url=url,
        title=clean(title, 500), description=clean(description),
        first_seen_at=raw.retrieved_at, last_seen_at=raw.retrieved_at,
        last_material_update=kwargs.get("updated_at") or raw.retrieved_at,
        raw_source_hash=digest(data),
        provenance=[Provenance(source=source["id"], source_name=source["name"], url=url, release_id=external_id,
                               ocid=ocid, retrieved_at=raw.retrieved_at, published_at=kwargs.get("published_at"), raw_hash=digest(data))],
        **kwargs)
    return set_hashes(signal)


def documents_in(release):
    documents = list(release.get("tender", {}).get("documents", []) or [])
    documents.extend(release.get("planning", {}).get("documents", []) or [])
    for group in ("awards", "contracts"):
        for record in release.get(group, []) or []:
            documents.extend(record.get("documents", []) or [])
    result = []
    seen = set()
    for document in documents:
        url = canonical_url(document.get("url", ""))
        if url and url not in seen:
            seen.add(url)
            result.append(Document(title=clean(document.get("title") or document.get("description")
                                               or document.get("documentType") or "Procurement document", 240),
                                   url=url, kind=document.get("documentType") or "document"))
    return result


def classify(stage, title, description, notice_type=None, framework=None):
    text = (title + " " + description[:1000]).lower()
    if stage in ("award", "implementation", "contract"):
        return "AWARD"
    if stage == "planning":
        if re.search(r"\brfi\b|request for information", text):
            return "RFI"
        if notice_type == "UK2" or re.search(r"market engag|prior information|pre.market|soft market", text):
            return "EARLY_MARKET_ENGAGEMENT"
        return "PIPELINE"
    if framework and stage == "tender":
        return "FRAMEWORK"
    if re.search(r"\brfi\b|request for information", text):
        return "RFI"
    if re.search(r"\brfp\b|request for proposal", text):
        return "RFP"
    return "LIVE_TENDER"


def normalise_ocds(raw, prior=None):
    r, source = raw.data, raw.source
    tender = r.get("tender") or {}
    awards = r.get("awards") or []
    contracts = r.get("contracts") or []
    docs = documents_in(r)
    title = tender.get("title") or r.get("planning", {}).get("project", {}).get("title") or (prior.title if prior else None)
    if not title:
        return None
    description = tender.get("description") or ""
    lots = tender.get("lots") or []
    if lots:
        lot_text = " ".join(f"Lot {lot.get('id')}: {lot.get('title', '')}. {lot.get('description', '')}" for lot in lots)
        description = description + " " + lot_text
    if not description.strip() and prior:
        description = prior.description
    party = next((p for p in r.get("parties", []) if "buyer" in (p.get("roles") or [])), {})
    buyer = r.get("buyer") or party
    address = party.get("address") or {}
    tag = " ".join(r.get("tag") or []).lower()
    stage = "award" if "award" in tag or "contract" in tag else "planning" if "planning" in tag else "tender"
    status = tender.get("status") or "unknown"
    if "cancel" in tag or status in ("cancelled", "unsuccessful", "withdrawn"):
        status = "cancelled"
    notice_type = next((d.get("noticeType") for d in tender.get("documents", []) if d.get("noticeType")), None)
    value = tender.get("value") or {}
    min_value = tender.get("minValue") or {}
    if not value and len(lots) == 1:
        value = lots[0].get("value") or {}
    if not value and len(awards) == 1:
        value = awards[0].get("value") or {}
    period = tender.get("contractPeriod") or {}
    if not period and len(lots) == 1:
        period = lots[0].get("contractPeriod") or {}
    if len(contracts) == 1:
        period = contracts[0].get("period") or period
    elif len(awards) == 1:
        period = awards[0].get("contractPeriod") or period
    classification = [tender.get("classification") or {}]
    regions = [source.get("region"), address.get("region")]
    countries = [source.get("country")]
    for item in tender.get("items", []):
        classification.extend([item.get("classification") or {}, *(item.get("additionalClassifications") or [])])
        for delivery in item.get("deliveryAddresses") or []:
            regions.extend([delivery.get("region"), delivery.get("locality")])
        delivery = item.get("deliveryLocation") or {}
        if delivery.get("description"):
            regions.append(delivery["description"])
    framework_info = tender.get("techniques", {}).get("frameworkAgreement")
    framework = None
    if isinstance(framework_info, dict) and framework_info:
        framework = clean(framework_info.get("description") or "Framework agreement")
    elif "framework agreement" in clean(tender.get("procurementMethodDetails")).lower():
        framework = clean(tender.get("procurementMethodDetails"))
    if notice_type in ("UK13", "UK14", "UK15", "UK16"):
        framework = "Dynamic market"
    notice_docs = [d.url for d in docs if d.kind in ("tenderNotice", "awardNotice", "plannedProcurementNotice")]
    url = (notice_docs or [d.url for d in docs if "/Notice/" in d.url] or [""])[0]
    if not url:
        if source["id"] == "find_tender":
            url = source["website"] + "/Notice/" + str(r.get("id", ""))
        elif source["id"] == "contracts_finder":
            match = re.match(r"([a-f0-9-]{36})", str(r.get("id", "")))
            url = source["website"] + "/Notice/" + match.group(1) if match else source["record_url"].format(ocid=r["ocid"])
        else:
            url = source["record_url"].format(ocid=r.get("ocid"))
    identifiers = unique([f"{x.get('scheme', '')}:{x.get('id', '')}" for x in [party.get("identifier", {})] if x.get("id")])
    eligibility = tender.get("eligibilityCriteria") or tender.get("selectionCriteria")
    if isinstance(eligibility, dict):
        eligibility = eligibility.get("description") or " ".join(clean(c.get("description")) for c in eligibility.get("criteria", []))
    elif isinstance(eligibility, list):
        eligibility = " ".join(clean(x.get("description")) for x in eligibility if isinstance(x, dict))
    suppliers = unique([s.get("name") for a in awards for s in a.get("suppliers", [])])
    buyer_reference = clean(tender.get("id"))
    if len(buyer_reference) < 6 or buyer_reference.lower() in ("tender", "notice", "contract", "unknown"):
        buyer_reference = ""
    return base(raw, title=title, description=description, url=url, ocid=r.get("ocid"),
        lot_id=r.get("lot_id"), lot_ids=[str(lot.get("id")) for lot in lots],
        external_ids=unique([f"{source['id']}:{r.get('id')}" if r.get("id") else None,
                             f"buyer-ref:{clean(buyer.get('name')).lower()}:{buyer_reference}" if buyer_reference and buyer.get("name") else None]),
        buyer_name=clean(buyer.get("name")) or None, buyer_identifiers=identifiers,
        signal_type=classify(stage, clean(title), clean(description), notice_type, framework),
        procurement_stage=stage, notice_type=notice_type, status=status,
        published_at=iso(r.get("date")), updated_at=iso(r.get("date")),
        deadline_at=iso(tender.get("tenderPeriod", {}).get("endDate") or tender.get("enquiryPeriod", {}).get("endDate")),
        contract_start=iso(period.get("startDate")), contract_end=iso(period.get("endDate")),
        extension_end=iso(period.get("maxExtentDate")), value_min=money(min_value.get("amount")),
        value_max=money(value.get("amount")), currency=value.get("currency") or min_value.get("currency"),
        cpv_codes=unique([str(c["id"]) for c in classification if c.get("id") and c.get("scheme", "CPV") == "CPV"]),
        regions=unique([clean(x) for x in regions]), countries=unique(countries), framework=framework,
        incumbent_supplier=", ".join(suppliers) or None, eligibility_text=clean(eligibility) or None, documents=docs)


def normalise_govuk(raw):
    r = raw.data
    title, description = clean(r.get("title")), clean(r.get("description"))
    text = (title + " " + description).lower()
    kind = "PIPELINE" if "pipeline" in text else "FUNDING" if re.search(r"funding competition|apply for funding", text) else "STRATEGIC_INTENT"
    return base(raw, title=title, description=description, url=urljoin("https://www.gov.uk", r.get("link", "")),
        buyer_name=", ".join(o.get("title", "") for o in r.get("organisations", [])) or None,
        signal_type=kind, procurement_stage="planning", status="published", countries=["GB"],
        external_ids=["govuk:" + r.get("link", "")], published_at=iso(r.get("public_timestamp")),
        updated_at=iso(r.get("public_timestamp")), notice_type=r.get("format"))


def normalise_html(raw):
    r = raw.data
    signal = base(raw, title=r["title"], description=r["description"], url=r["url"],
        buyer_name=r.get("buyer"), signal_type=r["signal_type"], procurement_stage=r["stage"],
        status=r.get("status", "unknown"), countries=[raw.source["country"]],
        external_ids=[raw.source["id"] + ":" + r["id"]], deadline_at=iso(r.get("deadline")),
        contract_start=iso(r.get("contract_start")), contract_end=iso(r.get("contract_end")),
        value_max=money(r.get("value")), currency="GBP" if r.get("value") is not None else None,
        framework=r.get("framework"), documents=[Document(title="Official procurement notice", url=u, kind="tenderNotice")
                                                 for u in r.get("source_links", []) if canonical_url(u)])
    if signal:
        signal.source_urls = unique([signal.primary_source_url, *r.get("source_links", [])])
    return signal


def ted_text(value):
    if isinstance(value, dict):
        return ted_text(value.get("eng") or value.get("en") or next(iter(value.values()), ""))
    if isinstance(value, list):
        return "; ".join(ted_text(v) for v in value)
    return clean(value)


def normalise_ted(raw):
    r = raw.data
    number = ted_text(r.get("publication-number"))
    form = ted_text(r.get("form-type"))
    stage = "award" if "result" in form.lower() else "planning" if "planning" in form.lower() else "tender"
    title = ted_text(r.get("notice-title"))
    countries = {"GBR": "GB", "DEU": "DE", "ITA": "IT", "ESP": "ES", "GRC": "GR", "SWE": "SE", "FIN": "FI", "DNK": "DK", "NOR": "NO"}
    region = ted_text(r.get("place-of-performance"))
    return base(raw, title=title, description=title, url=f"https://ted.europa.eu/en/notice/-/detail/{number}",
        buyer_name=ted_text(r.get("buyer-name")) or None, signal_type=classify(stage, title, ""), procurement_stage=stage,
        external_ids=["ted:" + number], notice_type=ted_text(r.get("notice-type")),
        published_at=iso(ted_text(r.get("publication-date"))), updated_at=iso(ted_text(r.get("publication-date"))),
        deadline_at=iso(ted_text(r.get("deadline-receipt-tender-date-lot"))),
        cpv_codes=re.findall(r"\d{8}", ted_text(r.get("classification-cpv"))), regions=[region] if region else [],
        countries=unique([countries[c] for c in countries if c in region]))


NORMALISERS = {"ocds": normalise_ocds, "govuk": normalise_govuk, "html": normalise_html, "ted": normalise_ted}
