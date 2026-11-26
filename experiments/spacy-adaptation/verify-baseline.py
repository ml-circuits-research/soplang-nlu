"""Verify the live diagnostic baseline exactly matches archived same-code judgments."""
import argparse
import gzip
import json
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('artifact_root',type=Path)
parser.add_argument('old_compact_run',type=Path)
args=parser.parse_args()
def rows(path):
    with gzip.open(path,'rt') as stream:
        return {row['id']:row for row in map(json.loads,stream)}

local=rows(args.artifact_root/'baseline/inference/spacy-direct.jsonl.gz')
old=rows(args.old_compact_run/'inference/spacy-direct.jsonl.gz')
local_graph=rows(args.artifact_root/'baseline/inference/model-evidence.jsonl.gz')
old_graph=rows(args.old_compact_run/'inference/model-evidence.jsonl.gz')
scores=rows(args.old_compact_run/'review/public-set-judgments.jsonl.gz')
assert len(local)==250 and len(local_graph)==250
for i in local:
    assert local[i]['candidates']==old[i]['candidates']==scores[i]['publicCandidateSops'],i
    assert local[i]['checks']==old[i]['checks'],i
    assert all(local_graph[i][key]==old_graph[i][key] for key in ('sourceSha256','graphSha256')),i
selected=[scores[i] for i in local]
review=args.artifact_root/'baseline/review'
review.mkdir()
(review/'public-set-judgments.jsonl.gz').write_bytes(
    gzip.compress(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in selected).encode(),mtime=0))
print('Verified all 250 exact baseline graphs, candidate sets and source checks against the prior blind assessment')
