"""Pair frozen standalone mapper outputs and evidence by diagnostic source ID."""
import argparse
import collections
import gzip
import json
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('artifacts',type=Path)
args=parser.parse_args()
root=args.artifacts
def rows(path):
    with gzip.open(path,'rt') as stream:
        records=[json.loads(line) for line in stream if line.strip()]
    indexed={row['id']:row for row in records}
    if len(indexed)!=len(records):
        raise ValueError('Duplicate source ID for '+str(path))
    return indexed
def read(path):
    return json.loads(path.read_text())
models=('baseline','adapted')
graphs={m:rows(root/m/'inference/model-evidence.jsonl.gz') for m in models}
predictions={m:rows(root/m/'inference/spacy-direct.jsonl.gz') for m in models}
for m in models:
    if graphs[m].keys()!=graphs['baseline'].keys() or predictions[m].keys()!=graphs[m].keys() or len(graphs[m])!=250:
        raise ValueError('Diagnostic cohort mismatch')
for row_id in graphs['baseline']:
    if graphs['baseline'][row_id]['sourceSha256']!=graphs['adapted'][row_id]['sourceSha256']:
        raise ValueError('Diagnostic text mismatch for '+row_id)
def classify(pair):
    return {(True,True):'both',(False,True):'gain',(True,False):'loss',(False,False):'neither'}[pair]
def summarize_paired(previous,current):
    cells={key:[] for key in ('both','gain','loss','neither')}
    for i in previous:
        cells[classify((previous[i],current[i]))].append(i)
    return {'counts':{key:len(ids) for key,ids in cells.items()},
            'gainIds':cells['gain'],'lossIds':cells['loss']}
def complete(row):
    return any(check['valid'] and check['coverage']['allAccountedFor'] and
               check['sourceGaps']['materialUnresolved']==0 and check['sourceGaps']['materialUncovered']==0
               for check in row['checks'])

eligible={m:{i:complete(row) for i,row in predictions[m].items()} for m in models}
result={'cohort':250,'projectorRevision':read(root/'adapted/inference/environment.json')['libraryRevision'],
        'graphChanged':sum(graphs['baseline'][i]['graphSha256']!=graphs['adapted'][i]['graphSha256']
                           for i in graphs['baseline']),
        'publicSetChanged':sum(predictions['baseline'][i]['candidates']!=predictions['adapted'][i]['candidates']
                              for i in predictions['baseline']),
        'static':{m:sum(eligible[m].values()) for m in models},
        'staticPaired':summarize_paired(*eligible.values()),'timings':{}}
for m in models:
    env=read(root/m/'inference/environment.json')
    result['timings'][m]=read(root/m/'inference/spacy-direct.json')|{'modelStartupMs':env['modelStartupMs']}
if (root/'adapted/review/public-set-judgments.jsonl.gz').exists():
    judgments={m:rows(root/m/'review/public-set-judgments.jsonl.gz') for m in models}
    if any(judgments[m].keys()!=predictions[m].keys() for m in models):
        raise ValueError('Judged and measured inputs differ')
    any_pass={m:{i:row['outcome']!='none' for i,row in judgments[m].items()} for m in models}
    result['quality']={m:{'outcomes':dict(collections.Counter(row['outcome'] for row in judgments[m].values())),
                           'grades':dict(collections.Counter('L'+str(row['grade']) for row in judgments[m].values()))}
                       for m in models}
    result['qualityPaired']=summarize_paired(*any_pass.values())
    result['semanticChanges']=[{'id':i,'before':judgments['baseline'][i],'after':judgments['adapted'][i]}
                               for i in any_pass['baseline'] if any_pass['baseline'][i]!=any_pass['adapted'][i]]
print(json.dumps(result,ensure_ascii=False,indent=2))
