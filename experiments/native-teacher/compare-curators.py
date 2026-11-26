"""Compare two already-sealed authors on paired, independently reviewed rows."""
import gzip
import json
from pathlib import Path
import re
import statistics
import sys

sol, terra, output = map(Path, sys.argv[1:])


def jsonl(path):
    with gzip.open(path, 'rt') as stream:
        return [json.loads(line) for line in stream if line.strip()]


def fingerprint(row, reading):
    return row['text'], reading['sop'].replace('\r\n', '\n').replace('\r', '\n').strip()


def summarize(path):
    logical = path / 'logical-00000'
    verification = path / 'confirmation'
    generated = jsonl(logical / 'records.jsonl.gz')
    agreed = jsonl(verification / 'accepted.jsonl.gz')
    judgments = jsonl(verification / 'review' / 'candidate-decisions.jsonl.gz')
    plan = json.loads((verification / 'review' / 'plan.json').read_text())
    review = json.loads((verification / 'review' / 'summary.json').read_text())
    separate = path / 'novel-confirmation' / 'review' / 'summary.json'
    if separate.is_file():
        review = json.loads(separate.read_text())
        novels = review['distinctReviewedTargets']
    else:
        novels = plan['novel']
    initial = sorted(logical.glob('*-initial.prompt.txt'))
    repaired = list(logical.glob('*-repair-*.prompt.txt'))
    tokens = []
    for log in logical.glob('*.log'):
        values = re.findall(r'(?m)^tokens used\n([\d,]+)$', log.read_text())
        if values:
            tokens.append(int(values[-1].replace(',', '')))
    call_seconds = {}
    for phase, pattern in [('initial', '*-initial.json'), ('repair', '*-repair-*.json')]:
        call_seconds[phase] = [json.loads(p.read_text())['wallMs'] / 1000 for p in logical.glob(pattern)
                               if not p.name.endswith('.response.json')]
    seconds = (path / 'summary.json').stat().st_mtime - min(p.stat().st_mtime for p in initial)
    valid = [row for row in generated if row['readings']]
    result = {
        'sources': len(generated), 'sourceComplete': len(valid),
        'completeCircuits': sum(len(row['readings']) for row in valid),
        'staticTwoReadingSources': sum(len(row['readings']) == 2 for row in valid),
        'staticDraftConfirmations': sum(c['draftIndex'] is not None for row in valid for c in row['readings']),
        'correctiveRetrySources': sum(row['attempts'] == 2 for row in generated),
        'correctiveRetrySourceRecoveries': sum(row['attempts'] == 2 for row in valid),
        'initialRequests': len(initial), 'repairRequests': len(repaired),
        'operationWallSecondsIncludingRestart': seconds,
        'sealedInvocationWallSeconds': json.loads((path / 'summary.json').read_text())['wallMs'] / 1000,
        'totalReportedCodexTokens': sum(tokens), 'rowsPerMinute': len(generated) * 60 / seconds,
        'medianReportedTokensPerCall': statistics.median(tokens) if tokens else None,
        'modelCallWallSeconds': {phase: {'median': statistics.median(times) if times else None, 'sum': sum(times)}
                                 for phase, times in call_seconds.items()},
        'acceptedSources': len(agreed), 'twoAcceptedReadings': sum(len(row['readings']) == 2 for row in agreed),
        'acceptedDraftConfirmations': sum(c['draftIndex'] is not None for row in agreed for c in row['readings']),
        'acceptedNewCircuits': sum(c['draftIndex'] is None for row in agreed for c in row['readings']),
        'novelReviewedCircuits': novels, 'exactReusedCircuits': len(judgments) - novels,
        'primaryIndependentDisagreements': sum((j['primary']['grade'] == 8) != (j['independent']['grade'] == 8)
                                              for j in judgments),
        'novelReview': review['review'],
    }
    return result, generated, agreed


a, srows, solaccepted = summarize(sol)
b, trows, terraaccepted = summarize(terra)
if [(r['id'], r['text']) for r in srows] != [(r['id'], r['text']) for r in trows]:
    raise ValueError('Different author inputs')
sids = {r['id'] for r in solaccepted}
tids = {r['id'] for r in terraaccepted}
sol_drafts = {fingerprint(r, c) for r in srows for c in r['readings']}
terra_drafts = {fingerprint(r, c) for r in trows for c in r['readings']}
sol_passes = {fingerprint(r, c) for r in solaccepted for c in r['readings']}
terra_passes = {fingerprint(r, c) for r in terraaccepted for c in r['readings']}
data = {'sol': a, 'terra': b,
        'pairedAcceptance': {'both': len(sids & tids), 'solOnly': len(sids - tids),
                             'terraOnly': len(tids - sids), 'neither': len(srows) - len(sids | tids)},
        'sharedExactProposals': len(sol_drafts & terra_drafts),
        'sharedExactAcceptedCircuits': len(sol_passes & terra_passes),
        'solOnlyIds': sorted(sids - tids), 'terraOnlyIds': sorted(tids - sids)}
with output.open('x') as stream:
    json.dump(data, stream, indent=2)
    stream.write('\n')
print(json.dumps({k: v for k, v in data.items() if not k.endswith('Ids')}))
