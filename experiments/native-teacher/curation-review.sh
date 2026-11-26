#!/usr/bin/env bash
set -euo pipefail
work=$1
shift
root=$(cd "$(dirname "$0")/../.." && pwd)
driver="$root/experiments/proposal-selection/review-pool.py"
reviewer="$root/tests/benchmark/meaning-review/run-review.py"
python3 "$driver" plan "$work" "$@"
review_pass() {
  local packet=$1 pass=$2 model=$3
  python3 "$reviewer" "$work/review/$packet-packets.json.gz" "$work/review/$pass.jsonl" \
    --profile native --model "$model" --jobs "${SOP_NLU_CURATION_REVIEW_JOBS:-8}" \
    --rows 10 --groups 12 --characters 48000 --expanded >"$work/$pass.log" 2>&1
}
review_pass candidate primary "${SOP_NLU_CURATION_PRIMARY_REVIEWER:-gpt-6.1-terra}" & terra=$!
review_pass candidate independent "${SOP_NLU_CURATION_SECOND_REVIEWER:-gpt-6.2-sol}" & sol=$!
wait "$terra"
wait "$sol"
python3 "$driver" audit "$work"
review_pass audit audit "${SOP_NLU_CURATION_ADJUDICATOR:-gpt-6.1-sol}"
python3 "$driver" seal "$work"
