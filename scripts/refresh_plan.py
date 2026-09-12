"""Choose collection and browser verification work without weakening publication checks."""
import hashlib
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def read_state(path):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def code_digest(root):
    # Data-only bot commits must not invalidate an already-tested application.
    tree = subprocess.run(
        ["git", "ls-tree", "-r", "-z", "HEAD"], cwd=root, check=True, capture_output=True,
    ).stdout
    entries = []
    for entry in tree.split(b"\0"):
        if not entry:
            continue
        path = entry.split(b"\t", 1)[1]
        if not path.startswith((b"data/", b"docs/")) and not path.endswith(b".md"):
            entries.append(entry)
    if not entries:
        raise ValueError("No versioned application files found")
    return hashlib.sha256(b"\0".join(entries)).hexdigest()


def make_plan(root, now, event, collect_requested=False, force_full=False):
    signature = {"code": code_digest(root), "day": now.astimezone(ZoneInfo("Europe/London")).date().isoformat()}
    full = force_full or event == "push" or read_state(root / "data/verification_state.json") != signature
    collect = event == "schedule" or (event == "workflow_dispatch" and collect_requested)
    reason = "Collection requested" if collect else "Existing-data deployment"
    if event == "schedule":
        previous = read_state(root / "data/run_metadata.json")
        try:
            finished = datetime.fromisoformat(previous["finished_at"])
            age = (now - finished).total_seconds()
            recent = previous.get("operation") == "ingest" and previous.get("sources_succeeded", 0) > 0
            if recent and 0 <= age < 30 * 60:
                collect = False
                reason = "Recent collection completed less than 30 minutes ago; queued duplicate skipped"
        except (KeyError, TypeError, ValueError):
            pass
    return {"collect": collect, "collection_reason": reason, "full_tests": full,
            "test_mode": "full" if full else "smoke", "signature": signature}


def main():
    root = Path.cwd()
    path = root / "tmp/refresh-plan.json"
    if sys.argv[1] == "passed":
        plan = read_state(path)
        if not plan.get("full_tests") or set(plan.get("signature", {})) != {"code", "day"}:
            raise SystemExit("Only a planned, successful full regression can be recorded")
        (root / "data/verification_state.json").write_text(
            json.dumps(plan["signature"], indent=2) + "\n", encoding="utf-8",
        )
        return
    if sys.argv[1] != "plan":
        raise SystemExit("Expected plan or passed")
    plan = make_plan(root, datetime.now(UTC), os.getenv("GITHUB_EVENT_NAME", ""),
                     os.getenv("COLLECT_REQUESTED") == "true", os.getenv("FORCE_FULL_TESTS") == "true")
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    if os.getenv("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
            for key in ("collect", "full_tests", "test_mode"):
                value = str(plan[key]).lower() if isinstance(plan[key], bool) else plan[key]
                stream.write(f"{key}={value}\n")
    print(f"{plan['collection_reason']}. Browser verification: {plan['test_mode']}.")


if __name__ == "__main__":
    main()
