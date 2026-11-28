#!/bin/bash
# rvss: free running on dev-B and on the benchmark for one model, then the harness.
#   strategies/rvss/eval/measure.sh <model name under .local-data/rvss/model/> [workers]
set -e
R=/home/salboaie/work/sopworlds/soplang-nlu; M=$R/.local-data/rvss/model; PY=/home/salboaie/nlp-venv/bin/python
name=$1; w=${2:-16}; out=$R/.local-data/rvss/runs/$name; mkdir -p $out
cd $R
$PY strategies/rvss/model/decode.py $M/$name $M/dev-inputs.jsonl $out/dev-decoded.jsonl --workers $w | tee $out/dev-decode.log
node strategies/rvss/model/io.mjs write $out/dev-decoded.jsonl $out/dev-outputs.jsonl | tee -a $out/dev-decode.log
node strategies/rvss/eval/evaluate-dev.mjs $out/dev-outputs.jsonl .local-data/rvss/distill.jsonl.gz --split dev-B --json $out/dev-distill.json > $out/dev-distill.md
node strategies/rvss/eval/evaluate-dev.mjs $out/dev-outputs.jsonl .local-data/rvss/mixed.jsonl.gz --split dev-B --json $out/dev-mixed.json > $out/dev-mixed.md
$PY strategies/rvss/model/decode.py $M/$name $M/bench-inputs.jsonl $out/bench-decoded.jsonl --workers $w | tee $out/bench-decode.log
node strategies/rvss/model/io.mjs write $out/bench-decoded.jsonl $out/bench-outputs.jsonl | tee -a $out/bench-decode.log
node strategies/rvss/eval/evaluate-benchmark.mjs $out/bench-outputs.jsonl --name rvss-$name --out-dir $out/benchmark > $out/benchmark.md
head -8 $out/dev-distill.md | tail -3; sed -n 1,30p $out/benchmark.md
