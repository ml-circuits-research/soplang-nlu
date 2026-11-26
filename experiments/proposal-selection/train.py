"""Offline proposal ranker. Only fit reads training and validation labels."""
import argparse
from collections import Counter
import gzip
import hashlib
import itertools
import json
import math
from pathlib import Path
import struct

FORMAT = 'sop-proposal-ranker-v1'
TRAIN_SIZE = 500
VALIDATION_SIZE = 100
ANY_SLACK = 0.02


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, allow_nan=False, indent=2) + '\n').encode()


def write(path, data):
    with path.open('xb') as output:
        output.write(json_bytes(data))


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def validate_names(names):
    if (not isinstance(names, list) or not names or
            any(type(name) is not str or not name for name in names) or
            len(set(names)) != len(names)):
        raise ValueError('Expected an ordered JSON array of unique nonempty feature names')
    return names


def load_rows(path, split, width):
    opener = gzip.open if path.suffix == '.gz' else open
    rows = []
    seen = set()
    with opener(path, 'rt', encoding='utf8') as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict) or row.get('split') != split:
                raise ValueError(f'{path}:{line_number} must contain only {split} rows')
            identity = row.get('id')
            if type(identity) is not str or not identity or identity in seen:
                raise ValueError(f'{path}:{line_number} has a missing or duplicate ID')
            candidates = row.get('candidates')
            if not isinstance(candidates, list):
                raise ValueError(f'{identity}: candidates must be an array')
            for candidate in candidates:
                verify_candidate(identity, candidate, width, len(candidates))
            seen.add(identity)
            rows.append(row)
    return rows


def verify_candidate(identity, candidate, width, size):
    if not isinstance(candidate, dict):
        raise ValueError(f'{identity}: invalid candidate')
    features = candidate.get('features')
    similarity = candidate.get('similarity')
    if (not isinstance(features, list) or len(features) != width or
            not all(finite(x) for x in features)):
        raise ValueError(f'{identity}: invalid feature vector of expected width {width}')
    if (not isinstance(similarity, list) or len(similarity) != size or
            not all(finite(x) and 0 <= x <= 1 for x in similarity)):
        raise ValueError(f'{identity}: similarity must align with candidates and lie in [0, 1]')
    if (type(candidate.get('accepted')) is not bool or type(candidate.get('sop')) is not str
            or not candidate['sop'].strip()):
        raise ValueError(f'{identity}: invalid SOP or acceptance label')


def training_items(rows):
    for row in rows:
        candidates = row['candidates']
        if candidates:
            weight = 1 / len(candidates)
            for candidate in candidates:
                yield candidate['features'], int(candidate['accepted']), weight


def float32(value):
    return struct.unpack('f', struct.pack('f', value))[0]


def sigmoid(raw):
    if raw >= 0:
        return 1 / (1 + math.exp(-raw))
    exponent = math.exp(raw)
    return exponent / (1 + exponent)


def raw_score(estimator, features):
    if estimator['type'] == 'logistic':
        total = estimator['intercept']
        for value, weight in zip(features, estimator['weights'], strict=True):
            total += value * weight
        return total
    if estimator['type'] != 'gradient_boosting':
        raise ValueError('Unsupported estimator')
    prepared = [float32(value) for value in features]
    total = estimator['baseScore']
    for tree in estimator['trees']:
        node = 0
        while tree['left'][node] >= 0:
            value = prepared[tree['feature'][node]]
            branch = 'left' if value <= tree['threshold'][node] else 'right'
            node = tree[branch][node]
        total += estimator['learningRate'] * tree['value'][node]
    return total


def probabilities(estimator, candidates):
    return [sigmoid(raw_score(estimator, c['features'])) for c in candidates]


