"""Score the frozen beam pilot and its greedy/first-complete counterfactuals."""
from collections import Counter
from pathlib import Path
import gzip
import hashlib
import json
import math
import statistics
import sys

selection_path, prior_path, review_path, output_path = map(Path, sys.argv[1:])

def jsonl(path):
    with gzip.open(path, 'rt') as stream:
        return [json.loads(line) for line in stream]

def fingerprint(text, sop):
    return hashlib.sha256(json.dumps([text, sop], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()

def outcome(accepted):
    return 'all' if accepted and all(accepted) else 'some' if any(accepted) else 'none'

def counts(values):
    tally = Counter(values)
    return {key:tally[key] for key in ('none', 'some', 'all')}

def latency(values):
    ordered = sorted(values)
    return {
        'meanMs':statistics.mean(ordered),
        'medianMs':statistics.median(ordered),
        'p95Ms':ordered[math.ceil(len(ordered)*0.95)-1],
    }

with gzip.open(selection_path,'rt') as stream:
    selection = json.load(stream)
prior = {row['id']:row for row in jsonl(prior_path/'public-set-judgments.jsonl.gz')}
prior_decisions = {row['fingerprint']:row for row in jsonl(prior_path/'candidate-decisions.jsonl.gz')}
current = {row['id']:row for row in jsonl(review_path/'public-set-judgments.jsonl.gz')}
decisions = {row['fingerprint']:row for row in jsonl(review_path/'candidate-decisions.jsonl.gz')}
assert len(selection) == len(current) == 250
rows = []
for row in selection:
    prior_row = prior[row['id']]
    after = current[row['id']]
    assert prior_row['text'] == after['text'] == row['text']
    assert prior_row['publicCandidateSops'] == [row['greedy']['sop']]
    assert after['publicCandidateSops'] == [item['sop'] for item in row['publicSet']]
    candidates = after['candidates']
    result = {'id':row['id'], 'text':row['text'], 'greedy':prior_row['outcome'], 'beam':after['outcome'],
              'first':outcome([candidates[0]['grade'] == 8]) if row['publicSet'][0]['complete'] else 'none',
              'abstained':not row['publicSet'][0]['complete'],
              'greedyEligible':row['greedy']['complete'], 'beamEligible':row['publicSet'][0]['complete'],
              'greedyReason':prior_row['reason'], 'greedySop':row['greedy']['sop'], 'candidates':candidates}
    if row['greedy']['complete']:
        assert candidates[0]['sop'] == row['greedy']['sop']
        assert (candidates[0]['grade'] == 8) == (prior_row['grade'] == 8)
    eligible = [candidate for candidate, selected in zip(candidates,row['publicSet']) if selected['complete']]
    for reviewer in ('primary','independent'):
        review_grades = [decisions[fingerprint(row['text'], candidate['sop'])][reviewer]['grade'] for candidate in eligible]
        result[reviewer] = outcome([grade == 8 for grade in review_grades])
        result[reviewer+'First'] = outcome([review_grades[0] == 8]) if review_grades else 'none'
    rows.append(result)
new = [row for key,row in decisions.items() if key not in prior_decisions]
primary_matrix = Counter((row['primary']['grade']==8,row['independent']['grade']==8) for row in new)
summary = {
    'rows':len(rows),
    'policies':{policy:counts(row[policy] for row in rows)
                for policy in ('greedy','beam','first','primary','independent','primaryFirst','independentFirst')},
    'greedyEligible':sum(row['greedyEligible'] for row in rows),
    'beamEligible':sum(row['beamEligible'] for row in rows),
    'firstAbstained':sum(row['abstained'] for row in rows),
    'newAny':sum(row['greedy']=='none' and row['beam']!='none' for row in rows),
    'lostAny':sum(row['greedy']!='none' and row['beam']=='none' for row in rows),
    'greedyAllToBeamSome':sum(row['greedy']=='all' and row['beam']=='some' for row in rows),
    'newAll':sum(row['greedy']!='all' and row['beam']=='all' for row in rows),
    'newAnyPreviouslyEligible':sum(row['greedyEligible'] and row['greedy']=='none' and row['beam']!='none' for row in rows),
    'newAnyPreviouslyIneligible':sum(not row['greedyEligible'] and row['beam']!='none' for row in rows),
    'newFirstAccepted':sum(row['greedy']=='none' and row['first']=='all' for row in rows),
    'setSizes':dict(sorted(Counter(len(row['candidates']) for row in rows).items())),
    'eligiblePairs':len(decisions),
    'exactReuses':len(decisions)-len(new),
    'novelPairs':len(new),
    'novelThresholdVotes':{
      'bothAccept':primary_matrix[True,True], 'onlyPrimary':primary_matrix[True,False],
      'onlyIndependent':primary_matrix[False,True], 'bothReject':primary_matrix[False,False],
    },
    'novelAdjudication':{
      'disputesAccept':sum((r['primary']['grade']==8)!=(r['independent']['grade']==8) and r['grade']==8 for r in new),
      'disputesReject':sum((r['primary']['grade']==8)!=(r['independent']['grade']==8) and r['grade']!=8 for r in new),
    },
    'timing':{
      'greedy':latency([row['greedyMs'] for row in selection]),
      'beamExtra':latency([row['beamMs'] for row in selection]),
      'greedyPlusBeam':latency([row['greedyMs']+row['beamMs'] for row in selection]),
    },
}
output_path.mkdir(parents=True,exist_ok=True)
(output_path/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(output_path/'paired-cases.json.gz').write_bytes(gzip.compress(json.dumps(rows,ensure_ascii=False).encode(),mtime=0))
print(json.dumps(summary, indent=2))
