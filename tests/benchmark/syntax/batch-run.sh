#!/usr/bin/env bash
# Runs the three strategies of the batch conversion over every source file of the dataset that has
# no syntactic file yet: one round folder per file, eval-results/conversion/<tab>__<name>/.
# The three read a message from different sources (VSS, the dependency parser, DistilBERT), so
# that two of them writing the same circuit says something. No judge is involved here.
#
#   tests/benchmark/syntax/batch-run.sh [parallel files, default 4] [strategies, default vss,spacy-direct,distilbert] [new|open]
#
# A file whose round folder already holds the output of a strategy is not run again for it
# (run.mjs --reuse). The strategies see the environment variables they document; set them first.
set -u
cd "$(dirname "$0")/../../.."
parallel="${1:-4}"
strategies="${2:-vss,spacy-direct,distilbert}"
dataset="../webmeet-dataset"
out="eval-results/conversion"
mkdir -p "$out"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-2}"
unset SOP_KNOWLEDGE_DIR

one() {
  file="$1"; strategies="$2"; out="$3"
  name="$(echo "${file%.csv}" | tr '/' '_' | sed 's/_/__/')"
  dir="$out/$name"
  if [ ! -f "$dir/sample.json" ]; then
    node tests/benchmark/syntax/round.mjs start "$dir" --files "$file" --min-messages 1 > "$dir.start.log" 2>&1 || { echo "start failed: $file"; return; }
  fi
  node tests/benchmark/syntax/run.mjs "$dir" --sample "$dir/sample.json" --only "$strategies" --reuse "$dir" --jobs 3 > "$dir.run.log" 2>&1
  echo "done $file: $(grep -c . "$dir/sample.json" > /dev/null; tail -n 6 "$dir.run.log" | grep -E '^\| (vss|spacy-direct|distilbert|z3) ' | awk -F'|' '{printf "%s%s/%s ", $2, $5, $4}')"
}
export -f one

# the source files with no syntactic file, smallest first
# (a file that a hand-run round holds, eval-results/*-round-*/files.json, is left to that round)
# With a third argument "open", the files of the batch conversion (they have a folder in eval-results/conversion and empty cells) are run again
# (after the strategies improved): their earlier outputs must have been moved aside first, since --reuse keeps them.
held="$(cat eval-results/*-round-*/files.json 2>/dev/null)"
mode="${3:-new}"
(cd "$dataset/semantic" && find . -name '*.csv' | sed 's#^\./##' | sort) | while read -r file; do
  case "$held" in *"\"$file\""*) continue ;; esac
  if [ "$mode" = "open" ]; then
    [ -f "$dataset/syntactic/$file" ] || continue
    # (the files of the batch conversion: they have a folder here; the files written in full by rounds do not)
    name="$(echo "${file%.csv}" | tr '/' '_' | sed 's/_/__/')"
    [ -f "$out/$name/sample.json" ] || continue
  else
    [ -f "$dataset/syntactic/$file" ] && continue
  fi
  echo "$file"
done | xargs -P "$parallel" -I{} bash -c 'one "$@"' _ {} "$strategies" "$out"
echo "batch run finished"
