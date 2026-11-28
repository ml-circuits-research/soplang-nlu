#!/bin/sh
# node build -> realize -> pick for one split: ./run-conv.sh gold-dev
F=$(dirname $0); cd $F
node build.mjs data/$1.jsonl parses/base-$1.jsonl conv/cand-$1.jsonl > conv/losses-$1.json && cat conv/losses-$1.json | tr -d '\n' ; echo
./python realize.py $HOME/models/sop-nlu-trf/venv/lib/python3.12/site-packages/en_core_web_trf/en_core_web_trf-3.8.0 conv/cand-$1.jsonl conv/real-$1.jsonl 2>&1 | grep -iv warn | tail -3
node pick.mjs data/$1.jsonl conv/real-$1.jsonl conv/trees-$1.jsonl --report conv/fail-$1.jsonl $2