def select(candidates, scores, policy):
    ranked = sorted(range(len(candidates)), key=lambda index: (-scores[index], index))
    if not ranked:
        return []
    selected = ranked[:1]
    for index in ranked[1:]:
        if len(selected) >= policy['maxCandidates'] or scores[index] < policy['minScore']:
            break
        if all(candidates[index]['similarity'][prior] <= policy['maxSimilarity'] for prior in selected):
            selected.append(index)
    return selected


def decision(row, scores, policy):
    selected = select(row['candidates'], scores, policy)
    accepted = sum(row['candidates'][i]['accepted'] for i in selected)
    outcome = 'NONE' if not accepted else 'ALL' if accepted == len(selected) else 'SOME'
    return {'id': row['id'], 'selectedIndices': selected, 'outcome': outcome}


def summarize(decisions):
    total = len(decisions)
    counts = Counter(d['outcome'] for d in decisions)
    outcomes = {outcome: counts[outcome] for outcome in ('NONE','SOME','ALL')}
    return {
        'rows': total,
        'counts': outcomes,
        'percentages': {outcome: 100 * count / total if total else 0 for outcome,count in outcomes.items()},
        'anyPercent': 100 * (counts['ALL'] + counts['SOME']) / total if total else 0,
        'averageCandidates': sum(len(d['selectedIndices']) for d in decisions) / total if total else 0
    }


def evaluate(rows, scores, policy):
    return summarize([decision(row, row_scores, policy) for row,row_scores in zip(rows,scores,strict=True)])


def policies():
    yield {'maxCandidates': 1, 'minScore': 0, 'maxSimilarity': 1}
    for cap, score, similarity in itertools.product((2,3), (0,.5,.7), (.8,.95,1)):
        yield {'maxCandidates': cap, 'minScore': score, 'maxSimilarity': similarity}


def train_estimators(rows):
    import numpy as np
    import sklearn
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler

    features, labels, weights = zip(*training_items(rows), strict=True)
    if len(set(labels)) != 2:
        raise ValueError('Train candidates must include both accepted and rejected labels')
    x = np.array(features, dtype=np.float64)
    y = np.array(labels)
    w = np.array(weights)
    scaler = StandardScaler().fit(x, sample_weight=w)
    logistic = LogisticRegression(C=1.0, max_iter=1000, random_state=0).fit(
        scaler.transform(x), y, sample_weight=w)
    coefficients = logistic.coef_[0] / scaler.scale_
    matrices = {
        'type': 'logistic',
        'intercept': float(logistic.intercept_[0] - np.dot(coefficients, scaler.mean_)),
        'weights': coefficients.tolist()
    }
    boosting = GradientBoostingClassifier(
        n_estimators=40, max_depth=2, min_samples_leaf=4, learning_rate=.1, random_state=0
    ).fit(x, y, sample_weight=w)
    accepted_prior = float(boosting.init_.class_prior_[1])
    boosting_tree = {
        'type': 'gradient_boosting',
        'baseScore': math.log(accepted_prior / (1 - accepted_prior)),
        'learningRate': boosting.learning_rate,
        'trees': [export_tree(tree.tree_) for tree in boosting.estimators_[:,0]]
    }
    for estimator, expected in (
            (matrices, logistic.predict_proba(scaler.transform(x))[:,1]),
            (boosting_tree, boosting.predict_proba(x)[:,1])):
        result = [sigmoid(raw_score(estimator, row)) for row in x.tolist()]
        if not np.allclose(result, expected, rtol=1e-10, atol=1e-12):
            raise ValueError('Portable model differs from fitted classifier')
    return [matrices, boosting_tree], sklearn.__version__


def export_tree(tree):
    return {
        'feature': tree.feature.tolist(),
        'threshold': tree.threshold.tolist(),
        'left': tree.children_left.tolist(),
        'right': tree.children_right.tolist(),
        'value': tree.value[:,0,0].tolist()
    }


