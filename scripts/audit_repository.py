"""Verify the complete staged publication without displaying any credential values."""
import re
import subprocess
from pathlib import Path

from dotenv import dotenv_values

root = Path.cwd()
files = subprocess.check_output(["git", "diff", "--cached", "--name-only", "--diff-filter=ACM", "-z"]).decode().split("\0")
secret = dotenv_values(root / ".env").get("GEMINI_API_KEY", "")
patterns = [rb"AIza[0-9A-Za-z_-]{30,}", rb"gh[pousr]_[A-Za-z0-9_]{20,}", rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"]
issues = []
for name in filter(None, files):
    path = Path(name)
    if (path.name.startswith(".env") and path.name != ".env.example") or path.suffix.lower() == ".pdf":
        issues.append(name)
        continue
    body = subprocess.check_output(["git", "show", ":" + name])
    if (secret and secret.encode() in body) or any(re.search(pattern, body) for pattern in patterns):
        issues.append(name)
if issues:
    raise SystemExit("Publication blocked; review these files: " + ", ".join(issues))
print(f"Audited {len(list(filter(None, files)))} staged files: no local .env, PDF, private keys or credential-shaped values.")
