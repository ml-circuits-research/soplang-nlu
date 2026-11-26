import collections as c
import gzip,json,pathlib
base=pathlib.Path(__file__).resolve().parent
raw=json.loads(gzip.open(base/'raw.json.gz','rt').read())
names=['gpt-6-sol','gpt-6.1-terra','gpt-6.2-sol']
votes=[{x['key']:x for x in json.loads((base/(m+'.json')).read_text())} for m in names]
baseline_path=base.parent/'2026-11-26-uniform-development-100/review/public-set-judgments.jsonl.gz'
baseline=c.defaultdict(bool)
for line in gzip.open(baseline_path,'rt'):
    row=json.loads(line)
    baseline[row['id']] |= row['outcome'] != 'none'
axes=['predicate','boundaries','arguments','coordination']
rows={}
for g in raw['groups']:
    key=g['key']
    a,b=votes[0][key],votes[1][key]
    tiebreak=a['usable']!=b['usable']
    decision=votes[2][key] if tiebreak else a
    for m in g['memberships']:
        rows.setdefault(m['id'],{})[m['engine']]=(g,decision)
for idx in (0,1):
    model_groups=[g['key'] for g in raw['groups'] for m in g['memberships'] if m['engine']==idx]
    predictions=[v[idx] for v in rows.values()]
    print(idx,'accepted',sum(d['usable'] for g,d in predictions),'first/second',*[sum(v[key]['usable'] for key in model_groups) for v in votes[:2]])
    print('axes', {n:dict(c.Counter(d[n] for g,d in predictions)) for n in axes})
    print('both reject across parsers and accepted, paired contingency vs symbolic', c.Counter((baseline[i],row[idx][1]['usable']) for i,row in rows.items()))
print('pair',c.Counter(tuple(v[i][1]['usable'] for i in (0,1)) for v in rows.values()))
print('judges',c.Counter((v['usable'],votes[1][key]['usable']) for key,v in votes[0].items()), 'audits',len(votes[2]))
selection=json.loads((base/'audit-selection.json').read_text())
print('agreement audit contradictions', {stratum:sum(votes[2][key]['usable']!=votes[0][key]['usable'] for key in selection[stratum]) for stratum in ('agreedUsable','agreedUnusable')})
print('symbolic ANY or dependency usable',sum(baseline[key] or any(d['usable'] for _,d in pair.values()) for key,pair in rows.items()))
print('examples')
for mask in [(True,False),(False,True),(False,False),(True,True)]:
    print(mask)
    filtered=[r for r in rows.values() if tuple(r[i][1]['usable'] for i in (0,1))==mask]
    for pair in sorted(filtered,key=lambda r:len(r[0][0]['text']))[:12]:
        print(pair[0][0]['text'],'| sm',pair[0][1]['reason'],'| lg',pair[1][1]['reason'])
