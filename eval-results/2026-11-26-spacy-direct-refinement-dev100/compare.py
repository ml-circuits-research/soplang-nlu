import collections
import gzip
import json
from pathlib import Path
import sys

refined, archives = map(Path,sys.argv[1:])
def jsonl(path):
    with gzip.open(path,'rt') as archive:
        return [json.loads(line) for line in archive if line.strip()]
def judgments(folder):
    return {row['id']:row for row in jsonl(folder/'review/public-set-judgments.jsonl.gz')}
def raw(folder):
    graphs = json.loads(gzip.decompress((folder/'raw.json.gz').read_bytes()))['groups']
    reviewers = [{vote['key']:vote for vote in json.loads((folder/(model+'.json')).read_text())}
                 for model in ('gpt-6-sol','gpt-6.1-terra','gpt-6.2-sol')]
    result = {}
    for graph in graphs:
        key = graph['key']
        a,b = reviewers[0][key],reviewers[1][key]
        vote = a if a['usable']==b['usable'] else reviewers[2][key]
        for member in graph['memberships']:
            if member['engine']==0:
                result[member['id']]=(graph,vote)
    return result
def outcome(row):
    return row['outcome']!='none'
def fields(row):
    return {key:row[key] for key in ('outcome','grade','reason','candidates')}

baseline = archives/'2026-11-26-spacy-direct-dev100'
result={}
new_models={}
for model, raw_folder in [('compact','neural-dependency-dev100'),('transformer','transformer-dependency-dev100')]:
    old = judgments(baseline/model)
    new = judgments(refined/model)
    new_models[model]=new
    graphs = raw(archives/('2026-11-26-'+raw_folder))
    assert old.keys()==new.keys()==graphs.keys() and len(new)==100
    heatmap = {state:collections.Counter() for state in ('usable','rejected')}
    changed=[]
    for i,item in new.items():
        graph,raw_vote = graphs[i]
        assert item['text']==graph['text']==old[i]['text']
        status = ('accepted' if outcome(item) else 'reviewed reject' if any(c['reviewed'] for c in item['candidates'])
                  else 'incomplete' if item['publicCandidateSops'] else 'no candidate')
        heatmap['usable' if raw_vote['usable'] else 'rejected'][status]+=1
        if outcome(item)!=outcome(old[i]):
            changed.append({'id':i,'text':item['text'],'raw':raw_vote,'edges':graph['edges'],
                            'before':fields(old[i]),'after':fields(item)})
    result[model]={'outcomes':dict(collections.Counter(item['outcome'] for item in new.values())),
                   'sourceEligible':sum(any(c['reviewed'] for c in row['candidates']) for row in new.values()),
                   'countsByGrade':dict(sorted(collections.Counter(item['grade'] for item in new.values()).items())),
                   'gains':sum(outcome(row['after']) for row in changed),
                   'losses':sum(outcome(row['before']) for row in changed),
                   'graphToCircuit':heatmap,'changedRows':changed}
compact, trf = (new_models[model] for model in ('compact','transformer'))
result['pairedModels'] = {
    'both':sum(outcome(compact[i]) and outcome(trf[i]) for i in compact),
    'compactOnly':[i for i in compact if outcome(compact[i]) and not outcome(trf[i])],
    'transformerOnly':[i for i in compact if not outcome(compact[i]) and outcome(trf[i])],
    'neither':sum(not outcome(compact[i]) and not outcome(trf[i]) for i in compact),
}
hybrid_archive = archives/'2026-11-26-transformer-hybrids-dev100'
def accepted(rows):
    return {row['id'] for row in rows if outcome(row)}
hybrid_rows = jsonl(hybrid_archive/'review/public-set-judgments.jsonl.gz')
hybrids = {
    'compact':{
        'neuro-prolog':accepted(jsonl(hybrid_archive/'compact-refined/public-set-judgments.jsonl.gz')),
        'neuro-z3':accepted(row for row in jsonl(
            archives/'2026-11-26-neural-native-dev100/review/adjudicated/public-set-judgments.jsonl.gz')
            if row['engine']=='neuro-z3')},
    'transformer':{engine:accepted(row for row in hybrid_rows if row['engine']==engine)
                   for engine in ('neuro-prolog','neuro-z3')},
}
for model, engines in hybrids.items():
    direct = accepted(new_models[model].values())
    comparisons = {**engines,'either hybrid':set.union(*engines.values())}
    result[model]['versusArchivedHybrid'] = {
        name:{'both':len(direct&predictions),'directOnly':len(direct-predictions),
              'hybridOnly':len(predictions-direct),'union':len(direct|predictions)}
        for name,predictions in comparisons.items()}
print(json.dumps(result,ensure_ascii=False,indent=2))
