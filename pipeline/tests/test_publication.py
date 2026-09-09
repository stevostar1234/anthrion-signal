import json
import os
import subprocess
import sys
from pathlib import Path


def test_successful_signature_describes_built_data_not_later_checkout(tmp_path):
    script = Path(__file__).resolve().parents[2] / "scripts/publication_state.py"
    data = tmp_path / "data"
    data.mkdir()
    current = data / "current.json"
    current.write_text(json.dumps({"run": {"content_digest": "built-version"}, "sources": []}), encoding="utf-8")
    output = tmp_path / "outputs"
    env = {**os.environ, "GITHUB_OUTPUT": str(output)}
    subprocess.run([sys.executable, str(script), "before"], cwd=tmp_path, env=env, check=True)
    subprocess.run([sys.executable, str(script), "after"], cwd=tmp_path, env=env, check=True)
    values = dict(line.split("=", 1) for line in output.read_text(encoding="utf-8").splitlines())
    assert values["deploy"] == "true"
    current.write_text(json.dumps({"run": {"content_digest": "newer-unbuilt-version"}, "sources": []}), encoding="utf-8")
    subprocess.run([sys.executable, str(script), "deployed"], cwd=tmp_path,
                   env={**env, "DEPLOYED_SIGNATURE": values["signature"]}, check=True)
    assert json.loads((data / "publication_state.json").read_text(encoding="utf-8"))["content"] == "built-version"
