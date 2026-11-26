"""Compare frozen ranker outcomes with original candidate-order policies."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path


def rows(path):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', encoding='utf8') as source:
        return [json.loads(line) for line in source if line.strip()]


def summarize(choices):
    total = len(choices)
    counts = dict(NONE=0,SOME=0,ALL=0)
    selected = 0
    for values in choices:
        accepted = sum(values)
        counts['NONE' if not accepted else 'ALL' if accepted == len(values) else 'SOME'] += 1
        selected += len(values)
    return {'counts':counts, 'percentages':{k:100*v/total for k,v in counts.items()},
            'anyPercent':100*(counts['ALL']+counts['SOME'])/total,'averageCandidates':selected/total}


def compare(model, features, score_report):
    digest = hashlib.sha256(model.read_bytes()).hexdigest()
    selections = json.loads(score_report.read_text())
    if digest != selections['modelSha256']:
        raise ValueError('Reference scores used a different model')
    inputs = rows(features)
    first, three, selected = [], [], []
    any_pool = 0
    for row,result in zip(inputs,selections['decisions'],strict=True):
        if row['id'] != result['id'] or row['split'] != selections['split']:
            raise ValueError('Feature and reference records differ')
        labels = [candidate['accepted'] for candidate in row['candidates']]
        first.append(labels[:1])
        three.append(labels[:3])
        selected.append([labels[index] for index in result['selectedIndices']])
        any_pool += any(labels)
    assert summarize(selected)['counts'] == selections['summary']['counts']
    return {'split':selections['split'],'rows':len(inputs),'modelSha256':digest,
            'selection':summarize(selected),'originalOrderTop1':summarize(first),
            'originalOrderTop3':summarize(three),'poolOracleAnyPercent':100*any_pool/len(inputs)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for value in ('model','features','score_report'):
        parser.add_argument(value,type=Path)
    args = parser.parse_args()
    print(json.dumps(compare(args.model,args.features,args.score_report),indent=2))
