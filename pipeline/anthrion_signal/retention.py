import gzip
from collections import defaultdict
from datetime import timedelta

from .dedupe import exact_keys
from .models import Signal
from .utils import atomic_bytes, atomic_json, parse_date, read_json


def is_current(signal, now, retention_days):
    end = parse_date(signal.extension_end or signal.contract_end)
    deadline = parse_date(signal.deadline_at)
    recent = parse_date(signal.updated_at) or parse_date(signal.first_seen_at)
    return bool((deadline and deadline >= now) or (end and end >= now)
                or now - recent < timedelta(days=retention_days))


def read_archive(root, month):
    if len(month) != 7 or not month[:4].isdigit() or month[4] != "-" or not month[5:].isdigit():
        raise ValueError("Invalid archive partition")
    path = root / "data/archive" / f"{month}.jsonl.gz"
    if not path.exists():
        return {}
    return {s.id: s for line in gzip.decompress(path.read_bytes()).decode("utf-8").splitlines()
            if line for s in [Signal.model_validate_json(line)]}


def restore_matching(root, incoming, existing_ids):
    index = read_json(root / "data/archive_index.json", {})
    partitions = defaultdict(set)
    for signal in incoming:
        for key in exact_keys(signal):
            if key in index and index[key]["id"] not in existing_ids:
                partitions[index[key]["month"]].add(index[key]["id"])
    restored = {}
    for month, ids in partitions.items():
        restored.update({sid: s for sid, s in read_archive(root, month).items() if sid in ids})
    return list(restored.values())


def archive_expired(root, signals, now, retention_days):
    current, partitions = [], defaultdict(list)
    for signal in signals:
        if is_current(signal, now, retention_days):
            current.append(signal)
        else:
            month = (parse_date(signal.updated_at) or parse_date(signal.first_seen_at)).strftime("%Y-%m")
            partitions[month].append(signal)
    index = read_json(root / "data/archive_index.json", {})
    for month, expired in partitions.items():
        records = read_archive(root, month)
        records.update({s.id: s for s in expired})
        body = "\n".join(records[sid].model_dump_json() for sid in sorted(records)) + "\n"
        atomic_bytes(root / "data/archive" / f"{month}.jsonl.gz", gzip.compress(body.encode("utf-8"), mtime=0))
        for signal in expired:
            for key in exact_keys(signal):
                index[key] = {"month": month, "id": signal.id}
    if partitions:
        atomic_json(root / "data/archive_index.json", index)
    return current
