"""Summarize accepted availability in the sealed, unranked training/diagnostic pools."""
import argparse
import collections
import gzip
import json
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('base',type=Path)
args=parser.parse_args()
def rows(path):
    with gzip.open(path,'rt') as stream:
        return [json.loads(line) for line in stream if line.strip()]
def metrics(pool,votes):
    masks=collections.Counter()
    families=collections.defaultdict(lambda:collections.Counter())
    eligible_pairs=set()
    for row in pool:
        row_families=collections.defaultdict(lambda:[0,0,0])
        for candidate in row['candidates']:
            eligible=candidate['eligible']
            key=(row['id'],candidate['sop'])
            if eligible:
                eligible_pairs.add(key)
            grade=eligible and votes[key]
            tally=row_families[candidate['family']]
            tally[0]+=1
            tally[1]+=eligible
            tally[2]+=grade
        passes=tuple(sorted(family for family,(_,_,accepted) in row_families.items() if accepted))
        masks[passes]+=1
        for family,(public,eligible,accepted) in row_families.items():
            stat=families[family]
            stat['public']+=public
            stat['eligible']+=eligible
            stat['acceptedObservations']+=accepted
            stat['rowsWithAccepted']+=bool(accepted)
            stat['exclusiveAcceptedRows']+=passes==(family,)
    return {'rows':len(pool),'eligibleDistinctPairs':len(eligible_pairs),
            'acceptedPoolRows':len(pool)-masks.get((),0),'families':families,
            'availabilityMasks':[(list(k),n) for k,n in sorted(masks.items())]}
summary={}
for name in ('train','diagnostic'):
    folder=args.base/name
    pool=rows(folder/'pool.jsonl.gz')
    vote_rows=rows(folder/'votes.jsonl.gz')
    votes={(row['id'],row['sop']):row['accepted'] for row in vote_rows}
    result=metrics(pool,votes)
    if len(votes)!=len(vote_rows) or result['eligibleDistinctPairs']!=len(votes):
        raise ValueError('Duplicate or out-of-pool verdicts')
    summary[name]={'all':result}
    if name=='train':
        split=json.loads((folder/'split.json').read_text())
        assignments={role:set(split[role+'Ids']) for role in ('train','validation')}
        if (len(assignments['train'])!=500 or len(assignments['validation'])!=100 or
            assignments['train']&assignments['validation'] or
            set.union(*assignments.values())!={row['id'] for row in pool}):
            raise ValueError('Split differs from the candidates')
        for role,ids in assignments.items():
            subset=[row for row in pool if row['id'] in ids]
            summary[name][role]=metrics(subset,votes)
print(json.dumps(summary,indent=2,sort_keys=True))
