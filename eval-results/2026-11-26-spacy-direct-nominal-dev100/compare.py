import gzip
import json
from pathlib import Path

root = Path(__file__).resolve().parent
previous = root.parent / '2026-11-26-spacy-direct-sequence-dev100'
def rows(path):
    with gzip.open(path, 'rt') as stream:
        return {r['id']: r for r in map(json.loads, stream)}

accepted = {}
summary = {}
examples = {}
for model in ('compact', 'transformer'):
    old, new = [rows(base / model / 'review/public-set-judgments.jsonl.gz') for base in (previous, root)]
    assert len(old) == 100 and old.keys() == new.keys()
    gained = [r for k, r in new.items() if r['outcome'] != 'none' and old[k]['outcome'] == 'none']
    lost = [r for k, r in new.items() if r['outcome'] == 'none' and old[k]['outcome'] != 'none']
    accepted[model] = {k for k, r in new.items() if r['outcome'] != 'none'}
    summary[model] = {'nonePercent': sum(r['outcome'] == 'none' for r in new.values()),
                      'somePercent': sum(r['outcome'] == 'some' for r in new.values()),
                      'allPercent': sum(r['outcome'] == 'all' for r in new.values()),
                      'gainPercentagePoints': len(gained), 'lossPercentagePoints': len(lost)}
    examples[model] = {'gained': gained, 'lost': lost}

a, b = accepted.values()
paired = {'bothPercent': len(a & b), 'compactOnlyPercent': len(a - b),
          'transformerOnlyPercent': len(b - a), 'neitherPercent': 100 - len(a | b),
          'oracleUnionPercent': len(a | b)}
print(json.dumps({'outcomes': summary, 'paired': paired, 'changes': examples},
                 indent=2, ensure_ascii=False))
