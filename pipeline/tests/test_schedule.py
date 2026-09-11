from pathlib import Path

import yaml

from anthrion_signal.cli import SCHEDULED_TIMES


def test_workflow_and_published_refresh_times_match():
    path = Path(__file__).resolve().parents[2] / ".github/workflows/ingest-and-deploy.yml"
    workflow = yaml.load(path.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
    times = []
    for schedule in workflow["on"]["schedule"]:
        assert schedule["timezone"] == "Europe/London"
        minute, hours, day, month, weekday = schedule["cron"].split()
        assert (day, month, weekday) == ("*", "*", "*")
        times.extend(f"{int(hour):02}:{int(minute):02}" for hour in hours.split(","))
    assert sorted(times) == SCHEDULED_TIMES == ["06:15", "08:55", "10:15", "14:15", "18:15"]
    assert len(times) == len(set(times)) == 5
