import collections
import gzip
import json
from pathlib import Path
import sys

current, hybrid, dependency, *comparators = map(Path,sys.argv[1:])
def jsonl(path):
    with gzip.open(path,'rt') as archive:
        return [json.loads(line) for line in archive if line.strip()]
def result_map(path):
    return {(row['id'],row['engine']):row for row in jsonl(path)}
direct = {i:row for (i,_),row in result_map(current/'review/public-set-judgments.jsonl.gz').items()}
hybrids = result_map(hybrid/'review/adjudicated/public-set-judgments.jsonl.gz')
graphs = json.loads(gzip.decompress((dependency/'raw.json.gz').read_bytes()))['groups']
voters=[{vote['key']:vote for vote in json.loads((dependency/(model+'.json')).read_text())}
        for model in ('gpt-6-sol','gpt-6.1-terra','gpt-6.2-sol')]
raw = {}
for graph in graphs:
    key = graph['key']
    first, second = (voters[0][key],voters[1][key])
    final = first if first['usable']==second['usable'] else voters[2][key]
    for member in graph['memberships']:
        if member['engine']==0:
            raw[member['id']]=(graph,final)
assert len(direct)==len(raw)==100 and len(hybrids)==200 and set(direct)==set(raw)

def any_success(row):
    return row['outcome']!='none'

by_engine={}
comparisons = {name:{i:(any(any_success(hybrids[i,e]) for e in ['neuro-prolog','neuro-z3'])
                     if name=='either hybrid' else any_success(hybrids[i,name])) for i in direct}
               for name in ['neuro-prolog','neuro-z3','either hybrid']}
for comparator in comparators:
    paired = {i:any_success(row) for (i,_),row in result_map(comparator/'review/public-set-judgments.jsonl.gz').items()}
    assert paired.keys()==direct.keys()
    comparisons[comparator.name]=paired
for name, flags in comparisons.items():
    by_engine[name]={
        'both': sum(flags[i] and any_success(row) for i,row in direct.items()),
        'added': [i for i,row in direct.items() if not flags[i] and any_success(row)],
        'lost': [i for i,row in direct.items() if flags[i] and not any_success(row)],
        'neither': sum(not flags[i] and not any_success(row) for i,row in direct.items()),
    }

heatmap = {label:collections.Counter() for label in ('usable','rejected')}
examples = []
for i,row in direct.items():
    graph, raw_review = raw[i]
    assert graph['text']==row['text']
    graph_type = 'usable' if raw_review['usable'] else 'rejected'
    projection = ('accepted' if any_success(row) else 'reviewed rejection' if any(c['reviewed'] for c in row['candidates']) else
                  'incomplete' if row['publicCandidateSops'] else 'no public circuit')
    heatmap[graph_type][projection]+=1
    if (graph_type=='usable')!=(projection=='accepted'):
        examples.append({'id':i,'text':row['text'],'raw':raw_review,'edges':graph['edges'],
                         'projection':projection,'candidates':row['candidates']})
summary = {'outcomes':dict(collections.Counter(r['outcome'] for r in direct.values())),
           'paired':by_engine,'graphs':heatmap,'mismatches':examples}
print(json.dumps(summary,ensure_ascii=False,indent=2))
