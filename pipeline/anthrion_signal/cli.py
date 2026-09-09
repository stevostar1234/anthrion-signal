import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path

from .collectors import COLLECTORS, Http, hydrate_sparse
from .config import evidence_catalog, load_config
from .dedupe import reconcile
from .intelligence import analyse_candidates, prefilter, score
from .models import Dataset, Signal, SourceHealth
from .normalise import NORMALISERS, set_hashes
from .retention import archive_expired, restore_matching
from .utils import atomic_bytes, atomic_json, digest, parse_date, read_json


def _collect(source, previous_state, now, config, previous_signals=None):
    state = previous_state.get(source["id"], {})
    health = SourceHealth(id=source["id"], name=source["name"], website=source["website"], enabled=source["enabled"],
                          status="not_checked", last_success=state.get("last_success"), last_attempt=now.isoformat())
    http = Http(os.getenv("SIGNAL_USER_AGENT", "AnthrionSignal/1.0"))
    try:
        result = COLLECTORS[source["collector"]](source, state, now, http, config["runtime"], config["search_terms"])
        hydrate_sparse(result, source, now, http, config["runtime"])
        health.records = len(result.records)
        health.status = "healthy" if result.complete else "partial" if result.records else "failed"
        health.message = result.message
        next_state = result.state
        if result.complete:
            health.last_success = now.isoformat()
            next_state["last_success"] = now.isoformat()
        normalised, rejected = [], 0
        families = {s.ocid: s for s in previous_signals or [] if s.ocid}
        for raw in sorted(result.records, key=lambda r: r.data.get("date") or ""):
            try:
                signal = (NORMALISERS[raw.kind](raw, prior=families.get(raw.data.get("ocid")))
                          if raw.kind == "ocds" else NORMALISERS[raw.kind](raw))
                if signal:
                    normalised.append(signal)
                    if signal.ocid:
                        families[signal.ocid] = signal
            except (ValueError, KeyError, TypeError):
                rejected += 1
        # A source schema regression must not silently advance its retrieval checkpoint.
        if rejected:
            health.status = "partial"
            health.message = f"{rejected} records could not be normalised; retrieval checkpoint retained."
            next_state = state
            health.last_success = state.get("last_success")
        return source["id"], normalised, next_state, health, len(result.records)
    except Exception as exc:
        health.status = "failed"
        health.message = "Source temporarily unavailable; previous records retained."
        print(f"Source {source['id']}: {type(exc).__name__}", flush=True)
        return source["id"], [], state, health, 0
    finally:
        http.close()


def derive_renewals(signals, now, config):
    result = []
    horizon = config["scoring"]["recommendation"]["renewal_horizon_days"]
    for signal in signals:
        if signal.signal_type != "AWARD" or signal.related_signal_id:
            continue
        end = parse_date(signal.extension_end or signal.contract_end)
        if not end or not 0 <= (end - now).days <= horizon:
            continue
        renewal = signal.model_copy(deep=True)
        renewal.id = signal.id + "_renewal"
        renewal.related_signal_id = signal.id
        renewal.signal_type, renewal.procurement_stage = "RENEWAL_SIGNAL", "planning"
        renewal.renewal_basis = f"Published {'maximum extension' if signal.extension_end else 'contract'} end: {end.date()}. A replacement procurement has not been confirmed."
        renewal.deadline_at = None
        renewal.status = "inferred"
        set_hashes(renewal)
        result.append(renewal)
    return result


def export(root):
    data = Dataset.model_validate(read_json(root / "data/current.json", {}))
    target = root / "app/public/data"
    target.mkdir(parents=True, exist_ok=True)
    atomic_json(target / "current.json", data.model_dump())
    return data


