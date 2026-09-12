import importlib.util
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("refresh_plan", ROOT / "scripts/refresh_plan.py")
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)
NOW = datetime(2026, 9, 12, 12, 50, tzinfo=UTC)


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setattr(refresh, "code_digest", lambda root: "tested-code")
    return tmp_path


def test_full_suite_is_due_until_a_success_is_recorded(root, monkeypatch):
    plan = refresh.make_plan(root, NOW, "schedule")
    assert plan["full_tests"]
    assert not (root / "data/verification_state.json").exists()
    write(root / "tmp/refresh-plan.json", plan)
    (root / "data").mkdir()
    monkeypatch.chdir(root)
    monkeypatch.setattr(sys, "argv", ["refresh_plan.py", "passed"])
    refresh.main()
    assert not refresh.make_plan(root, NOW, "schedule")["full_tests"]
    assert refresh.make_plan(root, NOW + timedelta(days=1), "schedule")["full_tests"]
    assert refresh.make_plan(root, NOW, "push")["full_tests"]
    assert refresh.make_plan(root, NOW, "workflow_dispatch", force_full=True)["full_tests"]
    monkeypatch.setattr(refresh, "code_digest", lambda root: "changed-code")
    assert refresh.make_plan(root, NOW, "schedule")["full_tests"]


def test_daily_suite_uses_london_day_and_retries_after_a_missed_tick(root):
    before_midnight = datetime(2026, 9, 12, 22, 50, tzinfo=UTC)
    plan = refresh.make_plan(root, before_midnight, "schedule")
    write(root / "data/verification_state.json", plan["signature"])
    assert refresh.make_plan(root, before_midnight + timedelta(hours=1), "schedule")["full_tests"]
    assert refresh.make_plan(root, before_midnight + timedelta(hours=8), "schedule")["full_tests"]


@pytest.mark.parametrize("value", [None, [], {"code": "tested-code"}, "invalid-json"])
def test_missing_or_invalid_verification_state_requires_full_tests(root, value):
    write(root / "data/verification_state.json", value)
    assert refresh.make_plan(root, NOW, "schedule")["full_tests"]


def test_smoke_run_cannot_mark_full_regression_as_passed(root, monkeypatch):
    write(root / "tmp/refresh-plan.json", {"full_tests": False})
    monkeypatch.chdir(root)
    monkeypatch.setattr(sys, "argv", ["refresh_plan.py", "passed"])
    with pytest.raises(SystemExit):
        refresh.main()
    assert not (root / "data/verification_state.json").exists()


def test_queued_duplicate_skips_only_recent_successful_scheduled_collection(root):
    previous = {"operation": "ingest", "sources_succeeded": 3,
                "finished_at": (NOW - timedelta(minutes=8)).isoformat()}
    write(root / "data/run_metadata.json", previous)
    assert not refresh.make_plan(root, NOW, "schedule")["collect"]
    assert refresh.make_plan(root, NOW, "workflow_dispatch", collect_requested=True)["collect"]
    assert not refresh.make_plan(root, NOW, "workflow_dispatch", collect_requested=False)["collect"]
    assert not refresh.make_plan(root, NOW, "push")["collect"]
    assert refresh.make_plan(root, NOW + timedelta(minutes=22), "schedule")["collect"]
    assert refresh.make_plan(root, NOW + timedelta(hours=14), "schedule")["collect"]
    for changes in [{"operation": "rescore"}, {"sources_succeeded": 0},
                    {"finished_at": "broken"}, {"finished_at": "2026-09-12T12:49:00"},
                    {"finished_at": (NOW + timedelta(minutes=1)).isoformat()}]:
        write(root / "data/run_metadata.json", {**previous, **changes})
        assert refresh.make_plan(root, NOW, "schedule")["collect"]


def test_data_commits_do_not_reset_code_signature_but_any_application_file_does(monkeypatch):
    def digest(*entries):
        monkeypatch.setattr(refresh.subprocess, "run", lambda *a, **kw: SimpleNamespace(
            stdout=b"\0".join(entries) + b"\0"))
        return refresh.code_digest(ROOT)

    app = b"100644 blob abc\tapp/src/App.tsx"
    expected = digest(app)
    assert expected == digest(app, b"100644 blob def\tdata/current.json",
                              b"100644 blob ghi\tdata/verification_state.json",
                              b"100644 blob jkl\tREADME.md")
    for path in [b"config/sources.yaml", b"pipeline/anthrion_signal/cli.py", b"app/package-lock.json",
                 b"scripts/refresh_plan.py", b".github/workflows/ingest-and-deploy.yml"]:
        assert expected != digest(app, b"100644 blob xyz\t" + path)


def test_every_publication_requires_browser_checks_and_full_success_is_not_recorded_early():
    workflow = yaml.load((ROOT / ".github/workflows/ingest-and-deploy.yml").read_text(),
                         Loader=yaml.BaseLoader)
    steps = workflow["jobs"]["build"]["steps"]
    by_name = {step.get("name"): step for step in steps}
    full = by_name["Full browser regression against production build"]
    smoke = by_name["Data refresh desktop and mobile smoke tests"]
    passed = by_name["Record successful full regression"]
    assert full["if"] == passed["if"] == "steps.plan.outputs.full_tests == 'true'"
    assert smoke["if"] == "steps.changed.outputs.deploy == 'true' && steps.plan.outputs.full_tests != 'true'"
    assert full["env"]["SIGNAL_TEST_PREVIEW"] == smoke["env"]["SIGNAL_TEST_PREVIEW"] == "true"
    assert steps.index(full) < steps.index(passed) < steps.index(by_name["Persist canonical state"])
    assert steps.index(smoke) < steps.index(by_name["Upload Pages build"])
    assert not any(step.get("continue-on-error") == "true" for step in steps)
    assert workflow["concurrency"]["cancel-in-progress"] == "false"
