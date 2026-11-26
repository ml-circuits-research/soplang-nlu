import collections
import gzip
import json
import pathlib
root = pathlib.Path(__file__).resolve().parent
def by_id(path):
    with gzip.open(path, 'rt') as lines:
        rows = [json.loads(line) for line in lines]
    result = {r['id']: r for r in rows}
    if len(result) != len(rows):
        raise ValueError('Duplicate record ID')
    return result

def complete(record):
    for check in record['checks']:
        gap = check.get('sourceGaps') or {}
        if (check['valid'] and check['coverage']['allAccountedFor']
            and gap.get('materialUnresolved') == 0 and gap.get('materialUncovered') == 0):
            return True
    return False

def overlap(ids, left, right):
    return {'both': len(ids & left & right), 'neuroOnly': len((ids & left) - right),
            'standaloneOnly': len((ids & right) - left), 'neither': len(ids - (left | right))}

historical = by_id(root / 'historical-static.jsonl.gz')
cut = {r['id'] for r in json.loads((root / 'selection.json').read_text())['rows']}
ids = set(historical)
assert cut <= ids and len(cut) == 250
available_n = {k for k, r in historical.items() if r['neuroComplete']}
available_s = {k for k, r in historical.items() if r['standaloneComplete']}
n = by_id(root / 'inference/neuro-prolog.jsonl.gz')
s = by_id(root / 'standalone-static-slice.jsonl.gz')
assert set(n) == cut == set(s)
assert {k for k, r in n.items() if complete(r)} == available_n & cut
assert {k for k, r in s.items() if complete(r)} == available_s & cut
nr = by_id(root / 'review/public-set-judgments.jsonl.gz')
sr = by_id(root / 'standalone-judgments-slice.jsonl.gz')
assert set(nr) == cut == set(sr)
accepted_n, accepted_s = [{k for k, r in data.items() if r['outcome'] in ('all','some')}
                          for data in (nr, sr)]
result = {'historicalPopulation': len(ids), 'slice': len(cut),
    'static': {'historical': overlap(ids, available_n, available_s),
               'slice': overlap(cut, available_n, available_s)},
    'semantic': {'slice': overlap(cut, accepted_n, accepted_s),
                 'neuroOutcomes': dict(collections.Counter(nr[k]['outcome'] for k in cut)),
                 'standaloneOutcomes': dict(collections.Counter(sr[k]['outcome'] for k in cut))}}
print(json.dumps(result, indent=2, sort_keys=True))
