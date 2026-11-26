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


def lines(path):
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def packed(rows):
    return gzip.compress("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows).encode(), mtime=0)


def create_plan(inventory, dataset, queue):
    manifest = json.loads((inventory / "manifest.json").read_text())
    revision = git(dataset, "rev-parse", "HEAD").strip()
    native_paths = git(dataset, "ls-tree", "-r", "--name-only", revision, "--", "annotations/nlu/v1").splitlines()
    approved = set()
    for path in native_paths:
        if not re.match(r"annotations/nlu/v1/(readings|batches/[^/]+)\.jsonl$", path):
            continue
        approved.update(json.loads(line)["text"] for line in
                        git(dataset, "show", f"{revision}:{path}").split("\n") if line)
    files = defaultdict(list)
    reserved = 0
    for batch in manifest["groups"]:
        if batch["usage"] != "development":
            reserved += batch["rows"]
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
        for start in range(0, len(rows), 500):
            path = f"{Path(name).with_suffix('').as_posix().replace('/', '-')}-{start//500:02d}"
            group = {"sourceFile": name, "key": path, "rows": len(rows[start:start+500])}
            groups.append(group)
            (queue / (path + ".jsonl.gz")).write_bytes(packed(rows[start:start+500]))
    return {"sourceRevision": manifest["sourceRevision"], "annotationRevision": revision,
            "excludedReserved": reserved, "groups": groups}


def git(repo, *args):
    return subprocess.check_output(["git", "-C", repo, *args], text=True)


def main():
    p = argparse.ArgumentParser()
    for name in ("inventory", "dataset", "queue"):
        p.add_argument(name, type=Path)
    p.add_argument("--limit", type=int, default=0, help="Run at most this many unfinished groups; 0 means all")
    p.add_argument("--plan-only", action="store_true")
    a = p.parse_args()
    inventory, dataset, queue = (path.resolve() for path in (a.inventory, a.dataset, a.queue))
    root = Path(__file__).resolve().parents[2]
    queue.mkdir(parents=True, exist_ok=True)
    with (queue / "queue.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        manifest = queue / "plan.json"
        if not manifest.exists():
            plan = create_plan(inventory, dataset, queue)
            tmp = manifest.with_suffix(".tmp")
            tmp.write_text(json.dumps(plan, indent=2) + "\n")
            tmp.replace(manifest)
        plan = json.loads(manifest.read_text())
        print(json.dumps({"groups": len(plan["groups"]), "rows": sum(g["rows"] for g in plan["groups"])}), flush=True)
        if a.plan_only:
            return
        env = dict(os.environ, SOP_NLU_CURATION_BACKEND="vibe", SOP_NLU_CURATION_JOBS="1",
                   SOP_NLU_CURATION_MODEL="deepseek-v4-1-flash-1017")
        for i, group in enumerate(g for g in plan["groups"] if not (queue / (g["key"] + ".done")).exists()):
            if a.limit and i >= a.limit:
                break
            key = group["key"]
            source = queue / (key + ".jsonl.gz")
            work = queue / "work" / key
            work.mkdir(parents=True, exist_ok=True)
            with (work / "run.log").open("a") as log:
                if not (work / "summary.json").exists():
                    subprocess.run(["node", root / "experiments/native-teacher/curate.mjs", source, work,
                                    env["SOP_KNOWLEDGE_DIR"]], cwd=root, env=env, check=True,
                                   stdout=log, stderr=subprocess.STDOUT)
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


if __name__ == "__main__":
    main()
