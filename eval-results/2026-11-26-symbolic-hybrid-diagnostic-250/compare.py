import collections
import gzip
import hashlib
import itertools
import json
from pathlib import Path

root = Path(__file__).resolve().parent

def read_jsonl(path):
    with gzip.open(path, 'rt') as handle:
        return list(map(json.loads, handle))

sample = read_jsonl(root/'inference/z3.jsonl.gz')
ids = {r['id'] for r in sample}
assert len(ids) == len(sample) == 250
archive = read_jsonl(root/'review/public-set-judgments.jsonl.gz')
benchmarks = read_jsonl(root/'comparators/public-set-judgments.jsonl.gz')
scores = {}
for row in archive + benchmarks:
    engine = scores.setdefault(row['engine'], {})
    assert row['id'] not in engine
    engine[row['id']] = row['outcome']
assert all(set(r) == ids for r in scores.values())

summary = {}
for name, votes in sorted(scores.items()):
    counts = collections.Counter(votes.values())
    accepted = sum(v in ('all','some') for v in votes.values())
    path = root / ('comparators' if name.startswith('spacy-') else 'inference') / (name + '.json')
    runtime = json.loads(path.read_text())
    summary[name] = {
        'nonePercent': 100 * counts['none'] / len(ids),
        'somePercent': 100 * counts['some'] / len(ids),
        'allPercent': 100 * counts['all'] / len(ids),
        'anyPercent': 100 * accepted / len(ids),
        'timing': {k: runtime[k] for k in ('startupMs','modelLoadMs','medianMs','p95Ms','wallMs','errors') if k in runtime}
    }

paired = {}
for left, right in itertools.combinations(sorted(scores),2):
    a,b = ({k for k,v in scores[n].items() if v in ('all','some')} for n in (left,right))
    paired[left + ' / ' + right] = {
      'both': len(a & b), 'leftOnly': len(a - b), 'rightOnly': len(b - a),
      'neither': len(ids - (a | b)), 'oracleUnion': len(a | b)}

world = {r['id']: r for r in read_jsonl(root/'inference/prolog-worlds.jsonl.gz')}
transfer = read_jsonl(root/'inference/prolog-example-transfer.jsonl.gz')
assert set(world) == {r['id'] for r in transfer} == ids

def complete(check):
    gaps = check['sourceGaps']
    return check['valid'] and check['coverage']['allAccountedFor'] and not (
        gaps['materialUnresolved'] or gaps['materialUncovered'])

def distinct(r):
    return set(r['candidates']) - set(world[r['id']]['candidates'])

def novel_grounded(r):
    actual = distinct(r)
    return {sop for sop, check in zip(r['candidates'],r['checks'],strict=True) if sop in actual and complete(check)}

def transfer_native_novel(r):
    return distinct(r) & set(r['transferNativeSops'])

assert all(set(r['transferNativeSops']) <= set(r['candidates']) | {
    v.get('sop','') for v in r['rejected']} or r['transferLegacyCandidates'] for r in transfer)
sample_text = {row['id']:row['text'] for row in json.loads(gzip.decompress((root/'inference/sample.json.gz').read_bytes()))}
decisions = {row['fingerprint']:row for row in read_jsonl(root/'review/candidate-decisions.jsonl.gz')}
def fingerprint(id, sop):
    return hashlib.sha256(json.dumps([sample_text[id],sop],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def accepted_from_transfer(row):
    return sum(decisions.get(fingerprint(row['id'],sop),{}).get('grade') == 8 for sop in transfer_native_novel(row))
world_outcomes=scores['prolog-worlds']
model_outcomes=scores['prolog-example-transfer']
transfer_detail = {
    'textsWithDistinctLegacyTransfer': sum(r['transferLegacyCandidates']>0 for r in transfer),
    'distinctLegacyTransferCandidates': sum(r['transferLegacyCandidates'] for r in transfer),
    'textsWithDecoratedTransferNativeCircuits': sum(bool(r['transferNativeSops']) for r in transfer),
    'textsWithPublicNativeSetsDifferentFromWorlds': sum(set(r['candidates']) != set(world[r['id']]['candidates']) for r in transfer),
    'novelPublicNativeCircuits': sum(len(distinct(r)) for r in transfer),
    'novelPublicNativeCircuitsFromTransfer': sum(len(transfer_native_novel(r)) for r in transfer),
    'novelSourceCompleteNativeCircuits': sum(len(novel_grounded(r)) for r in transfer),
    'novelSourceCompleteNativeCircuitsFromTransfer': sum(len(novel_grounded(r) & transfer_native_novel(r)) for r in transfer),
    'acceptedNovelNativeCircuitsFromTransfer': sum(accepted_from_transfer(r) for r in transfer),
    'textsWithAcceptedNovelTransferCircuit': sum(accepted_from_transfer(r)>0 for r in transfer),
    'textsGainingAnyAcceptedAgainstWorlds': sum(world_outcomes[k]=='none' and model_outcomes[k]!='none' for k in ids),
    'textsLosingAnyAcceptedAgainstWorlds': sum(world_outcomes[k]!='none' and model_outcomes[k]=='none' for k in ids)
}
print(json.dumps({'sample':len(ids),'outcomes':summary,'pairwiseAcceptance':paired,'transfer':transfer_detail},
                 indent=2,sort_keys=True))
