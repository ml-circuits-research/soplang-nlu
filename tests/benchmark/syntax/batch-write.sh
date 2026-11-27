#!/usr/bin/env bash
# After batch-settle.sh and the audit: writes, for every conversion folder, the circuits settled by
# agreement (and whatever a judge accepted or wrote) into the dataset's syntactic files. Messages
# with no settled circuit keep an empty cell (round.mjs write --allow-open); a later call for the
# same folder, with another tag, fills them once they are judged or written.
#   tests/benchmark/syntax/batch-write.sh <tag prefix> [judge model]
# A circuit settled by agreement is written into the syntactic file only; the registry gets a file
# for a folder only when a judge decided something in it. The folders are written one after the other.
set -u
cd "$(dirname "$0")/../../.."
prefix="${1:?a tag prefix, for example 2026-11-27-agreement}"
judge="${2:-claude-opus-5-5}"
unset SOP_KNOWLEDGE_DIR
done=0; failed=0
for dir in eval-results/conversion/*/; do
  dir="${dir%/}"; name="$(basename "$dir")"
  [ -f "$dir/settle.json" ] || continue
  if node tests/benchmark/syntax/round.mjs write "$dir" --tag "$prefix-$name" --judge "$judge" --allow-open > "$dir.write.log" 2>&1; then done=$((done+1)); else failed=$((failed+1)); echo "failed: $name: $(tail -n 1 "$dir.write.log" | cut -c1-160)"; fi
done
echo "batch write finished: $done folders written, $failed failed"
