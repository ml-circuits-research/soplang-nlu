#!/usr/bin/env bash
set -euo pipefail
work=$1
nlu=$2
projector=$3
review="$work/adapted/review"
results="$nlu/eval-results"
historical="$results/2026-11-26-spacy-direct-historical-refresh-one-percent"
prior=("$historical/compact/review" "$historical/transformer/review")
reuse() {
  HISTORICAL_TRF_PRECEDENCE=1 python3 "$results/2026-11-26-spacy-direct-historical-one-percent/reuse.py" "$1" "$review" "${prior[@]}"
}
fresh="$projector/tests/benchmark/fresh-eval.mjs"
reuse prepare-primary
REVIEW_JOBS=5 node "$fresh" primary "$review/novel" >"$work/adapted/primary.log" 2>&1 & primary=$!
REVIEW_JOBS=5 node "$fresh" independent "$review/novel" >"$work/adapted/independent.log" 2>&1 & independent=$!
wait "$primary"
wait "$independent"
reuse merge-primary
node "$fresh" audit-plan "$review"
reuse prepare-audit
REVIEW_JOBS=6 node "$fresh" audit "$review/novel" >"$work/adapted/audit.log" 2>&1
reuse merge-audit
node "$projector/tests/benchmark/meaning-review/review-public-candidates.mjs" score "$review" "$work/adapted/inference" spacy-direct
