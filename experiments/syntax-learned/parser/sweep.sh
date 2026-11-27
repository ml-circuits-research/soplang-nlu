#!/bin/bash
# train and evaluate one configuration: name, then train.mjs arguments
name=$1; shift
cd /tmp/claude-1000/-home-salboaie-work-sopworlds/e235462f-8553-42ea-b357-85307b023a32/scratchpad/learned/parser
{ time node --max-old-space-size=32000 train.mjs --data data2.json.gz --out model-$name.json.gz "$@" ; } > train-$name.log 2>&1
node --max-old-space-size=32000 evaluate.mjs model-$name.json.gz --data data2.json.gz --tag $name > eval-$name.log 2>&1
echo done $name
