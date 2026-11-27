#!/usr/bin/env bash
# After batch-run.sh: settles every conversion folder by agreement and prepares the audit.
#   tests/benchmark/syntax/batch-settle.sh [audit share, default 0.02]
# For each folder of eval-results/conversion/ that holds the circuits of VSS and of a strategy
# of the parser family: VSS is run again (it is quick, and its rules change), then the circuits
# the two wrote alike, up to the start of marked relations, are settled by agreement
# (round.mjs settle --families 2 --relaxed --prefer vss --judge audit). A judge reads only the
# audit share. Nothing is written to the dataset here; round.mjs write does that per folder.
set -u
cd "$(dirname "$0")/../../.."
audit="${1:-0.02}"
unset SOP_KNOWLEDGE_DIR
total=0; agreed=0; packets=0
for dir in eval-results/conversion/*/; do
  dir="${dir%/}"
  [ -f "$dir/sample.json" ] || continue
  { [ -f "$dir/spacy.jsonl" ] || [ -f "$dir/spacy-direct.jsonl" ]; } || continue
  node tests/benchmark/syntax/run.mjs "$dir" --sample "$dir/sample.json" --only vss > "$dir.vss.log" 2>&1
  node tests/benchmark/syntax/round.mjs settle "$dir" --families 2 --relaxed --prefer vss --judge audit --audit "$audit" --size 170 > "$dir.settle.log" 2>&1
  line="$(grep -E '^Settled by agreement' "$dir.settle.log")"
  echo "$(basename "$dir"): $line" | cut -c1-200
done
echo "batch settle finished"
