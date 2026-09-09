"""Publish substantive changes immediately and unchanged verified data at least daily."""
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

root = Path.cwd()
path = root / "data/current.json"
data = json.loads(path.read_text(encoding="utf-8"))
signature = {
    "content": data["run"]["content_digest"],
    "health": [[s["id"], s["status"]] for s in data["sources"]],
    "day": datetime.now(UTC).date().isoformat(),
}
previous_path = root / "data/publication_state.json"
if sys.argv[1] == "deployed":
    previous_path.write_text(json.dumps(signature, indent=2) + "\n", encoding="utf-8")
    print("Successful publication recorded.")
elif sys.argv[1] == "before":
    root.joinpath("tmp").mkdir(exist_ok=True)
    root.joinpath("tmp/publication-before.json").write_text(previous_path.read_text(encoding="utf-8") if previous_path.exists() else "{}", encoding="utf-8")
else:
    previous = json.loads(root.joinpath("tmp/publication-before.json").read_text(encoding="utf-8"))
    changed = signature != previous or os.getenv("FORCE_DEPLOY") == "true"
    if os.getenv("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"deploy={str(changed).lower()}\n")
    print("Publishing updated intelligence." if changed else "Content and health unchanged; daily freshness publication already completed.")
