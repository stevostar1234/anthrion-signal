import os
from pathlib import Path

import yaml
from dotenv import load_dotenv


def load_config(root: Path):
    load_dotenv(root / ".env", override=False)
    result = {name: yaml.safe_load((root / "config" / f"{name}.yaml").read_text(encoding="utf-8"))
              for name in ("sources", "company_profile", "scoring", "search_terms")}
    if sum(result["scoring"]["weights"].values()) != 100:
        raise ValueError("Scoring weights must sum to 100")
    result["runtime"] = {
        "model": os.getenv("GEMINI_MODEL", ""),
        "max_ai_calls": int(os.getenv("MAX_AI_CALLS_PER_RUN", "30")),
        "ai_concurrency": max(1, min(8, int(os.getenv("AI_CONCURRENCY", "2")))),
        "ai_min_score": float(os.getenv("AI_MIN_PREFILTER_SCORE", "25")),
        "max_pages": int(os.getenv("MAX_PAGES_PER_SOURCE", "80")),
        "lookback_days": int(os.getenv("INITIAL_LOOKBACK_DAYS", "14")),
        "retention_days": int(os.getenv("RETENTION_DAYS", "180")),
    }
    return result


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
