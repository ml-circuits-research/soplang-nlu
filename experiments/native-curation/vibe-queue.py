"""Convert unannotated WebMeet texts with Vibe and publish static-only conversion shards."""
import argparse
from collections import defaultdict
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time


def lines(path):
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def packed(rows):
    return gzip.compress("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows).encode(), mtime=0)


def create_plan(inventory, dataset, queue, reserved_only, group_rows):
    manifest = json.loads((inventory / "manifest.json").read_text())
    revision = git(dataset, "rev-parse", "HEAD").strip()
    native_paths = git(dataset, "ls-tree", "-r", "--name-only", revision, "--", "annotations/nlu/v1").splitlines()
    approved = set()
    for path in native_paths:
        if not re.match(r"annotations/nlu/v1/(readings|batches/[^/]+)\.jsonl$", path):
            continue
        approved.update(json.loads(line)["text"] for line in
                        git(dataset, "show", f"{revision}:{path}").split("\n") if line)
    for path in native_paths:
        if not re.match(r"annotations/nlu/v1/conversions/vibe/[^/]+\.jsonl\.gz$", path):
            continue
        blob = subprocess.check_output(["git", "-C", dataset, "show", f"{revision}:{path}"])
        approved.update(json.loads(line)["text"] for line in gzip.decompress(blob).decode().split("\n") if line)
    files = defaultdict(list)
    reserved = 0
    for batch in manifest["groups"]:
        is_reserved = batch["usage"] == "reserved-evaluation"
        if is_reserved != reserved_only:
            reserved += batch["rows"] if is_reserved else 0
            continue
        sources = inventory / batch["file"]
        if hashlib.sha256(sources.read_bytes()).hexdigest() != batch["sha256"]:
            raise ValueError(f"Inventory digest mismatch: {sources}")
        cached = inventory / "work" / batch["number"] / "drafts.jsonl.gz"
        drafts = {row["id"]: row for row in lines(cached)} if cached.exists() else {}
        for row in lines(sources):
            if row["text"] not in approved:
                candidate = drafts.get(row["id"], row)
                if candidate["text"] != row["text"]:
                    raise ValueError("Draft source differs from frozen text")
                files[row["id"].rsplit("#", 1)[0]].append(candidate)
    groups = []
    for name, rows in sorted(files.items()):
        for start in range(0, len(rows), group_rows):
            path = f"{Path(name).with_suffix('').as_posix().replace('/', '-')}-{start//group_rows:02d}"
            if group_rows != 500:
                path = f"group-{group_rows}-" + path
            if reserved_only:
                path = "reserved-" + path
            chunk = rows[start:start+group_rows]
            data = packed(chunk)
            group = {"sourceFile": name, "key": path, "rows": len(chunk),
                     "sha256": hashlib.sha256(data).hexdigest()}
            groups.append(group)
            (queue / (path + ".jsonl.gz")).write_bytes(data)
    return {"sourceRevision": manifest["sourceRevision"], "annotationRevision": revision,
            "excludedReserved": reserved, "reservedOnly": reserved_only, "groupRows": group_rows, "groups": groups}


def git(repo, *args):
    return subprocess.check_output(["git", "-C", repo, *args], text=True)


def main():
    p = argparse.ArgumentParser()
    for name in ("inventory", "dataset", "queue"):
        p.add_argument(name, type=Path)
    p.add_argument("--limit", type=int, default=0, help="Run at most this many unfinished groups; 0 means all")
    p.add_argument("--plan-only", action="store_true")
    p.add_argument("--jobs", type=int, default=1, choices=[1],
                   help="Concurrent Vibe requests within one CSV group")
    p.add_argument("--group-rows", type=int, default=500, metavar="N",
                   help="Maximum rows from one CSV per new publication group")
    p.add_argument("--min-percent", type=int, default=90, metavar="N",
                   help="Stop if less than this percentage passed in the last group")
    p.add_argument("--batch-rows", type=int, default=None, metavar="N",
                   help="Request width for new groups; unfinished groups retain their manifest width")
    p.add_argument("--reserved-only", action="store_true", help="Convert reserved rows after scoring the frozen benchmark")
    a = p.parse_args()
    if not 1 <= a.group_rows <= 10000 or not 1 <= a.min_percent <= 100:
        p.error("Expected a group size from 1 to 10000 and a minimum percentage from 1 to 100")
    if a.batch_rows is not None and not 1 <= a.batch_rows <= 10000:
        p.error("Expected a request width from 1 to 10000")
    inventory, dataset, queue = (path.resolve() for path in (a.inventory, a.dataset, a.queue))
    root = Path(__file__).resolve().parents[2]
    if a.reserved_only:
        benchmark = root / "eval-results/2026-11-26-prospective-ownership-one-percent/source-review"
        if not (benchmark / "candidate-review-summary.json").is_file():
            p.error("Finish scoring the frozen holdout before converting its reserved texts")
    queue.mkdir(parents=True, exist_ok=True)
    with (queue / "queue.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        manifest = queue / "plan.json"
        if not manifest.exists():
            plan = create_plan(inventory, dataset, queue, a.reserved_only, a.group_rows)
            tmp = manifest.with_suffix(".tmp")
            tmp.write_text(json.dumps(plan, indent=2) + "\n")
            tmp.replace(manifest)
        plan = json.loads(manifest.read_text())
        if bool(plan.get("reservedOnly")) != a.reserved_only:
            p.error("Use a separate queue for reserved sources")
        print(json.dumps({"groups": len(plan["groups"]), "rows": sum(g["rows"] for g in plan["groups"])}), flush=True)
        if a.plan_only:
            return
        env = dict(os.environ, SOP_NLU_CURATION_BACKEND="vibe", SOP_NLU_CURATION_JOBS=str(a.jobs),
                   SOP_NLU_CURATION_MODEL="deepseek-v4-1-flash-1017")
        for i, group in enumerate(g for g in plan["groups"] if not (queue / (g["key"] + ".done")).exists()):
            if a.limit and i >= a.limit:
                break
            key = group["key"]
            source = queue / (key + ".jsonl.gz")
            if group.get("sha256") and hashlib.sha256(source.read_bytes()).hexdigest() != group["sha256"]:
                raise ValueError(f"Conversion input digest mismatch: {source}")
            work = queue / "work" / key
            work.mkdir(parents=True, exist_ok=True)
            group_env = env.copy()
            group_env["SOP_NLU_VIBE_GROUP_ROWS"] = str(max(500, group["rows"]))
            prior = queue / "previous" / key
            if prior.is_dir():
                group_env["SOP_NLU_VIBE_PRIOR"] = str(prior)
            group_manifest = work / "manifest.json"
            if group_manifest.exists():
                group_env["SOP_NLU_VIBE_BATCH_ROWS"] = str(json.loads(group_manifest.read_text())["microRows"])
            elif a.batch_rows is not None:
                group_env["SOP_NLU_VIBE_BATCH_ROWS"] = str(a.batch_rows)
            with (work / "run.log").open("a") as log:
                if not (work / "summary.json").exists():
                    command = ["node", root / "experiments/native-teacher/curate.mjs", source, work,
                               env["SOP_KNOWLEDGE_DIR"]]
                    for attempt in range(2):
                        result = subprocess.run(command, cwd=root, env=group_env, stdout=log, stderr=subprocess.STDOUT)
                        if not result.returncode:
                            break
                        if attempt == 1:
                            result.check_returncode()
                        print(f"{key}: Vibe process failed; retrying from the last checkpoint", flush=True)
                        time.sleep(30 * (attempt + 1))
            results = lines(work / "logical-00000/records.jsonl.gz")
            expected = [(r["id"], r["text"]) for r in lines(source)]
            if [(r["id"], r["text"]) for r in results] != expected:
                raise ValueError(f"Incomplete or misaligned conversion: {key}")
            meta = json.loads((work / "manifest.json").read_text())
            converted = sum(r["status"] == "curated" for r in results)
            if not converted:
                raise ValueError(f"No eligible readings in {key}; inspect backend output before continuing")
            output = Path("annotations/nlu/v1/conversions/vibe") / (key + ".jsonl.gz")
            payload = packed({"id": r["id"], "text": r["text"], "status": "static-pass" if r["readings"] else "rework",
                              "readings": [c["sop"] for c in r["readings"]], "problems": r.get("problems", []),
                              "sourceRevision": plan["sourceRevision"], "model": env["SOP_NLU_CURATION_MODEL"],
                              "schemaSha256": meta["schemaSha256"], "checkerSha256": meta["checkerSha256"]}
                             for r in results)
            destination = dataset / output
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists() and destination.read_bytes() != payload:
                raise ValueError(f"Output already exists with different content: {destination}")
            if not destination.exists():
                tmp = destination.with_suffix(".tmp")
                tmp.write_bytes(payload)
                tmp.replace(destination)
            subprocess.run(["git", "-C", dataset, "add", "--", output], check=True)
            changed = subprocess.run(["git", "-C", dataset, "diff", "--cached", "--quiet", "--", output]).returncode
            if changed == 1:
                subprocess.run(["git", "-C", dataset, "commit", "--only", "-m",
                                f"Convert WebMeet native drafts for {key} via DeepSeek Flash", "--", output], check=True)
            elif changed:
                raise RuntimeError("Could not verify staged conversion")
            (queue / (key + ".done")).write_text(str(converted) + "\n")
            print(f"{key}: {converted}/{len(results)} pass current checks", flush=True)
            if 100 * converted < a.min_percent * len(results):
                raise SystemExit(f"{key}: fewer than {a.min_percent}% passed; stopping before the next group")


if __name__ == "__main__":
    main()
