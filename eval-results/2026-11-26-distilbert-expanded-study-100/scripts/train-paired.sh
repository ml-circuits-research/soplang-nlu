#!/usr/bin/env bash
set -euo pipefail
snapshot=$1
labels=$2
out=$3
base=$4
python=$5
models=$6
mkdir -p "$models"
export PYTHONDONTWRITEBYTECODE=1 HF_HUB_OFFLINE=1 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 MKL_NUM_THREADS=2
for arch in span ownership; do
  architecture=()
  if [[ $arch == ownership ]]; then architecture=(--ownership); fi
  "$python" "$snapshot/strategies/distilbert/train.py" "$labels/train.jsonl.gz" "$labels/dev.jsonl.gz" "$out/$arch" \
    --base "$base" --device cuda --epochs 8 --patience 3 --batch 24 --seed 74113 --disable-triton "${architecture[@]}" \
    >"$out/$arch.log" 2>&1
  checkpoint="$models/$arch-expanded-v1"
  test ! -e "$checkpoint"
  staging=$(mktemp -d "$models/.$arch-expanded-v1-XXXXXX")
  cp -a "$out/$arch/checkpoint/." "$staging/"
  "$python" - "$out/$arch/training-summary.json" "$staging" <<'PY'
import hashlib,json,sys
from pathlib import Path
summary=json.loads(Path(sys.argv[1]).read_text())
checkpoint=Path(sys.argv[2])
for name, expected in summary['checkpointFiles'].items():
    with (checkpoint/name).open('rb') as stream:
        if hashlib.file_digest(stream,'sha256').hexdigest()!=expected:
            raise ValueError('Checkpoint copy differs: '+name)
PY
  mv -T "$staging" "$checkpoint"
done
