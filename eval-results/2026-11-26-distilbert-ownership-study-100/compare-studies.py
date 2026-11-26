import collections
import gzip
import json
from pathlib import Path
import sys

v1,v2=map(Path,sys.argv[1:])
def rows(folder,name):
    with gzip.open(folder/name,'rt') as stream:
        return [json.loads(line) for line in stream if line.strip()]
def passing(candidates):
    return any(candidate['accepted'] for candidate in candidates)
def complete(candidates):
    return any(candidate['eligible'] for candidate in candidates)
previous = rows(v1,'outcomes.jsonl.gz')
current = rows(v2,'outcomes.jsonl.gz')
if len(previous)!=100 or len(current)!=100:
    raise ValueError('Expected 100 labeled inputs per checkpoint')
if any(any(a[field]!=b[field] for field in ('id','text','selector','base-beam','pretrained-direct'))
       for a,b in zip(previous,current)):
    raise ValueError('Frozen study sources or baselines differ')
def paired(fn):
    pairs=collections.defaultdict(list)
    names = {(True,True):'both',(True,False):'v1Only',(False,True):'v2Only',(False,False):'neither'}
    for a,b in zip(previous,current):
        pairs[names[fn(a['distilbert']),fn(b['distilbert'])]].append(a['id'])
    return {key:{'count':len(ids),'ids':ids} for key,ids in pairs.items()}
def finding_counts(folder):
    findings=collections.Counter()
    for row in rows(folder,'trace.jsonl.gz'):
        for rejected in row['rejected']:
            findings.update(entry['code'] for entry in rejected['check']['findings'])
    return dict(findings)
gain=[]
for row in current:
    if passing(row['distilbert']) and not passing(row['selector'][:2]):
        gain.append(dict(id=row['id'],text=row['text'],
                         acceptedCircuits=[c['sop'] for c in row['distilbert'] if c['accepted']]))
summary={'rows':100,'v1ToV2Accepted':paired(passing),'v1ToV2Complete':paired(complete),
         'v2UniqueVersusCappedSelector':gain,
         'schemaFindings':{'v1':finding_counts(v1),'v2':finding_counts(v2)}}
print(json.dumps(summary,ensure_ascii=False,indent=2))