def choose(estimators, validation):
    trials = []
    for estimator in estimators:
        scores = [probabilities(estimator, row['candidates']) for row in validation]
        for policy in policies():
            trials.append((estimator, policy, evaluate(validation,scores,policy)))
    best_any = max(outcome['anyPercent'] for _,_,outcome in trials)
    near_best = [trial for trial in trials if trial[2]['anyPercent'] >= best_any - ANY_SLACK * 100]
    def priority(trial):
        outcome = trial[2]
        return outcome['percentages']['ALL'], outcome['anyPercent'], -outcome['averageCandidates']
    return max(near_best,key=priority),best_any,trials


def cohort_metadata(path, rows):
    return {
        'rows': len(rows), 'candidates': sum(len(r['candidates']) for r in rows),
        'sourceSha256': digest(path.read_bytes()),
        'sortedIdsSha256': digest(json_bytes(sorted(row['id'] for row in rows)))
    }


def fit(args):
    names = validate_names(json.loads(args.features.read_text(encoding='utf8')))
    train = load_rows(args.train,'train',len(names))
    validation = load_rows(args.validation,'validation',len(names))
    if len(train) != TRAIN_SIZE or len(validation) != VALIDATION_SIZE:
        raise ValueError(f'Expected {TRAIN_SIZE} training and {VALIDATION_SIZE} validation rows')
    if {r['id'] for r in train} & {r['id'] for r in validation}:
        raise ValueError('Training and validation IDs overlap')
    estimators, version = train_estimators(train)
    (estimator, policy, outcome), best_any, trials = choose(estimators,validation)
    artifact = {'format': FORMAT, 'featureNames': names, 'estimator': estimator, 'policy': policy,
                'training': cohort_metadata(args.train,train),
                'selection': {'validationCohort': cohort_metadata(args.validation,validation),
                              'maximumAnySlackPercentagePoints': 100 * ANY_SLACK,
                              'maximumValidationAnyPercent': best_any, 'validation': outcome,
                              'priority': ['withinAnySlack','allPercent','anyPercent','fewerCandidates'],
                              'sklearnVersion': version}}
    write(args.output,artifact)
    report = {'modelSha256': digest(args.output.read_bytes()), 'estimator': estimator['type'],
              'policy': policy, 'selection': artifact['selection'],
              'trials': [{'estimator': e['type'],'policy': p,'validation': o} for e,p,o in trials]}
    if args.report:
        write(args.report,report)
    print(json.dumps({key:value for key,value in report.items() if key != 'trials'},ensure_ascii=False))


def score(args):
    # The frozen artifact is read before the held-out data file.
    sealed = args.model.read_bytes()
    artifact = json.loads(sealed)
    if artifact.get('format') != FORMAT:
        raise ValueError('Unsupported ranker artifact')
    names = validate_names(artifact['featureNames'])
    rows = load_rows(args.input,args.split,len(names))
    estimator, policy = artifact['estimator'], artifact['policy']
    decisions = []
    for row in rows:
        scores = probabilities(estimator,row['candidates'])
        decisions.append({**decision(row,scores,policy),'scores':scores})
    result = {'modelSha256': digest(sealed), 'split': args.split, 'summary': summarize(decisions)}
    if args.report:
        write(args.report,{**result,'decisions': decisions})
    print(json.dumps(result,ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action',required=True)
    train = sub.add_parser('fit',help='Fit on training rows, choose policy on validation rows, and freeze an artifact.')
    for field in ('train','validation','features','output'):
        train.add_argument(field,type=Path)
    train.add_argument('--report',type=Path)
    train.set_defaults(run=fit)
    evaluate_frozen = sub.add_parser('score',help='Score one split with a frozen artifact.')
    evaluate_frozen.add_argument('model',type=Path)
    evaluate_frozen.add_argument('input',type=Path)
    evaluate_frozen.add_argument('--split',choices=('train','validation','diagnostic'),default='diagnostic')
    evaluate_frozen.add_argument('--report',type=Path)
    evaluate_frozen.set_defaults(run=score)
    args = parser.parse_args()
    try:
        args.run(args)
    except (OSError, ValueError, ImportError) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
