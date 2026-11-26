#!/usr/bin/env bash
set -euo pipefail
nlu=$1
cohort=$2
jobs=$3
shift 3
review="$cohort/review"
tools="$nlu/tests/benchmark/meaning-review"
driver="$nlu/experiments/proposal-selection/review-pool.py"
install="$cohort/pool.jsonl.gz.timing.json"
if [[ ! -s "$install" ]]; then
  echo "The collector must seal its pool and timing manifest before review." >&2
  exit 1
fi
review_pass() {
  local packet=$1 pass=$2 model=$3
  python3 "$tools/run-review.py" "$review/$packet-packets.json.gz" "$review/$pass.jsonl" \
    --profile native --model "$model" --jobs "$jobs" --rows 18 --groups 32 --characters 54000 --expanded
}
python3 "$driver" plan "$cohort" "$@"
review_pass candidate primary gpt-6-sol >"$cohort/primary.log" 2>&1 & first=$!
review_pass candidate independent gpt-6.1-terra >"$cohort/independent.log" 2>&1 & second=$!
wait "$first"
wait "$second"
python3 "$driver" audit "$cohort"
review_pass audit audit gpt-6.2-sol >"$cohort/audit.log" 2>&1
python3 "$driver" seal "$cohort"
