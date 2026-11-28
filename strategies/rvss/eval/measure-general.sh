#!/bin/bash
# rvss: free running on the held-out general files (dev-G: whole files of syntactic/general, data/add-general.mjs),
# equality with spaCy by length and by corpus. CPU only.
#   strategies/rvss/eval/measure-general.sh <model name under .local-data/rvss/model/> [workers, default 4] [run name]
#   RVSS_DECODE_ARGS: more arguments for decode.py (e.g. "--beam 4"); without --beam the model's reading.json decides
set -e
R=/home/salboaie/work/sopworlds/soplang-nlu; M=$R/.local-data/rvss/model; PY=/home/salboaie/nlp-venv/bin/python
name=$1; w=${2:-4}; out=$R/.local-data/rvss/runs/${3:-$name}; mkdir -p $out
cd $R
[ -s $M/devG-inputs.jsonl ] || node strategies/rvss/model/io.mjs inputs-split .local-data/rvss/distill.jsonl.gz dev-G $M/devG-inputs.jsonl
PYTHONWARNINGS=ignore CUDA_VISIBLE_DEVICES= $PY strategies/rvss/model/decode.py $M/$name $M/devG-inputs.jsonl $out/devG-decoded.jsonl --workers $w $RVSS_DECODE_ARGS | tee $out/devG-decode.log
node strategies/rvss/model/io.mjs write $out/devG-decoded.jsonl $out/devG-outputs.jsonl | tee -a $out/devG-decode.log
node strategies/rvss/eval/evaluate-dev.mjs $out/devG-outputs.jsonl .local-data/rvss/distill.jsonl.gz --split dev-G --json $out/devG-distill.json > $out/devG-distill.md
head -8 $out/devG-distill.md | tail -3; grep -A8 'By length' $out/devG-distill.md
