#!/bin/bash
# rvss: free running on the dev-B messages of at most 12 words (M2b/M2c stage one), for one model.
#   strategies/rvss/eval/measure-le12.sh <model name under .local-data/rvss/model/> [workers]
set -e
R=/home/salboaie/work/sopworlds/soplang-nlu; M=$R/.local-data/rvss/model; PY=/home/salboaie/nlp-venv/bin/python
name=$1; w=${2:-12}; out=$R/.local-data/rvss/runs/$name; mkdir -p $out
cd $R
PYTHONWARNINGS=ignore $PY strategies/rvss/model/decode.py $M/$name $M/dev-inputs-le12.jsonl $out/dev-le12-decoded.jsonl --workers $w | tee $out/dev-le12-decode.log
node strategies/rvss/model/io.mjs write $out/dev-le12-decoded.jsonl $out/dev-le12-outputs.jsonl | tee -a $out/dev-le12-decode.log
node strategies/rvss/eval/evaluate-dev.mjs $out/dev-le12-outputs.jsonl .local-data/rvss/distill.jsonl.gz --split dev-B --only-outputs --json $out/dev-le12-distill.json > $out/dev-le12-distill.md
grep -E '^\| all ' $out/dev-le12-distill.md | head -1
