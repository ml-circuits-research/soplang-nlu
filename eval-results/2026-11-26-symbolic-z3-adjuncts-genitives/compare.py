"""Compare paired public proposals and produce a blinded packet for targeted review."""
import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from statistics import median


def read_rows(path):
    with gzip.open(path, 'rt') as contents:
        return [json.loads(line) for line in contents]


def complete(row):
    return any(candidate['complete'] for candidate in row['candidates'])


def summarize(rows):
    def times(key):
        ordered = sorted(row[key] for row in rows)
        return {'total': sum(ordered), 'median': median(ordered), 'p95': ordered[int(.95 * len(ordered))]}

    return {
        'complete': sum(map(complete, rows)),
        'errors': sum(bool(row['error']) for row in rows),
        'rejected': sum(row['rejected'] for row in rows),
        'candidateCount': dict(Counter(len(row['candidates']) for row in rows)),
        'wallMs': times('ms'),
        'cpuMs': times('cpuMs'),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('baseline', type=Path)
    parser.add_argument('updated', type=Path)
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    baseline, updated = map(read_rows, (args.baseline, args.updated))
    assert [(row['id'], row['text'], row['i']) for row in baseline] == [
        (row['id'], row['text'], row['i']) for row in updated]
    changed = [(old, new) for old, new in zip(baseline, updated)
               if old['candidates'] != new['candidates']]
    gains = [(old, new) for old, new in changed if not complete(old) and complete(new)]
    losses = [(old, new) for old, new in changed if complete(old) and not complete(new)]
    persistent = [(old, new) for old, new in changed if complete(old) and complete(new)]
    ongoing = [(old, new) for old, new in changed if not complete(old) and not complete(new)]

    def digest(pair):
        return hashlib.sha256(('symbolic-z3-dev-review\0' + pair[0]['text']).encode()).digest()

    review = []
    key = []
    for subset in (gains + losses, sorted(persistent, key=digest)[:10], sorted(ongoing, key=digest)[:2]):
        for old, new in subset:
            reverse = digest((old,new))[-1] % 2
            packet_id = len(review) + 1
            arms = [row['candidates'] for row in (old, new)]
            review.append({'reviewId': packet_id, 'text': old['text'],
                           'A': arms[reverse], 'B': arms[1-reverse]})
            key.append({'reviewId': packet_id, 'id': old['id'], 'updated': 'A' if reverse else 'B'})
    result = {
        'rows': len(baseline), 'baseline': summarize(baseline), 'updated': summarize(updated),
        'changedSopLists': len(changed), 'coverageGains': len(gains), 'coverageLosses': len(losses),
        'changedCompleteBoth': len(persistent), 'changedIncompleteBoth': len(ongoing),
    }
    for name, value in (('summary.json', result), ('review-packet.json', review), ('review-key.json', key)):
        with (args.out / name).open('x') as output:
            json.dump(value, output, indent=2, ensure_ascii=False)
            output.write('\n')


if __name__ == '__main__':
    main()
