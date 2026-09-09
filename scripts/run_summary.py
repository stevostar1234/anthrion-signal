import json
import os
from pathlib import Path

path = Path("data/run_metadata.json")
if path.exists():
    run = json.loads(path.read_text(encoding="utf-8"))
    labels = {"sources_attempted": "Sources attempted", "sources_succeeded": "Sources succeeded", "raw_records": "Raw records fetched",
        "new_signals": "New canonical signals", "material_updates": "Materially updated signals", "duplicates_merged": "Duplicates merged",
        "candidates_shortlisted": "Candidates shortlisted", "gemini_calls": "Gemini calls", "cache_hits": "AI cache hits",
        "ai_failures": "AI failures", "high_fit_signals": "High-fit signals"}
    body = "## Anthrion Signal\n\n| Metric | Count |\n| --- | ---: |\n" + "\n".join(f"| {label} | {run.get(key, 0)} |" for key, label in labels.items())
    body += "\n\nDeployment outcome is reported by the GitHub Pages deployment job.\n"
    print(body)
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as stream:
            stream.write(body)
