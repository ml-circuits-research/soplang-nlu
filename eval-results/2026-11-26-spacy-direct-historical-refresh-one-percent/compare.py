import collections
import gzip
import json
from pathlib import Path
import sys

root, dev_run, historical_source, previous = map(Path,sys.argv[1:])
def archive(path):
    return json.loads(gzip.decompress(path.read_bytes()))
def jsonl(path):
    with gzip.open(path,'rt') as lines:
        return [json.loads(line) for line in lines if line.strip()]
def cohort(path):
    rows=archive(path)
    return {r['id']:r['text'] for r in rows}
def judgments(path):
    rows = jsonl(path)
    result = {r['id']:r for r in rows}
    if len(result)!=len(rows):
        raise ValueError('Repeated row in '+str(path))
    return result

source=cohort(root/'transformer/inference/sample.json.gz')
if source!=cohort(root/'compact/inference/sample.json.gz') or source!=cohort(historical_source):
    raise ValueError('Historical and scored inputs do not match')
development=cohort(dev_run/'inference/sample.json.gz')
overlap={i for i,s in development.items() if source.get(i)==s}
rest=set(source)-overlap
if len(source)!=1861 or len(overlap)!=100:
    raise ValueError('Unexpected historical cohort or development overlap')
folders={'compact':root/'compact','transformer':root/'transformer'}
rows={model:judgments(folder/'review/public-set-judgments.jsonl.gz') for model,folder in folders.items()}
for model,result in rows.items():
    if result.keys()!=source.keys() or not all(row['text']==source[i] for i,row in result.items()):
        raise ValueError('Prediction source does not match '+model)

def passes(row):
    return row['outcome']!='none'
def counts(ids, result):
    outcomes=collections.Counter(result[i]['outcome'] for i in ids)
    levels=collections.Counter(str(result[i]['grade']) for i in ids)
    return {'outcomes':outcomes,'levels':levels,'any':outcomes['some']+outcomes['all'],
            'eligible':sum(any(candidate['reviewed'] for candidate in result[i]['candidates']) for i in ids),
            'errors':sum(bool(result[i]['readerError']) for i in ids)}
def paired(ids):
    a,b=rows['compact'],rows['transformer']
    return {'both':sum(passes(a[i]) and passes(b[i]) for i in ids),
            'compactOnly':sum(passes(a[i]) and not passes(b[i]) for i in ids),
            'transformerOnly':sum(not passes(a[i]) and passes(b[i]) for i in ids),
            'neither':sum(not passes(a[i]) and not passes(b[i]) for i in ids)}
result={'historicalRows':len(source),'historicalUniqueText':len(set(source.values())),
        'knownDevOverlap':len(overlap),'knownDevOverlapIds':sorted(overlap),'views':{}}
for name, ids in [('full',set(source)),('withoutKnownDevelopmentIds',rest),('knownDevelopmentIds',overlap)]:
    result['views'][name]={'rows':len(ids),'models':{model:counts(ids,judgment) for model,judgment in rows.items()},
                           'pairedAny':paired(ids)}
for model, folder in folders.items():
    timing=json.loads((folder/'inference/spacy-direct.json').read_text())
    env=json.loads((folder/'inference/environment.json').read_text())
    result[model+'Timing']={'modelStartupMs':env['modelStartupMs'],'pipelineStartupMs':timing['startupMs'],
                            'modelOnly':env['modelInference'],'mapping':timing['mapping'],
                            'modelAndMapping':timing['modelAndMapping'],'errors':timing['errors']}
result['changesFromPrevious']={}
for model, path in [('compact','compact/review'),('transformer','review')]:
    old=judgments(previous/path/'public-set-judgments.jsonl.gz')
    new=rows[model]
    if old.keys()!=new.keys():
        raise ValueError('Earlier historical scores do not match this cohort')
    result['changesFromPrevious'][model]={
        'gainedIds':sorted(i for i in source if not passes(old[i]) and passes(new[i])),
        'lostIds':sorted(i for i in source if passes(old[i]) and not passes(new[i])),
        'old':counts(source,old), 'new':counts(source,new),
    }
print(json.dumps(result,indent=2,sort_keys=True))
