"""Run a pinned 500-source inventory in restartable, disjoint worker lanes."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

p = argparse.ArgumentParser()
p.add_argument("inventory", type=Path)
p.add_argument("--start", type=int, default=1)
p.add_argument("--end", type=int)
p.add_argument("--lane", type=int, default=0)
p.add_argument("--lanes", type=int, default=1)
args=p.parse_args()
if not (0 <= args.lane < args.lanes and args.start >= 1):
    p.error("invalid lane or first batch")
root=Path(__file__).resolve().parents[2]
directory=args.inventory.resolve()
manifest=json.loads((directory/"manifest.json").read_text())
knowledge=Path(os.environ["SOP_KNOWLEDGE_DIR"]).resolve()
for group in manifest["groups"]:
    number=int(group["number"])
    if number < args.start or (args.end is not None and number > args.end):
        continue
    if (number-args.start) % args.lanes != args.lane or group["usage"]!="development":
        continue
    source=directory/group["file"]
    if hashlib.sha256(source.read_bytes()).hexdigest()!=group["sha256"]:
        sys.exit("Source batch changed: "+str(source))
    work=directory/"work"/group["number"]
    work.mkdir(parents=True,exist_ok=True)
    with (work/"queue.lock").open("a") as lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            continue
        if (work/"summary.json").exists():
            continue
        teacher_input=source
        if group["withDraft"]<group["rows"]:
            teacher_input=work/"drafts.jsonl.gz"
            if not teacher_input.exists():
                subprocess.run(["node",root/"experiments/native-curation/drafts.mjs",source,teacher_input],check=True)
        with (work/"queue.log").open("a") as log:
            subprocess.run(["node",root/"experiments/native-teacher/curate.mjs",teacher_input,work,knowledge],
                           stdout=log,stderr=subprocess.STDOUT,check=True)
        print(group["number"],(work/"summary.json").read_text().strip(),flush=True)
