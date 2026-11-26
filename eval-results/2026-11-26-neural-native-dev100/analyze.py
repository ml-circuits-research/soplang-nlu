import collections as c
import gzip
import json
from pathlib import Path
import sys

root, baseline, dependency = map(Path,sys.argv[1:])
def jsonl(path):
    return [json.loads(line) for line in gzip.open(path,'rt') if line.strip()]
def grade_counts(rows):
    return sorted(c.Counter(row['grade'] for row in rows).items())

old = {(row['id'],row['engine']):row for row in jsonl(baseline/'review/public-set-judgments.jsonl.gz')}
current = {(row['id'],row['engine']):row for row in jsonl(root/'review/adjudicated/public-set-judgments.jsonl.gz')}
projected = {row['id']:{candidate['sop'].strip() for candidate in row['candidates']} for row in
             jsonl(root/'model-sidecars/neuro-prolog-dependency-only.jsonl.gz')}
raw = json.loads(gzip.decompress((dependency/'raw.json.gz').read_bytes()))
reviewers = [{vote['key']:vote for vote in json.loads((dependency/(model+'.json')).read_text())}
             for model in ('gpt-6-sol','gpt-6.1-terra','gpt-6.2-sol')]
compact = {}
for graph in raw['groups']:
    key = graph['key']
    first,second = reviewers[0][key],reviewers[1][key]
    decision = first if first['usable']==second['usable'] else reviewers[2][key]
    for member in graph['memberships']:
        if member['engine']==0:
            compact[member['id']]=(graph,decision)

ids = {row_id for row_id, engine in current}
assert len(ids)==100 and len(current)==len(old)==200 and set(projected)==ids==set(compact)
symbolic_union = {i for i in ids if any(old[i,e]['outcome']!='none' for e in ('z3','prolog-worlds'))}
neural_union = {i for i in ids if any(current[i,e]['outcome']!='none' for e in ('neuro-z3','neuro-prolog'))}
print('union', len(symbolic_union),len(neural_union),'gained',len(neural_union-symbolic_union),'lost',len(symbolic_union-neural_union))
for engine,parent in [('neuro-prolog','prolog-worlds'),('neuro-z3','z3')]:
    rows=[current[row_id,engine] for row_id in sorted(ids)]
    def is_projected(row,candidate):
        return engine=='neuro-z3' or candidate['sop'].strip() in projected[row['id']]
    def has_acceptable(items):
        return any(candidate['grade']==8 for candidate in items)
    def has_eligible(items):
        return any(candidate['reviewed'] for candidate in items)
    print(engine,'levels',grade_counts(rows))
    print('outcomes', c.Counter(row['outcome'] for row in rows))
    print('symbolic-to-neuro',dict(sorted(c.Counter((old[row['id'],parent]['outcome'],row['outcome']) for row in rows).items())))
    print('symbolic-to-neuro-any',dict(sorted(c.Counter((old[row['id'],parent]['outcome']!='none',row['outcome']!='none') for row in rows).items())))
    print('public',sum(len(row['candidates']) for row in rows),'eligible',sum(cand['reviewed'] for row in rows for cand in row['candidates']))
    print('accepted public candidates',sum(cand['grade']==8 for row in rows for cand in row['candidates']))
    print('old NONE with projected accepted',sum(old[row['id'],parent]['outcome']=='none' and any(
        is_projected(row,cand) and cand['grade']==8 for cand in row['candidates']) for row in rows))
    diagnostics=c.Counter()
    examples=c.defaultdict(list)
    for row in rows:
        emerged=[cand for cand in row['candidates'] if is_projected(row,cand)]
        prior=old[row['id'],parent]
        graph,raw_decision=compact[row['id']]
        failure_type=('none projected' if not emerged else 'accepted' if has_acceptable(emerged) else
                      'judged reject' if has_eligible(emerged) else 'static reject')
        diagnostics[raw_decision['usable'],failure_type]+=1
        if len(row['text']) < 135:
            examples[raw_decision['usable'],failure_type].append(
                (row['id'],row['text'],raw_decision['reason'],[(cand['grade'],cand['reason']) for cand in emerged],prior['outcome'],row['outcome']))
    print('raw usability vs evaluated projected witness',dict(sorted(diagnostics.items())))
    for label in [(True,'judged reject'),(True,'static reject'),(False,'accepted')]:
        print(label)
        for example in examples[label][:12]:
            print(*example,sep=' | ')
