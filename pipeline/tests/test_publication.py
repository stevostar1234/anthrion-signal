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
    env = {**os.environ, "GITHUB_OUTPUT": str(output), "BUILD_CODE_DIGEST": "built-code"}
    subprocess.run([sys.executable, str(script), "before"], cwd=tmp_path, env=env, check=True)
    subprocess.run([sys.executable, str(script), "after"], cwd=tmp_path, env=env, check=True)
    values = dict(line.split("=", 1) for line in output.read_text(encoding="utf-8").splitlines())
    assert values["deploy"] == "true"
    current.write_text(json.dumps({"run": {"content_digest": "newer-unbuilt-version"}, "sources": []}), encoding="utf-8")
    subprocess.run([sys.executable, str(script), "deployed"], cwd=tmp_path,
                   env={**env, "BUILD_CODE_DIGEST": "newer-code",
                        "DEPLOYED_SIGNATURE": values["signature"]}, check=True)
    deployed = json.loads((data / "publication_state.json").read_text(encoding="utf-8"))
    assert deployed["content"] == "built-version"
    assert deployed["code"] == "built-code"


def test_code_only_changes_and_failed_deployments_remain_due(tmp_path):
    script = Path(__file__).resolve().parents[2] / "scripts/publication_state.py"
    (tmp_path / "data").mkdir()
    (tmp_path / "data/current.json").write_text(
        json.dumps({"run": {"content_digest": "same-data"}, "sources": []}), encoding="utf-8")
    output = tmp_path / "outputs"
    env = {**os.environ, "GITHUB_OUTPUT": str(output), "BUILD_CODE_DIGEST": "code-v1",
           "FORCE_DEPLOY": "false"}

    def step(command, **overrides):
        output.write_text("", encoding="utf-8")
        subprocess.run([sys.executable, str(script), command], cwd=tmp_path,
                       env={**env, **overrides}, check=True)
        return dict(line.split("=", 1) for line in output.read_text(encoding="utf-8").splitlines())

    step("before")
    built = step("after")
    step("deployed", DEPLOYED_SIGNATURE=built["signature"])
    step("before")
    assert step("after")["deploy"] == "false"
    assert step("after", BUILD_CODE_DIGEST="code-v2")["deploy"] == "true"
    # A failed deployment never updates the successful publication marker.
    step("before")
    assert step("after", BUILD_CODE_DIGEST="code-v2")["deploy"] == "true"
