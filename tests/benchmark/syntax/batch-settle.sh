#!/usr/bin/env bash
# After batch-run.sh: settles every conversion folder by agreement and prepares the audit.
#   tests/benchmark/syntax/batch-settle.sh [audit share, default 0.02] [parallel folders, default 8] [--again]
# For each folder of eval-results/conversion/ that holds the circuits of VSS and of a strategy
# of the parser family: VSS is run again (it is quick, and its rules change), then the circuits
# the two wrote alike, up to the start of marked relations, are settled by agreement
# (round.mjs settle --families 2 --relaxed --prefer vss --judge audit). A judge reads only the
# audit share. Nothing is written to the dataset here; round.mjs write does that per folder.
# A folder that is settled already (settle.json) is left as it is, unless --again is given.
set -u
cd "$(dirname "$0")/../../.."
audit="${1:-0.02}"
parallel="${2:-8}"
again="${3:-}"
unset SOP_KNOWLEDGE_DIR

one() {
  dir="$1"; audit="$2"; again="$3"
  [ -f "$dir/sample.json" ] || return
  { [ -f "$dir/spacy.jsonl" ] || [ -f "$dir/spacy-direct.jsonl" ]; } || return
  if [ -f "$dir/settle.json" ] && [ "$again" != "--again" ]; then return; fi
  node tests/benchmark/syntax/run.mjs "$dir" --sample "$dir/sample.json" --only vss > "$dir.vss.log" 2>&1
  node tests/benchmark/syntax/round.mjs settle "$dir" --families 2 --relaxed --prefer vss --judge audit --audit "$audit" --size 170 > "$dir.settle.log" 2>&1
  echo "$(basename "$dir"): $(grep -E '^Settled by agreement' "$dir.settle.log" | cut -c1-110)"
}
export -f one
ls -d eval-results/conversion/*/ | sed 's#/$##' | xargs -P "$parallel" -I{} bash -c 'one "$@"' _ {} "$audit" "$again"
echo "batch settle finished"
