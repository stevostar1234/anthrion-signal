"""Publish substantive changes immediately and unchanged verified data at least daily."""
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from refresh_plan import code_digest

root = Path.cwd()
path = root / "data/current.json"
data = json.loads(path.read_text(encoding="utf-8"))
signature = {
    "code": os.getenv("BUILD_CODE_DIGEST") or code_digest(root),
    "content": data["run"]["content_digest"],
    "health": [[s["id"], s["status"]] for s in data["sources"]],
    "day": datetime.now(UTC).date().isoformat(),
}
previous_path = root / "data/publication_state.json"
if sys.argv[1] == "deployed":
    deployed = json.loads(os.environ["DEPLOYED_SIGNATURE"])
    if set(deployed) != {"code", "content", "health", "day"}:
        raise SystemExit("Invalid publication signature")
    previous_path.write_text(json.dumps(deployed, indent=2) + "\n", encoding="utf-8")
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
            output.write("signature=" + json.dumps(signature, separators=(",", ":")) + "\n")
    print("Publishing updated intelligence." if changed else "Content and health unchanged; daily freshness publication already completed.")
