#!/bin/bash
# rvss DESIGN 10: the beam scored by fit, tried on training messages (every 80th, train-inputs-s80.jsonl) to choose its
# settings before dev-B is read. CPU only, 4 processes.
#   strategies/rvss/eval/beam-tune.sh <model name> <tag> [decode.py arguments, e.g. --beam 4 --fit 0.5 --sync]
set -e
R=/home/salboaie/work/sopworlds/soplang-nlu; M=$R/.local-data/rvss/model; PY=/home/salboaie/nlp-venv/bin/python
name=$1; tag=$2; shift 2; out=$R/.local-data/rvss/runs/beam-tune; mkdir -p $out
cd $R
CUDA_VISIBLE_DEVICES= $PY strategies/rvss/model/decode.py $M/$name $M/train-inputs-s80.jsonl $out/$name-$tag-decoded.jsonl --workers 4 "$@" > $out/$name-$tag.log
node strategies/rvss/model/io.mjs write $out/$name-$tag-decoded.jsonl $out/$name-$tag-outputs.jsonl >> $out/$name-$tag.log
node strategies/rvss/eval/evaluate-dev.mjs $out/$name-$tag-outputs.jsonl .local-data/rvss/distill.jsonl.gz --only-outputs --json $out/$name-$tag.json > $out/$name-$tag.md
echo "$name $tag $* $(grep -E '^\| all ' $out/$name-$tag.md | head -1 | cut -d'|' -f6,7,9) $(grep -o 'median ms [0-9.]*' $out/$name-$tag.log)"
