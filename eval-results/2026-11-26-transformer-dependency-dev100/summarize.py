"""Replay raw-graph decisions, joining all models by the frozen source row."""
from pathlib import Path
import collections
import gzip
import json

base = Path(__file__).resolve().parent
prior = base.parent / '2026-11-26-neural-dependency-dev100'
axes = ['predicate', 'boundaries', 'arguments', 'coordination']


def read(folder):
    raw = json.loads(gzip.open(folder / 'raw.json.gz', 'rt').read())
    votes = [{v['key']: v for v in json.loads((folder / (m + '.json')).read_text())}
             for m in ['gpt-6-sol', 'gpt-6.1-terra', 'gpt-6.2-sol']]
    rows = collections.defaultdict(dict)
    for graph in raw['groups']:
        key = graph['key']
        a, b = votes[0][key], votes[1][key]
        decision = a if a['usable'] == b['usable'] else votes[2][key]
        for member in graph['memberships']:
            rows[member['id']][member['engine']] = decision
    return raw['sourceSha256'], rows


if __name__ == '__main__':
    initial_digest, old = read(prior)
    new_digest, new = read(base)
    assert initial_digest == new_digest and old.keys() == new.keys()
    rows = [(old[key][0], old[key][1], new[key][0]) for key in old]
    def summary(col):
        return dict(usable=sum(r[col]['usable'] for r in rows),
                    defects={ax:sum(r[col][ax] == 'wrong' for r in rows) for ax in axes})
    def contingency(left, right):
        return dict(both=sum(r[left]['usable'] and r[right]['usable'] for r in rows),
                    leftOnly=sum(r[left]['usable'] and not r[right]['usable'] for r in rows),
                    rightOnly=sum(not r[left]['usable'] and r[right]['usable'] for r in rows),
                    neither=sum(not r[left]['usable'] and not r[right]['usable'] for r in rows))
    print(json.dumps(dict(count=len(rows), compact=summary(0), large=summary(1), transformer=summary(2),
                          compactVsTransformer=contingency(0,2),largeVsTransformer=contingency(1,2)),indent=2))
