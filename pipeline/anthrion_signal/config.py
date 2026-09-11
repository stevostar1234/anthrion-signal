import os
from pathlib import Path

import yaml
from dotenv import load_dotenv


def load_config(root: Path):
    load_dotenv(root / ".env", override=False)
    result = {name: yaml.safe_load((root / "config" / f"{name}.yaml").read_text(encoding="utf-8"))
              for name in ("sources", "company_profile", "scoring", "search_terms", "capabilities", "discovery_languages")}
    if sum(result["scoring"]["weights"].values()) != 100:
        raise ValueError("Scoring weights must sum to 100")
    capabilities = result["capabilities"]["capabilities"]
    identifiers = [c["id"] for c in capabilities]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("Capability identifiers must be unique")
    for language, families in result["discovery_languages"].items():
        if set(families) - set(identifiers):
            raise ValueError(f"Unknown capability in {language} discovery pack")
        for capability in capabilities:
            capability.setdefault("aliases", []).extend(families.get(capability["id"], []))
    result["search_terms"]["govuk_queries"] = list(dict.fromkeys(
        result["search_terms"]["govuk_queries"] + [q for c in capabilities for q in c.get("queries", [])]))
    result["runtime"] = {
        "model": "",
        "max_ai_calls": 0,
        "ai_concurrency": 1,
        "ai_min_score": 25,
        "max_pages": int(os.getenv("MAX_PAGES_PER_SOURCE", "80")),
        "lookback_days": int(os.getenv("INITIAL_LOOKBACK_DAYS", "14")),
        "retention_days": int(os.getenv("RETENTION_DAYS", "180")),
    }
    return result


def capability_catalog(config):
    charter = config["capabilities"]
    return {c["id"]: {"label": c["label"], "group": "capabilities", "document": charter["source"],
                         "quote": f"{charter['charter']} Relevant functional scope: {', '.join(c.get('needs', []))}."}
            for c in charter["capabilities"]}


def evidence_catalog(profile):
    catalog = {}
    for group in ("capabilities", "delivery_models", "sectors", "references"):
        for entry in profile[group]:
            catalog[entry["id"]] = {"label": entry.get("label", entry.get("name")), "group": group,
                                    **entry["evidence"], "document": profile["source_document"]}
    catalog["geographies"] = {"label": "European delivery presence", "group": "geography",
                              **profile["geographies"]["evidence"], "document": profile["source_document"]}
    catalog["governance"] = {"label": "Governance & sovereignty", "group": "governance",
                             **profile["governance"]["evidence"], "document": profile["source_document"]}
    # Explicit eligibility facts are opt-in. Null never proves ineligibility.
    for key, value in profile.get("eligibility", {}).items():
        if value is not None:
            catalog[f"eligibility.{key}"] = {"label": key, "group": "eligibility", "quote": str(value),
                                            "document": "Company eligibility configuration"}
    return catalog
