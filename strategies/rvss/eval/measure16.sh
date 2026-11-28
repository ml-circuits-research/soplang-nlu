#!/bin/bash
# rvss, sprint 4 (dataset 7e98ec6 and later): one model with beam 4 on dev-B, dev-G and the old benchmark; equality with
# spaCy's circuits and with the label targets (data/build-labels.mjs) on the texts still in the dataset, and judged
# acceptance (eval/accepted.mjs: dev-B, the 1,000 fully judged dev-G messages of the head-to-head, the old benchmark).
#   strategies/rvss/eval/measure16.sh <model name> [workers, default 4] [run name, default <model>-b4]
set -e
R=/home/salboaie/work/sopworlds/soplang-nlu; M=$R/.local-data/rvss/model; E=$R/.local-data/rvss/eval16; PY=/home/salboaie/nlp-venv/bin/python
name=$1; w=${2:-4}; out=$R/.local-data/rvss/runs/${3:-$name-b4}; mkdir -p $out; H=$R/eval-results/2026-11-28-h2h-general
cd $R
for s in dev devG bench; do
  [ -s $out/$s-outputs.jsonl ] && continue
  PYTHONWARNINGS=ignore CUDA_VISIBLE_DEVICES= $PY strategies/rvss/model/decode.py $M/$name $M/$s-inputs.jsonl $out/$s-decoded.jsonl --workers $w --beam 4 > $out/$s-decode.log
  node strategies/rvss/model/io.mjs write $out/$s-decoded.jsonl $out/$s-outputs.jsonl >> $out/$s-decode.log
done
for t in devB16-spacy devB16-labels; do node strategies/rvss/eval/evaluate-dev.mjs $out/dev-outputs.jsonl $E/$t.jsonl.gz --json $out/$t.json > $out/$t.md 2>/dev/null; done
node strategies/rvss/eval/evaluate-dev.mjs $out/devG-outputs.jsonl $E/devG16-spacy.jsonl.gz --json $out/devG16-spacy.json > $out/devG16-spacy.md 2>/dev/null
node strategies/rvss/eval/evaluate-benchmark.mjs $out/bench-outputs.jsonl --name rvss-$name --out-dir $out/benchmark > $out/benchmark.md
node --max-old-space-size=16000 strategies/rvss/eval/accepted.mjs $out/devG-outputs.jsonl --texts $H/sample.json.gz > $out/accepted.txt
node --max-old-space-size=16000 strategies/rvss/eval/accepted.mjs $out/dev-outputs.jsonl --texts $E/devB16-spacy.jsonl.gz >> $out/accepted.txt
node --max-old-space-size=16000 strategies/rvss/eval/accepted.mjs $out/bench-outputs.jsonl >> $out/accepted.txt
cat $out/accepted.txt | cut -c1-300
