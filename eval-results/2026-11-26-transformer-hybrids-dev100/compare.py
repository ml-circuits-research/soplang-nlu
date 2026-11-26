from collections import Counter
import gzip
import json
from pathlib import Path
import sys

root, archives = map(Path,sys.argv[1:])
def load(path):
    return {r['id']:r for r in jsonl(path)}
def jsonl(path):
    with gzip.open(path,'rt') as contents:
        return [json.loads(line) for line in contents if line.strip()]
def summary(rows):
    return Counter(row['outcome'] for row in rows.values())
def accepts(row):
    return row['outcome']!='none'
def paired(prior,new):
    assert prior.keys()==new.keys()
    cells = {'both':[],'gains':[],'losses':[],'neither':[]}
    for i in prior:
        outcome = (accepts(prior[i]),accepts(new[i]))
        cells[{(True,True):'both',(False,True):'gains',(True,False):'losses',(False,False):'neither'}[outcome]].append(i)
    return {**{name:len(ids) for name,ids in cells.items()},'gainedIds':cells['gains'],'lostIds':cells['losses']}
def grouped(path):
    rows = jsonl(path)
    return {engine:{r['id']:r for r in rows if r['engine']==engine}
            for engine in dict.fromkeys(r['engine'] for r in rows)}
trf = grouped(root/'review/public-set-judgments.jsonl.gz')
compact = grouped(archives/'2026-11-26-neural-native-dev100/review/adjudicated/public-set-judgments.jsonl.gz')
compact['neuro-prolog'] = load(root/'compact-refined/public-set-judgments.jsonl.gz')
direct = {model:load(archives/f'2026-11-26-spacy-direct-dev100/{model}/review/public-set-judgments.jsonl.gz')
          for model in ('compact','transformer')}
def union(*samples):
    ids = set(samples[0])
    assert all(set(rows)==ids for rows in samples) and len(ids)==100
    return {i:{'outcome':'some' if any(accepts(rows[i]) for rows in samples) else 'none'} for i in sorted(ids)}
raw = archives/'2026-11-26-transformer-dependency-dev100'
graphs = json.loads(gzip.decompress((raw/'raw.json.gz').read_bytes()))['groups']
votes = [{v['key']:v for v in json.loads((raw/(model+'.json')).read_text())}
         for model in ('gpt-6-sol','gpt-6.1-terra','gpt-6.2-sol')]
usable = {}
for graph in graphs:
    key = graph['key']
    a,b = votes[0][key],votes[1][key]
    verdict = a if a['usable']==b['usable'] else votes[2][key]
    for member in graph['memberships']:
        usable[member['id']]=verdict['usable']
def graph_heatmap(rows):
    heatmap={str(label).lower():Counter() for label in (True,False)}
    for i,row in rows.items():
        state = ('accepted' if accepts(row) else 'reviewed reject' if any(c['reviewed'] for c in row['candidates'])
                 else 'incomplete' if row['publicCandidateSops'] else 'no public candidate')
        heatmap[str(usable[i]).lower()][state]+=1
    return heatmap
compact_hybrid=union(*compact.values())
trf_hybrid=union(*trf.values())
comparison={
    'compact':{engine:summary(rows) for engine,rows in compact.items()},
    'transformer':{engine:summary(rows) for engine,rows in trf.items()},
    'withinMapper':{engine:paired(compact[engine],trf[engine]) for engine in compact},
    'rawTransformerHealth':{engine:graph_heatmap(rows) for engine,rows in trf.items()},
    'versusDirect':{engine:paired(direct['transformer'],rows) for engine,rows in trf.items()},
    'unions':{'compactHybrid':summary(compact_hybrid),'transformerHybrid':summary(trf_hybrid),
              'allCompact':summary(union(compact_hybrid,direct['compact'])),
              'allTransformer':summary(union(trf_hybrid,direct['transformer'])),
              'compactToTransformerHybrid':paired(compact_hybrid,trf_hybrid),
              'allSix':summary(union(compact_hybrid,trf_hybrid,*direct.values()))},
}
print(json.dumps(comparison,indent=2))
