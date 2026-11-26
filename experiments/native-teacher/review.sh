#!/usr/bin/env bash
set -euo pipefail
work=$1
prior=$2
root=$(cd "$(dirname "$0")/../.." && pwd)
driver="$root/experiments/proposal-selection/review-pool.py"
reviewer="$root/tests/benchmark/meaning-review/run-review.py"
python3 "$driver" plan "$work" "$prior"
review_pass() {
  local packet=$1 pass=$2 model=$3
  python3 "$reviewer" "$work/review/$packet-packets.json.gz" "$work/review/$pass.jsonl" \
    --profile native --model "$model" --jobs 4 --rows 8 --groups 8 --characters 40000 --expanded \
    >"$work/$pass.log" 2>&1
}
review_pass candidate primary gpt-6.1-terra & terra=$!
review_pass candidate independent gpt-6.2-sol & sol=$!
wait "$terra"
wait "$sol"
python3 "$driver" audit "$work"
review_pass audit audit gpt-6.1-sol
python3 "$driver" seal "$work"
