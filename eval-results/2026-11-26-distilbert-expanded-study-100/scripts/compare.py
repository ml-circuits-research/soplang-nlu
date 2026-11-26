"""Compare existing paired public study labels without changing judgments."""
import argparse
import collections
import gzip
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('expanded', type=Path)
parser.add_argument('archives', type=Path)
args = parser.parse_args()
folder = args.expanded
archives = args.archives

def read(path):
    with gzip.open(path, 'rt') as stream:
        return [json.loads(line) for line in stream if line.strip()]

locations = {
    'span2549': archives/'2026-11-26-distilbert-native-study-100',
    'ownership2549': archives/'2026-11-26-distilbert-ownership-study-100',
    'span7040': folder/'span',
    'ownership7040': folder/'ownership',
}
outcomes = {key: read(path/'outcomes.jsonl.gz') for key,path in locations.items()}
base = outcomes['span2549']
if any(len(rows)!=100 or any(
        any(a[field]!=b[field] for field in ('id','text','pretrained-direct','base-beam','selector'))
        for a,b in zip(base, rows)) for rows in outcomes.values()):
    raise ValueError('Literal source or capped baseline differs between study runs')

def passing(candidates):
    return any(c['accepted'] for c in candidates)

def has_complete(candidates):
    return any(c['eligible'] for c in candidates)

def accepted(rows, key, test=passing):
    return {row['id'] for row in rows if test(row[key][:2])}

def details(left, right):
    return {'both':len(left&right),'leftOnly':len(left-right),'rightOnly':len(right-left),
            'neither':100-len(left|right),'union':len(left|right),
            'leftOnlyIds':sorted(left-right),'rightOnlyIds':sorted(right-left)}

students={name:accepted(rows,'distilbert') for name,rows in outcomes.items()}
static={name:accepted(rows,'distilbert',has_complete) for name,rows in outcomes.items()}
selector=accepted(base,'selector')
providers=set.union(*(accepted(base,name) for name in ('pretrained-direct','base-beam','selector')))
figures={}
for name,location in locations.items():
    summary=json.loads((location/'training-summary.json').read_text())
    timing=json.loads((location/'pool.jsonl.gz.timing.json').read_text())
    rows=outcomes[name]
    grade=collections.Counter()
    for row in rows:
        proposal=row['distilbert']
        n=sum(c['accepted'] for c in proposal)
        grade['none' if n==0 else 'all' if n==len(proposal) else 'some']+=1
    figures[name]={'static':len(static[name]),'outcomes':dict(grade),
                   'accepted':len(students[name]),'training':{'rows':summary['trainRows'],
                       'selectedEpoch':summary['selectedEpoch'],'dev':summary['dev'],
                       'elapsedSeconds':summary['elapsedSeconds']},'cpuTiming':timing,
                   'isolation':{'vsSelector':details(students[name],selector),
                                'uniqueAcrossCappedProviders':sorted(students[name]-providers)}}

comparison={'rows':100,'figures':figures,
    'dataComparison':{arm:{'quality':details(students[arm+'2549'],students[arm+'7040']),
                           'static':details(static[arm+'2549'],static[arm+'7040'])}
                       for arm in ('span','ownership')},
    'expandedArchitectureComparison':{'quality':details(students['span7040'],students['ownership7040']),
                                      'static':details(static['span7040'],static['ownership7040'])},
    'combinedWithSelector':len(selector|students['span7040']|students['ownership7040']),
    'priorStudentAndSelectorUnion':len(selector|students['span2549']|students['ownership2549']),
    'unionAllStudentAndSelector':len(selector|set.union(*students.values()))}
print(json.dumps(comparison,indent=2,ensure_ascii=False))
