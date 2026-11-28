#!/bin/bash
# rvss: free running on a fresh file-level sample (eval/fresh-sample.mjs prepare made <folder>/inputs.jsonl and
# targets.jsonl.gz), equality with spaCy by split, and the circuits no judge has decided yet. CPU only.
#   strategies/rvss/eval/measure-fresh.sh <model name under .local-data/rvss/model/> <folder> [workers, default 4]
set -e
R=/home/salboaie/work/sopworlds/soplang-nlu; M=$R/.local-data/rvss/model; PY=/home/salboaie/nlp-venv/bin/python
name=$1; F=$2; w=${3:-4}
cd $R
PYTHONWARNINGS=ignore CUDA_VISIBLE_DEVICES= $PY strategies/rvss/model/decode.py $M/$name $F/inputs.jsonl $F/$name-decoded.jsonl --workers $w | tee $F/$name-decode.log
node strategies/rvss/model/io.mjs write $F/$name-decoded.jsonl $F/$name-outputs.jsonl | tee -a $F/$name-decode.log
node strategies/rvss/eval/evaluate-dev.mjs $F/$name-outputs.jsonl $F/targets.jsonl.gz --json $F/$name-eval.json > $F/$name-eval.md
node strategies/rvss/eval/fresh-sample.mjs unjudged $F/$name-outputs.jsonl $F/targets.jsonl.gz $F/$name-unjudged.jsonl | tee $F/$name-unjudged.log
grep -A6 'By split' $F/$name-eval.md | grep -E '^\| (train|dev-B|excluded|new) '; grep -E '^\| all ' $F/$name-eval.md | head -1
