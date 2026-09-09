from datetime import timedelta

from rapidfuzz.fuzz import ratio

from .models import Change, Signal
from .normalise import MATERIAL_FIELDS, material_payload, set_hashes
from .utils import normal_text, parse_date, unique


def exact_keys(s):
    suffix = f"|lot:{s.lot_id or ''}"
    return [key + suffix for key in unique([
        "ocid:" + s.ocid if s.ocid else None,
        *["ref:" + ref for ref in s.external_ids],
        *["url:" + url for url in s.source_urls], "fingerprint:" + s.fingerprint])]


def compatible_identifiers(left, right):
    return left.lot_id == right.lot_id and not (
        left.source == right.source and left.ocid and right.ocid and left.ocid != right.ocid)


def is_fuzzy_duplicate(left, right):
    if left.lot_id != right.lot_id or left.related_signal_id or right.related_signal_id:
        return False
    if left.ocid and right.ocid and left.ocid != right.ocid and left.source == right.source:
        return False
    if not left.buyer_name or not right.buyer_name:
        return False
    if ratio(normal_text(left.buyer_name), normal_text(right.buyer_name)) < 95:
        return False
    if ratio(normal_text(left.title), normal_text(right.title)) < 94:
        return False
    if left.lot_ids and right.lot_ids and set(left.lot_ids) != set(right.lot_ids):
        return False
    # A fuzzy title alone is insufficient: require an independent procurement anchor.
    if left.deadline_at and right.deadline_at:
        if abs((parse_date(left.deadline_at) - parse_date(right.deadline_at)).total_seconds()) > 86400:
            return False
        date_anchor = True
    else:
        date_anchor = False
    if left.value_max is not None and right.value_max is not None:
        if left.currency != right.currency or abs(left.value_max - right.value_max) > max(1, left.value_max * .02):
            return False
        value_anchor = True
    else:
        value_anchor = False
    pub1, pub2 = parse_date(left.published_at), parse_date(right.published_at)
    if pub1 and pub2 and abs(pub1 - pub2) > timedelta(days=45):
        return False
    return date_anchor and value_anchor


def merge(old, incoming):
    old_payload = material_payload(old)
    merged = old.model_copy(deep=True)
    older = (parse_date(incoming.updated_at) or parse_date(incoming.first_seen_at)) < (
        parse_date(old.updated_at) or parse_date(old.first_seen_at))
    if not older:
        for field in MATERIAL_FIELDS + ["updated_at", "buyer_identifiers", "countries", "regions", "notice_type"]:
            value = getattr(incoming, field)
            if value not in (None, "", [], "unknown"):
                setattr(merged, field, value)
        merged.raw_source_hash = incoming.raw_source_hash
        # Prefer current official notice facts over derivative publications.
        if incoming.source_type == "official_notice" or old.source_type != "official_notice":
            merged.source, merged.source_type = incoming.source, incoming.source_type
            merged.primary_source_url = incoming.primary_source_url
    merged.ocid = old.ocid or incoming.ocid
    merged.external_ids = unique(old.external_ids + incoming.external_ids)
    merged.source_urls = unique(old.source_urls + incoming.source_urls)
    merged.first_seen_at = min(old.first_seen_at, incoming.first_seen_at)
    merged.last_seen_at = max(old.last_seen_at, incoming.last_seen_at)
    if incoming.published_at:
        merged.published_at = min(filter(None, [old.published_at, incoming.published_at]))
    merged.documents = list({d.url: d for d in old.documents + incoming.documents}.values())[-40:]
    provenance = {(p.source, p.release_id): p for p in old.provenance + incoming.provenance}
    merged.provenance = sorted(provenance.values(), key=lambda p: p.retrieved_at)[-60:]
    set_hashes(merged)
    changed = [k for k in old_payload if old_payload[k] != material_payload(merged)[k]]
    if changed:
        merged.last_material_update = incoming.last_seen_at
        merged.changes = (old.changes + [Change(at=incoming.last_seen_at, kind="updated", fields=changed,
                                               source_url=incoming.primary_source_url)])[-30:]
        merged.analysis = None
        merged.fit_score = None
        merged.ai_status = "pending"
        merged.analysis_cache_key = None
        merged.ai_scored_at = None
    return merged, bool(changed)


def reconcile(previous: list[Signal], incoming: list[Signal]):
    records = {s.id: s.model_copy(deep=True) for s in previous if not s.related_signal_id}
    index = {key: s.id for s in records.values() for key in exact_keys(s)}
    buyer_index = {}
    for s in records.values():
        buyer_index.setdefault(normal_text(s.buyer_name), set()).add(s.id)
    stats = {"new_signals": 0, "material_updates": 0, "duplicates_merged": 0}
    for signal in sorted(incoming, key=lambda s: s.updated_at or s.first_seen_at):
        match_id = next((index[k] for k in exact_keys(signal) if k in index
                         and compatible_identifiers(records[index[k]], signal)), None)
        if not match_id:
            candidates = buyer_index.get(normal_text(signal.buyer_name), set())
            match_id = next((sid for sid in candidates if is_fuzzy_duplicate(records[sid], signal)), None)
        if match_id:
            merged, changed = merge(records[match_id], signal)
            records[match_id] = merged
            stats["material_updates"] += int(changed)
            stats["duplicates_merged"] += 1
            signal = merged
        else:
            records[signal.id] = signal
            signal.changes = [Change(at=signal.first_seen_at, kind="discovered", fields=[], source_url=signal.primary_source_url)]
            stats["new_signals"] += 1
        for key in exact_keys(signal):
            index[key] = signal.id
        buyer_index.setdefault(normal_text(signal.buyer_name), set()).add(signal.id)
    return list(records.values()), index, stats
