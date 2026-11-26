"""Compare exact source-matched public set decisions for the historical 250."""
from collections import Counter
from pathlib import Path
import gzip
import json
import sys

current, pilot, prolog, output = map(Path, sys.argv[1:])

def jsonl(path):
    with gzip.open(path,'rt') as stream:
        return [json.loads(line) for line in stream]

def index(rows, key='id'):
    rows = list(rows)
    indexed = {row[key]:row for row in rows}
    assert len(indexed) == len(rows)
    return indexed

def counts(rows):
    counter = Counter(r['outcome'] for r in rows.values())
    return {'none':counter['none'],'some':counter['some'],'all':counter['all'],
            'any':counter['some']+counter['all']}

def overlap(left,right,predicate):
    assert set(left) == set(right)
    pairs = [(predicate(left[key]),predicate(right[key])) for key in left]
    return {'both':pairs.count((True,True)), 'leftOnly':pairs.count((True,False)),
            'rightOnly':pairs.count((False,True)), 'neither':pairs.count((False,False))}

def pair(left,right):
    return {'any':overlap(left,right,lambda row:row['outcome']!='none'),
            'all':overlap(left,right,lambda row:row['outcome']=='all'),
            'transitions':{before:{after:sum(left[k]['outcome']==before and right[k]['outcome']==after for k in left)
                                  for after in ('none','some','all')} for before in ('none','some','all')}}

records = jsonl(current/'review/public-set-judgments.jsonl.gz')
direct = index(r for r in records if r['engine']=='spacy-direct')
beam = index(r for r in records if r['engine']=='spacy-beam')
with gzip.open(pilot/'paired-cases.json.gz','rt') as stream:
    old = index(json.load(stream))
neu = index(jsonl(prolog/'review/public-set-judgments.jsonl.gz'))
assert set(direct)==set(beam)==set(old)==set(neu) and len(direct)==250
old_direct = {k:{'outcome':r['greedy']} for k,r in old.items()}
old_beam = {k:{'outcome':r['beam']} for k,r in old.items()}
evidence = index(jsonl(current/'inference/model-evidence.jsonl.gz'))
prolog_evidence = index(jsonl(prolog/'inference/model-evidence.jsonl.gz'))
assert set(evidence)==set(prolog_evidence)==set(direct)
for k in direct:
    assert direct[k]['text']==beam[k]['text']==old[k]['text']==neu[k]['text']
    assert evidence[k]['sourceSha256']==prolog_evidence[k]['sourceSha256']
    assert evidence[k]['greedyGraphSha256']==prolog_evidence[k]['graphSha256']

projection = {name:index(jsonl(current/f'inference/spacy-{name}.jsonl.gz')) for name in ('direct','beam')}
def source_complete(check):
    gaps = check['sourceGaps']
    return check['valid'] and not gaps['materialUnresolved'] and not gaps['materialUncovered']
for k in direct:
    greedy = projection['direct'][k]
    selected = projection['beam'][k]
    if greedy['checks'] and source_complete(greedy['checks'][0]):
        assert selected['candidates'][0] == greedy['candidates'][0]
    if any(source_complete(check) for check in selected['checks']):
        assert all(source_complete(check) for check in selected['checks'])
    else:
        assert selected['candidates'] == greedy['candidates']
    assert len(selected['candidates']) <= 3
    assert len(set(selected['candidates'])) == len(selected['candidates'])

failures = {}
for name,rows in [('direct',direct),('beam',beam),('prolog',neu)]:
    failures[name] = dict(sorted(Counter(r['grade'] for r in rows.values() if r['outcome']=='none').items()))
summary = {
  'texts':len(direct),
  'greedyGraphMatchesWithProlog':len(evidence),
  'outcomes':{name:counts(rows) for name,rows in [('oldDirect',old_direct),('oldBeam',old_beam),
    ('updatedDirect',direct),('updatedBeam',beam),('fixedNeuroProlog',neu)]},
  'comparison':{
    'oldVsUpdatedDirect':pair(old_direct,direct),
    'oldVsUpdatedBeam':pair(old_beam,beam),
    'updatedDirectVsBeam':pair(direct,beam),
    'updatedDirectVsNeuroProlog':pair(direct,neu),
    'updatedBeamVsNeuroProlog':pair(beam,neu),
  },
  'failedRowsByGrade':failures
}
rows = [dict(id=k,text=direct[k]['text'],archivedDirect=old[k]['greedy'],archivedBeam=old[k]['beam'],
             updatedDirect=direct[k],updatedBeam=beam[k],fixedNeuroProlog=neu[k]) for k in direct]
output.mkdir(parents=True,exist_ok=True)
(output/'comparison.json').write_text(json.dumps(summary,indent=2)+'\n')
(output/'paired-cases.json.gz').write_bytes(gzip.compress(json.dumps(rows,ensure_ascii=False).encode(),mtime=0))
print(json.dumps(summary,indent=2))
