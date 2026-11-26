#!/usr/bin/env bash
set -euo pipefail
snapshot=$1
workspace=$2
session=$3
extra=/tmp/sop-distilbert-extra-6000
hard=/tmp/sop-distilbert-hard-500
labels=/tmp/sop-distilbert-expanded-v1
until [[ -s "$extra/votes.jsonl.gz" && -s "$hard/votes.jsonl.gz" && -s "$hard/accepted-manifest.json" ]]; do sleep 4; done
python3 - "$extra" "$hard" <<'PY'
import gzip,hashlib,json,sys
from pathlib import Path
extra,hard=map(Path,sys.argv[1:])
for folder in (extra,hard):
    raw=(folder/'votes.jsonl.gz').read_bytes()
    summary=json.loads((folder/'review/summary.json').read_text())
    if hashlib.sha256(raw).hexdigest()!=summary['votesSha256']:
        raise ValueError('Vote archive hash does not match seal')
    votes=[json.loads(line) for line in gzip.decompress(raw).splitlines()]
    if len(votes)!=summary['eligibleIdCircuitPairs']:
        raise ValueError('Vote archive does not cover the sealed input')
manifest=json.loads((hard/'accepted-manifest.json').read_text())
payload=(hard/'accepted-supervision.jsonl.gz').read_bytes()
if hashlib.sha256(payload).hexdigest()!=manifest['sha256'] or len(gzip.decompress(payload).splitlines())!=manifest['accepted']:
    raise ValueError('Hard-case accepted supervision differs from its seal')
PY
export SOP_KNOWLEDGE_DIR="$workspace/sop-knowledge-worlds"
node "$snapshot/experiments/distilbert/expansion/merge.mjs" /tmp/sop-distilbert-grounded-v1 "$extra" "$labels" "$hard"
for partition in dev study; do cmp "/tmp/sop-distilbert-grounded-v1/$partition.jsonl.gz" "$labels/$partition.jsonl.gz"; done
base=/home/salboaie/.cache/huggingface/hub/models--distilbert-base-uncased/snapshots/12040accade4e8a0f71eabdb258fecc2e7e948be
bash "$session/train-paired.sh" "$snapshot" "$labels" "$session" "$base" /home/salboaie/nlp-venv/bin/python "$workspace/soplang-nlu/.local-models/distilbert"
