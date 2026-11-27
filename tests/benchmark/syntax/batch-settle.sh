#!/usr/bin/env bash
# After batch-run.sh: settles every conversion folder by agreement and prepares the audit.
#   tests/benchmark/syntax/batch-settle.sh [audit share, default 0.02] [parallel folders, default 8] [--again] [--key relaxed|variants|core]
# For each folder of eval-results/conversion/ that holds the circuits of hmm-rules (vss.jsonl in the folders
# written before the strategy was renamed on 2026-11-27) and of a strategy of the parser family: hmm-rules
# is run again (it is quick, and its rules change), then the circuits
# the two wrote alike are settled by agreement
# (round.mjs settle --families 2 --key <key> --prefer hmm-rules --judge audit). The key says what "alike"
# is: relaxed (the default) up to the start of marked relations; variants also up to the other
# choices the judges' rules let pass either way (see README.md); core the same core. A judge reads
# only the audit share. Nothing is written to the dataset here; round.mjs write does that per folder.
# A folder that is settled already (settle.json) is left as it is, unless --again is given.
set -u
cd "$(dirname "$0")/../../.."
audit=""; parallel=""; again=""; key="relaxed"
while [ $# -gt 0 ]; do
  case "$1" in
    --again) again="--again" ;;
    --key) key="${2:-}"; shift ;;
    *) if [ -z "$audit" ]; then audit="$1"; elif [ -z "$parallel" ]; then parallel="$1"; fi ;;
  esac
  shift
done
audit="${audit:-0.02}"
parallel="${parallel:-8}"
case "$key" in relaxed|variants|core) ;; *) echo "--key is one of relaxed, variants, core" >&2; exit 2 ;; esac
unset SOP_KNOWLEDGE_DIR

one() {
  dir="$1"; audit="$2"; again="$3"; key="$4"
  [ -f "$dir/sample.json" ] || return
  { [ -f "$dir/spacy.jsonl" ] || [ -f "$dir/spacy-direct.jsonl" ]; } || return
  if [ -f "$dir/settle.json" ] && [ "$again" != "--again" ]; then return; fi
  node tests/benchmark/syntax/run.mjs "$dir" --sample "$dir/sample.json" --only hmm-rules > "$dir.hmm-rules.log" 2>&1
  node tests/benchmark/syntax/round.mjs settle "$dir" --families 2 --key "$key" --prefer hmm-rules --judge audit --audit "$audit" --size 170 > "$dir.settle.log" 2>&1
  echo "$(basename "$dir"): $(grep -E '^Settled by agreement' "$dir.settle.log" | cut -c1-140)"
}
export -f one
ls -d eval-results/conversion/*/ | sed 's#/$##' | xargs -P "$parallel" -I{} bash -c 'one "$@"' _ {} "$audit" "$again" "$key"
echo "batch settle finished"
