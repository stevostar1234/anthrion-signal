"""High-recall candidate discovery. These signals are not technical fit scores."""
import re
import unicodedata

from .utils import parse_date, unique

ACTIONABLE = {"OPEN", "EARLY_ENGAGEMENT", "FUTURE"}
TERMINAL = {"AWARDED", "CLOSED", "EXPIRED", "CANCELLED", "WITHDRAWN"}
PLATFORM_FAMILIES = {"salesforce", "crm", "relationships", "service", "contact_centre", "portals",
    "sales_revenue", "marketing", "data", "integration", "analytics", "field_service", "transformation",
    "workflow", "managed", "industry", "external_integration", "collaboration"}
AI_FAMILIES = {"ai", "genai", "automation", "knowledge"}


def is_award_intelligence(signal):
    """Keep awards and unconfirmed award-derived renewals out of the public feed."""
    return bool(signal.signal_type == "AWARD" or signal.status.casefold() == "awarded"
            or signal.lifecycle_state == "AWARDED"
            or (signal.signal_type == "RENEWAL_SIGNAL" and
                (signal.related_signal_id or signal.status.casefold() == "inferred" or signal.renewal_basis)))


def search_text(value):
    value = unicodedata.normalize("NFKD", value or "").casefold()
    return " " + re.sub(r"[^\w]+", " ", "".join(c for c in value if not unicodedata.combining(c))).strip() + " "


def discovery_text(value):
    # Submission instructions and portal hostnames are not buyer technology requirements.
    value = re.sub(r"https?://\S+", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"\b(?:[a-z0-9-]+\.)+[a-z]{2,24}/[^\s<>]*", " ", value, flags=re.IGNORECASE)
    sentences = re.split(r"(?<=[.!?])\s+|\n+", value)
    registration = re.compile(
        r"\b(?:to register with|register (?:here|your (?:organisation|organization|interest))|"
        r"submit (?:your |the |a )?(?:bid|tender|proposal|response)|"
        r"(?:register|apply) (?:and apply )?(?:via|on|through)|"
        r"(?:responses|bids|proposals)\b[^.!?]{0,80}\bsubmitted|being released through|"
        r"to access the solicitation|this will take you to the public portal|"
        r"(?:visit|check)\b[^.!?]{0,60}\bportal|contact\b[^.!?]{0,60}\bservice desk|"
        r"available (?:online )?through)\b", re.IGNORECASE)
    build_scope = re.compile(r"\b(?:develop|implement|build|replace|upgrade|procure)\w*\b[^.!?]{0,90}"
                             r"\b(?:portal|software|platform|application)\b", re.IGNORECASE)
    return search_text(" ".join(sentence for sentence in sentences
                               if not (registration.search(sentence)
                                       and re.search(r"\b(?:portal|atamis|e-sourcing|passport|isupplier|service desk)\b", sentence, re.IGNORECASE)
                                       and not build_scope.search(sentence))))


def contains(text, phrase):
    return search_text(phrase) in text


def lifecycle(signal, now):
    status = signal.status.casefold().replace("-", "_")
    deadline = parse_date(signal.deadline_at)
    if status in ("cancelled", "canceled", "unsuccessful"):
        return "CANCELLED", "The source reports cancellation or an unsuccessful procurement."
    if status == "withdrawn":
        return "WITHDRAWN", "The source reports withdrawal."
    if signal.signal_type == "AWARD" or status == "awarded":
        return "AWARDED", "Published award intelligence, not an open bid."
    if status in ("closed", "complete", "completed", "terminated"):
        return "CLOSED", "The source reports a closed procurement."
    if status == "postponed":
        return "UNKNOWN", "The source postpones bidding without a confirmed replacement response window."
    if status == "expired" or (deadline and deadline <= now):
        return "EXPIRED", "The published response deadline has passed."
    if signal.signal_type == "RENEWAL_SIGNAL":
        return "FUTURE", "Inferred from a published contract end; replacement procurement is unconfirmed."
    if signal.signal_type in ("EARLY_MARKET_ENGAGEMENT", "RFI"):
        published = parse_date(signal.last_material_update) or parse_date(signal.published_at)
        if deadline or status == "active" or (published and (now - published).days <= 90):
            return "EARLY_ENGAGEMENT", "Early-stage buyer engagement; confirm response terms in the notice."
        return "UNKNOWN", "Older engagement notice without a confirmed response window."
    if signal.signal_type in ("PIPELINE", "FUTURE_OPPORTUNITY", "STRATEGIC_INTENT") or signal.procurement_stage == "planning":
        return "FUTURE", "Published future intent; an open competition is not confirmed."
    if status in ("active", "open") or deadline:
        return "OPEN", "The source reports an active process or a future response deadline."
    return "UNKNOWN", "The notice does not establish a current response window."


def is_public_opportunity(signal, now):
    if (signal.status.casefold() == "postponed" or is_award_intelligence(signal)
            or lifecycle(signal, now)[0] in TERMINAL or signal.exclusion_reasons):
        return False
    checks = getattr(signal.analysis, "eligibility_checks", [])
    return not any(check.status == "CONFIRMED_BLOCKER" for check in checks)


