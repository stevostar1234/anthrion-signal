"""Fail closed if credential-shaped values or unsafe URLs enter public JSON."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from anthrion_signal.models import Dataset

path = Path("data/current.json")
raw = json.loads(path.read_text(encoding="utf-8"))
data = Dataset.model_validate(raw)
retired = {"analysis", "fit_score", "confidence_score", "ai_status", "score_components", "recommendation"}
if any(retired.intersection(signal) for signal in raw["signals"]):
    raise SystemExit("Retired model analysis detected in public output")
serialized = data.model_dump_json()
patterns = [r"AIza[0-9A-Za-z_-]{30,}", r"gh[pousr]_[A-Za-z0-9_]{20,}", r"-----BEGIN .*PRIVATE KEY-----"]
if any(re.search(pattern, serialized) for pattern in patterns):
    raise SystemExit("Credential-shaped material detected in public output")
for signal in data.signals:
    for url in signal.source_urls + [signal.primary_source_url] + [d.url for d in signal.documents]:
        parsed = urlparse(url)
        if parsed.scheme not in ("https", "http") or not parsed.netloc or parsed.username or parsed.password:
            raise SystemExit("Unsafe link detected in public output")
print(f"Public output checked: {len(data.signals)} signals, no credential-shaped values or unsafe links.")
