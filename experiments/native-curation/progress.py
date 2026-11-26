"""Count actual committed native readings, separately from draft and judgment throughput."""
import argparse
from collections import Counter
import json
from pathlib import Path
import subprocess

p=argparse.ArgumentParser()
p.add_argument('dataset',type=Path)
p.add_argument('inventory',type=Path)
args=p.parse_args()
def git(*cmd):return subprocess.check_output(['git','-C',args.dataset,*cmd])
revision=git('rev-parse','HEAD').decode().strip()
files=git('ls-tree','-r','--name-only',revision,'--','annotations/nlu/v1/batches').decode().splitlines()
counts=Counter()
for path in files:
    if not path.endswith('.jsonl'):continue
    for line in git('show',revision+':'+path).splitlines():
        record=json.loads(line)
        counts['publishedSources']+=1
        counts['publishedCircuits']+=len(record['readings'])
        counts['publishedWithTwo']+=len(record['readings'])==2
def add_stage(work,counts):
    summary=work/'summary.json'
    if not summary.is_file():return
    report=json.loads(summary.read_text())
    for batch in report['summaries']:
        counts['finishedCurationSources']+=batch['rows']
        counts['staticSuccess']+=batch['curated']
    accepted=work/'confirmation/curation-review-summary.json'
    if accepted.is_file():counts['independentlyAcceptedSources']+=json.loads(accepted.read_text())['acceptedSources']
for work in (args.inventory/'work').glob('[0-9]*'):add_stage(work,counts)
print(json.dumps(dict(datasetCommit=revision,**counts),indent=2))
