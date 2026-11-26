#!/usr/bin/env bash
set -euo pipefail
snapshot=$1
labels=$2
out=$3
knowledge=$4
python=$5
models=$6
archive="$snapshot/eval-results"
baselines="$archive/2026-11-26-property-result-projector-pilot/validation/outcomes.json.gz"
export PYTHONDONTWRITEBYTECODE=1 HF_HUB_OFFLINE=1 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 MKL_NUM_THREADS=2 SOP_KNOWLEDGE_DIR="$knowledge"
for arch in span ownership; do
  model="$models/$arch-expanded-v1"
  work="$out/study-$arch"
  node "$snapshot/experiments/distilbert/study.mjs" "$labels/study.jsonl.gz" "$baselines" "$work" "$knowledge" "$python" "$model"
  node "$snapshot/experiments/distilbert/compare-heads.mjs" "$work/pool.jsonl.gz" "$work/head-comparison.json"
done
for arch in span ownership; do
  work="$out/study-$arch"
  early="$out/span-early-review"
  if [[ $arch == span && -s "$early/votes.jsonl.gz" ]] &&
     cmp -s "$early/pool.jsonl.gz" "$work/pool.jsonl.gz"; then
    cp -a "$early/review" "$work/review"
    cp -a "$early/votes.jsonl.gz" "$work/votes.jsonl.gz"
    node "$snapshot/experiments/distilbert/score-study.mjs" "$work" "$baselines" "$knowledge"
    continue
  fi
  prior=("$archive/2026-11-26-neuro-selector-proposal-pools/train/review"
         "$archive/2026-11-26-distilbert-native-study-100/review"
         "$archive/2026-11-26-distilbert-ownership-study-100/review")
  if [[ $arch == ownership ]]; then prior+=("$out/study-span/review"); fi
  bash "$snapshot/experiments/native-teacher/curation-review.sh" "$work" "${prior[@]}"
  node "$snapshot/experiments/distilbert/score-study.mjs" "$work" "$baselines" "$knowledge"
done