def hard_exclusions(signal, charter):
    policy = charter["discovery"]
    text = discovery_text(signal.title + " " + signal.description)
    title = discovery_text(signal.title)
    reasons = []
    if signal.source == "govuk":
        directory_or_retrospective = signal.notice_type in policy.get("non_opportunity_formats", [])
        buying_intent = any(contains(text, p) for p in policy.get("publication_intent", policy["commercial_intent"]))
        if directory_or_retrospective or not buying_intent:
            reasons.append("General publication without a current supplier opportunity or explicit future buying intent.")
    staffing = any(contains(text, p) for p in ("contract staffing", "supplier", "consultancy", "professional services", "contractor"))
    if any(contains(text, p) for p in policy["permanent_roles"]) and not staffing:
        reasons.append("Permanent employee vacancy, not a supplier engagement.")
    technical = any(contains(text, p) for p in policy["technical_context"])
    physical_title = any(contains(title, p) for p in policy.get("physical_scope_titles", []))
    digital_title = any(contains(title, p) for p in policy.get("digital_scope_titles", []))
    digital_lot = bool(re.search(r"\blot\s+\d+[^.!?\n]{0,180}\b(?:software|crm|digital platform|system integration)\b", signal.description, re.IGNORECASE))
    if (not technical and any(contains(text, p) for p in policy["irrelevant_physical"])) or (physical_title and not digital_title and not digital_lot):
        reasons.append("Physical goods or works without a stated technology-services scope.")
    non_technical_codes = tuple(policy.get("non_technical_cpv_prefixes", []))
    non_technical = (bool(signal.cpv_codes) and bool(non_technical_codes)
                     and all(code.startswith(non_technical_codes) for code in signal.cpv_codes))
    non_technical |= any(contains(text, p) for p in policy.get("non_technical_service_phrases", []))
    software_scope = digital_title or digital_lot or any(contains(text, p) for p in policy.get("software_scope_terms", []))
    if non_technical and not software_scope:
        reasons.append("Non-technology service delivery without a stated software, AI or systems scope.")
    if any(contains(text, p) for p in policy.get("company_excluding_eligibility", [])):
        reasons.append("The notice explicitly restricts participation to public institutions, not company suppliers.")
    # A competing installed system is not a lock-in. Require an explicit no-alternatives
    # clause in the same sentence, and retain any separately addressable AI/API scope.
    separate = any(contains(text, p) for p in ("AI assistant", "AI agent", "artificial intelligence", "integration", "integrate", "API", "middleware", "or equivalent", "or Salesforce"))
    for sentence in re.split(r"[.!?;\n]", signal.title + ". " + signal.description):
        normalized = search_text(sentence)
        platform = any(contains(normalized, p) for p in policy["incompatible_platforms"])
        locked = any(contains(normalized, p) for p in policy["mandatory_constraints"] if p != "mandatory")
        if platform and locked and not separate:
            reasons.append("Explicit competing-platform restriction with no separately stated AI or integration scope.")
            break
    return reasons


def prefilter(signals, profile, terms, charter=None):
    # Compatibility for external callers; production always supplies the expanded charter.
    caps = charter["capabilities"] if charter else [dict(c, needs=c["terms"]) for c in profile["capabilities"]]
    technical_terms = charter["discovery"]["technical_context"] if charter else terms["supplementary"]
    for signal in signals:
        text = discovery_text(signal.title + " " + signal.description)
        title = discovery_text(signal.title)
        technical = any(contains(text, p) for p in technical_terms)
        families, hits, strengths, primary_families = [], [], [], []
        relationship_database = (contains(text, "database")
            and bool(re.search(r"\b(?:stakeholders?|constituents?|members?|donors?|volunteers?|customers?|clients?|coalitions?|tenants?|residents?)\b", text))
            and bool(re.search(r"\b(?:manage|management|tracking|communication|engagement|contacts?)\b", text)))
        for cap in caps:
            explicit = [p for p in cap.get("explicit", []) if contains(text, p)]
            needs = [p for p in cap.get("needs", []) + cap.get("aliases", []) if contains(text, p)]
            contextual = [p for p in cap.get("contextual", []) if technical and contains(text, p)]
            if cap["id"] == "relationships" and relationship_database:
                needs.append("Relationship-management database")
            if explicit or needs or contextual:
                if explicit or needs:
                    primary_families.append(cap["id"])
                families.append(cap["id"])
                hits.extend(explicit + needs + contextual)
                strength = 46 if explicit else 32 if needs else 16
                if any(contains(title, p) for p in explicit + needs):
                    strength += 12
                strengths.append(strength)
        cpv = any(code.startswith(tuple(terms["cpv_prefixes"])) for code in signal.cpv_codes)
        score = min(100, max(strengths, default=0) + min(24, max(0, len(families) - 1) * 6) + (12 if cpv else 0))
        # Pipeline/consulting vocabulary alone identifies buying stage, not our scope.
        if families and set(families) <= {"pipeline", "staffing", "external_integration"} and not cpv:
            score = min(score, 10)
        signal.prefilter_score = score
        signal.prefilter_matches = unique(hits + (["Relevant CPV classification"] if cpv else []))[:40]
        signal.discovery_families = families
        signal.delivery_priority = ("platform" if PLATFORM_FAMILIES.intersection(primary_families)
                                    else "ai" if AI_FAMILIES.intersection(primary_families) or "ai" in families else "other")
        signal.matched_capabilities = families
        signal.discovery_version = charter["version"] if charter else None
        signal.exclusion_reasons = hard_exclusions(signal, charter) if charter else []
        if signal.exclusion_reasons:
            signal.prefilter_score = 0
        buyer = text + search_text(signal.buyer_name)
        signal.categories = [s["label"] for s in profile["sectors"] if any(contains(buyer, p) for p in s["terms"])]


def ranking_key(signal, now):
    published = parse_date(signal.published_at) or parse_date(signal.first_seen_at)
    return ({"platform": 0, "ai": 1, "other": 2}[signal.delivery_priority],
            -published.timestamp() if published else 0, signal.id)
