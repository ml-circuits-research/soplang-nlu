import gzip
import itertools
import json
from pathlib import Path

root = Path(__file__).resolve().parent
standalone = root.parent / '2026-11-26-spacy-direct-refinement-dev100'
runs = {
    'prolog_compact': root / 'compact',
    'prolog_transformer': root / 'transformer',
    'standalone_compact': standalone / 'compact',
    'standalone_transformer': standalone / 'transformer',
}

outcomes = {}
timing = {}
for name, path in runs.items():
    with gzip.open(path / 'review/public-set-judgments.jsonl.gz', 'rt') as rows:
        outcomes[name] = {r['id']: r['outcome'] for r in map(json.loads, rows)}
    strategy = 'neuro-prolog' if name.startswith('prolog_') else 'spacy-direct'
    env = json.loads((path / 'inference/environment.json').read_text())
    metrics = json.loads((path / 'inference' / (strategy + '.json')).read_text())
    expected = 'core_web_sm' if name.endswith('_compact') else 'core_web_trf'
    assert env['model']['model'] == expected
    timing[name] = {'model': expected, 'version': env['model']['modelVersion'],
                    'modelStartupMs': env['modelStartupMs'], **metrics}

ids = set(next(iter(outcomes.values())))
assert len(ids) == 100 and all(set(r) == ids for r in outcomes.values())
any_pass = {name: {key for key, outcome in rows.items() if outcome in {'all', 'some'}}
            for name, rows in outcomes.items()}
overlap = {}
for left, right in itertools.combinations(runs, 2):
    a, b = any_pass[left], any_pass[right]
    overlap[left + ' / ' + right] = {
        'both': len(a & b), 'leftOnly': len(a - b), 'rightOnly': len(b - a),
        'neither': len(ids - (a | b)), 'union': len(a | b)
    }
summary = {'sample': 100, 'projectorCommit': 'fb8fa5b', 'timing': timing, 'overlap': overlap,
           'outcomes': {name: {kind: list(rows.values()).count(kind) for kind in ('all', 'some', 'none')}
                        for name, rows in outcomes.items()}}
print(json.dumps(summary, indent=2))
