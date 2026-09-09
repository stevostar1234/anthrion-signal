"""Install the authorised local Gemini credential as a GitHub Actions secret, never as a file."""
import argparse
import re
import subprocess
from pathlib import Path

from dotenv import dotenv_values

parser = argparse.ArgumentParser()
parser.add_argument("repository")
args = parser.parse_args()
if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repository):
    raise SystemExit("Expected owner/repository")
values = dotenv_values(Path.cwd() / ".env")
key = values.get("GEMINI_API_KEY")
if not key:
    raise SystemExit("GEMINI_API_KEY is missing from the local .env")
subprocess.run(["gh", "secret", "set", "GEMINI_API_KEY", "--repo", args.repository], input=key, text=True, check=True)
for name in ("GEMINI_MODEL", "MAX_AI_CALLS_PER_RUN", "AI_CONCURRENCY", "AI_MIN_PREFILTER_SCORE"):
    if values.get(name):
        subprocess.run(["gh", "variable", "set", name, "--repo", args.repository, "--body", values[name]], check=True)
print("GitHub Actions secret and runtime variables configured; credential value was not logged.")
