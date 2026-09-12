import json
from pathlib import Path

import yaml

from anthrion_signal.cli import SCHEDULED_TIMES, export
from anthrion_signal.models import Dataset


def test_workflow_and_published_refresh_times_match():
    path = Path(__file__).resolve().parents[2] / ".github/workflows/ingest-and-deploy.yml"
    workflow = yaml.load(path.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
    times = []
    for schedule in workflow["on"]["schedule"]:
        assert schedule["timezone"] == "Europe/London"
        minute, hours, day, month, weekday = schedule["cron"].split()
        assert (day, month, weekday) == ("*", "*", "*")
        selected_hours = range(24) if hours == "*" else map(int, hours.split(","))
        times.extend(f"{hour:02}:{int(minute):02}" for hour in selected_hours)
    assert sorted(times) == SCHEDULED_TIMES == [f"{hour:02}:50" for hour in range(24)]
    assert len(times) == len(set(times)) == 24


def test_export_publishes_current_schedule_without_claiming_a_new_collection(tmp_path):
    dataset = Dataset(generated_at="2026-09-11T12:00:00Z", data_updated_at="2026-09-11T12:00:00Z",
                      profile_version="1", scoring_version="none", run={"scheduled_times": ["08:55"]},
                      sources=[], capabilities=[], markets={}, evidence_catalog={}, signals=[])
    (tmp_path / "data").mkdir()
    path = tmp_path / "data/current.json"
    path.write_text(dataset.model_dump_json(), encoding="utf-8")
    export(tmp_path)
    published = json.loads((tmp_path / "app/public/data/current.json").read_text(encoding="utf-8"))
    assert published["run"]["scheduled_times"] == SCHEDULED_TIMES
    assert published["run"]["scheduled_timezone"] == "Europe/London"
    assert published["generated_at"] == dataset.generated_at
    assert json.loads(path.read_text(encoding="utf-8"))["run"]["scheduled_times"] == ["08:55"]