def run(root, args):
    config = load_config(root)
    now = datetime.now(UTC).replace(microsecond=0)
    runtime = config["runtime"]
    if args.days is not None:
        runtime["lookback_days"] = args.days
    if args.max_pages is not None:
        runtime["max_pages"] = args.max_pages
    if args.max_ai is not None:
        runtime["max_ai_calls"] = args.max_ai
    if args.no_ai:
        runtime["max_ai_calls"] = 0
    state_path = root / "data/source_state.json"
    state = read_json(state_path, {})
    previous_data = read_json(root / "data/current.json", None)
    canonical_path = root / "data/signals.jsonl"
    previous = [Signal.model_validate_json(line) for line in canonical_path.read_text(encoding="utf-8").splitlines() if line] if canonical_path.exists() else []
    wanted = set(args.sources.split(",")) if args.sources else None
    all_sources = config["sources"]["sources"]
    if wanted and not wanted.issubset({s["id"] for s in all_sources}):
        raise ValueError("Unknown source requested")
    selected = [s for s in all_sources if s["enabled"] and (not wanted or s["id"] in wanted)]
    old_health = {s["id"]: s for s in (previous_data or {}).get("sources", [])}
    health = {}
    incoming, raw_count = [], 0
    for source in all_sources:
        old = old_health.get(source["id"])
        health[source["id"]] = SourceHealth.model_validate(old) if old else SourceHealth(
            id=source["id"], name=source["name"], website=source["website"], enabled=source["enabled"],
            status="not_checked" if source["enabled"] else "disabled")
        health[source["id"]].enabled = source["enabled"]
        if not source["enabled"]:
            health[source["id"]].status = "disabled"
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(_collect, source, state, now, config, previous) for source in selected]
        for future in as_completed(futures):
            sid, records, new_state, status, count = future.result()
            incoming.extend(records)
            state[sid], health[sid] = new_state, status
            raw_count += count
            print(f"{status.name}: {status.status}, {count} records", flush=True)
    prefilter(incoming, config["company_profile"], config["search_terms"])
    incoming = [s for s in incoming if s.prefilter_score >= 12 or any(s.ocid and s.ocid == p.ocid for p in previous)]
    previous.extend(restore_matching(root, incoming, {s.id for s in previous}))
    signals, index, stats = reconcile(previous, incoming)
    signals = [s for s in signals if not (s.source == "govuk" and s.notice_type in
               ("person", "role", "organisation", "minister", "world_location", "statistics_announcement"))]
    prefilter(signals, config["company_profile"], config["search_terms"])
    print(f"Reconciled {len(signals)} candidates; analysing up to {runtime['max_ai_calls']} Gemini calls", flush=True)
    ai_stats = analyse_candidates(signals, config, root, now)
    for s in signals:
        score(s, config, now)
    signals = archive_expired(root, signals, now, runtime["retention_days"])
    current = list(signals)
    for renewal in derive_renewals(signals, now, config):
        score(renewal, config, now)
        current.append(renewal)
    current.sort(key=lambda s: (s.recommendation in ("PURSUE", "ENGAGE_NOW"), s.signal_type != "AWARD",
                               s.fit_score if s.fit_score is not None else s.prefilter_score * .6,
                               s.confidence_score), reverse=True)
    content_digest = digest([(s.id, s.content_hash, s.analysis_cache_key, s.fit_score, s.recommendation) for s in current])
    same_content = (previous_data or {}).get("run", {}).get("content_digest") == content_digest
    metadata = {"started_at": now.isoformat(), "finished_at": datetime.now(UTC).isoformat(),
        "sources_attempted": len(selected), "sources_succeeded": sum(health[s["id"]].status == "healthy" for s in selected),
        "raw_records": raw_count, "canonical_signals": len(signals), "candidates_shortlisted": sum(s.prefilter_score >= runtime["ai_min_score"] for s in signals),
        **stats, **ai_stats, "high_fit_signals": sum(s.fit_score is not None and s.fit_score >= 82 for s in current),
        "content_digest": content_digest, "content_changed": not same_content, "deployment_status": "awaiting_build",
        "scheduled_timezone": "Europe/London", "scheduled_times": ["06:15", "10:15", "14:15", "18:15", "22:15"]}
    dataset = Dataset(generated_at=now.isoformat(),
        data_updated_at=previous_data["data_updated_at"] if same_content else now.isoformat(),
        profile_version=config["company_profile"]["version"], scoring_version=config["scoring"]["version"], run=metadata,
        sources=list(health.values()), capabilities=[{"id": c["id"], "label": c["label"], "family": c["family"]} for c in config["company_profile"]["capabilities"]],
        markets=config["search_terms"]["markets"], evidence_catalog=evidence_catalog(config["company_profile"]), signals=current)
    if not current and previous_data:
        raise ValueError("Refusing to replace the previous public dataset with an empty dataset")
    if not current:
        raise ValueError("No source records available; retry ingestion before publishing")
    public = dataset.model_dump()
    Dataset.model_validate(public)
    root.joinpath("data").mkdir(exist_ok=True)
    canonical_body = "\n".join(s.model_dump_json() for s in sorted(signals, key=lambda s: s.id)) + "\n"
    atomic_bytes(canonical_path, canonical_body.encode("utf-8"))
    atomic_json(root / "data/current.json", public)
    atomic_json(root / "data/dedupe_index.json", index)
    atomic_json(root / "data/run_metadata.json", metadata)
    history = root / "data/history.jsonl"
    if not same_content:
        with history.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps({"at": now.isoformat(), **stats, "content_digest": content_digest}) + "\n")
    # Watermarks are persisted last so interrupted publication causes overlap, never a skipped window.
    atomic_json(state_path, state)
    export(root)
    print(json.dumps(metadata, indent=2), flush=True)
    return dataset


def main():
    parser = argparse.ArgumentParser(description="Collect, verify, rank and publish Anthrion opportunities")
    parser.add_argument("command", choices=["ingest", "validate", "export"])
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--sources")
    parser.add_argument("--days", type=int)
    parser.add_argument("--max-pages", type=int)
    parser.add_argument("--max-ai", type=int)
    parser.add_argument("--no-ai", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    if args.command == "validate":
        dataset = Dataset.model_validate(read_json(root / "data/current.json", {}))
        print(f"Validated {len(dataset.signals)} public signals")
        return
    if args.command == "export":
        export(root)
        return
    lock = root / "data/.lock"
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        with lock.open("x") as stream:
            stream.write(str(os.getpid()))
    except FileExistsError:
        raise SystemExit("An ingestion lock exists. Confirm no collector is running before removing data/.lock.") from None
    try:
        run(root, args)
    finally:
        lock.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
