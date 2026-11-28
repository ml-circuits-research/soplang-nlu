#!/bin/sh
# One step of a round: the circuits of the eight sets with the writer as it stands, compared with an earlier step.
#   tests/benchmark/syntax/spacy-rounds/step.sh <scratch dir> <earlier step> <this step> [code tree]
# The scratch dir holds cache/ (node audit.mjs cache <scratch dir>/cache) and <set>-<step>.jsonl; the comparisons go
# to diff-<set>-<step>.txt. A first step written from another commit: give its tree (git archive) as the code tree.
S=$1 A="env -u SOP_KNOWLEDGE_DIR node $(dirname "$0")/audit.mjs"
CODE=${4:+--code $4}
# (three writers at a time: no more than four processes run at once)
for s in audit fresh freshb; do $A write $S/cache $s $S/$s-$3.jsonl $CODE > /dev/null & done; wait
for s in freshc freshd bench; do $A write $S/cache $s $S/$s-$3.jsonl $CODE > /dev/null & done; wait
for s in wide vibe; do $A write $S/cache $s $S/$s-$3.jsonl $CODE > /dev/null & done; wait
[ -n "$2" ] && for s in audit fresh freshb freshc freshd bench wide vibe; do $A changed $S/cache $s $S/$s-$2.jsonl $S/$s-$3.jsonl > $S/diff-$s-$3.txt; echo "$s: $(tail -1 $S/diff-$s-$3.txt)"; done
