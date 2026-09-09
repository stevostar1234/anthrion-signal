"""Bounded, read-only inspection of official source contracts."""
import json
import sys
import ssl
from pathlib import Path

import httpx

URLS = {
    "fts_docs": "https://www.find-tender.service.gov.uk/apidocumentation/1.0/GET-ocdsReleasePackages",
    "fts": "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?updatedFrom=2026-09-08T00:00:00&updatedTo=2026-09-09T00:00:00&limit=5",
    "cf": "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?publishedFrom=2026-09-08T00:00:00Z&publishedTo=2026-09-09T00:00:00Z&limit=5",
    "pcs_docs": "https://api.publiccontractsscotland.gov.uk/v1",
    "pcs": "https://api.publiccontractsscotland.gov.uk/v1/Notices?dateFrom=09-2026&noticeType=2&outputType=0",
    "wales_docs": "https://api.sell2wales.gov.wales/v1",
    "wales": "https://api.sell2wales.gov.wales/v1/Notices?dateFrom=09-2026&noticeType=2&outputType=0&locale=2057",
    "govuk": "https://www.gov.uk/api/search.json?q=Salesforce&count=5&order=-public_timestamp",
    "digital": "https://redirect.contractawardservice.gca.gov.uk/digital-outcomes/opportunities",
    "upcoming": "https://www.crowncommercial.gov.uk/agreements/upcoming",
    "digital_robots": "https://redirect.contractawardservice.gca.gov.uk/robots.txt",
    "upcoming_robots": "https://www.crowncommercial.gov.uk/robots.txt",
}

out = Path("tmp/probes")
out.mkdir(parents=True, exist_ok=True)
with httpx.Client(verify=ssl.create_default_context(), timeout=30, follow_redirects=True, headers={"User-Agent": "AnthrionSignal/1.0", "Accept": "application/json,text/html"}) as client:
    for name in sys.argv[1:] or URLS:
        try:
            response = client.get(URLS[name])
            (out / f"{name}.txt").write_text(response.text, encoding="utf-8")
            print(name, response.status_code, str(response.url), len(response.content))
            if "json" in response.headers.get("content-type", ""):
                data = response.json()
                print(json.dumps(data if name == "govuk" else {k: (v[:1] if isinstance(v, list) else v) for k,v in data.items()}, ensure_ascii=True)[:1800])
        except Exception as exc:
            print(name, type(exc).__name__, str(exc)[:200])
