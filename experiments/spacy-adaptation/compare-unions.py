"""Measure accepted-circuit availability across existing reviewed SHA250 strategies."""
import argparse
import gzip
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('transformer_adaptation_archive', type=Path)
parser.add_argument('evaluation_archives', type=Path)
args = parser.parse_args()
root = args.transformer_adaptation_archive
archives = args.evaluation_archives
def load(path, engine=None):
    with gzip.open(path,'rt') as stream:
        rows = [row for row in map(json.loads,stream)
                if engine is None or row['engine']==engine]
    by_id = {row['id']:row for row in rows}
    if len(rows)!=250 or len(by_id)!=len(rows):
        raise ValueError('Expected one reviewed outcome per diagnostic source in '+str(path))
    return by_id

heading = 'review/public-set-judgments.jsonl.gz'
baseline = load(root/'baseline'/heading)
adapted = load(root/'adapted'/heading)
compact = load(archives/'2026-11-26-spacy-compact-adaptation-pilot/adapted'/heading)
prolog = load(archives/'2026-11-26-neuro-prolog-historical-diagnostic-250'/heading,'neuro-prolog')
projection = archives/'2026-11-26-spacy-beam-refresh-diagnostic-250'/heading
new_direct = load(projection,'spacy-direct')
beam = load(projection,'spacy-beam')
others = {'pretrainedTransformer':baseline,'adaptedCompact':compact,
          'archivedNeuroProlog':prolog,'refreshedDirect':new_direct,'refreshedBeam':beam}
for label, rows in {**others,'adaptedTransformer':adapted}.items():
    if rows.keys()!=baseline.keys() or any(row['text']!=baseline[i]['text'] for i,row in rows.items()):
        raise ValueError('Diagnostic IDs or literal source differ for '+label)

def accepted(rows):
    return {i for i,row in rows.items() if row['outcome']!='none'}

def compare(current, prior):
    gained=current-prior
    lost=prior-current
    return {'both':len(current&prior),'adaptedOnly':len(gained),'priorOnly':len(lost),
            'neither':250-len(current|prior),'union':len(current|prior),
            'addedIds':sorted(gained),'lostIds':sorted(lost)}

accepted_adapted = accepted(adapted)
paired = {name:compare(accepted_adapted,accepted(rows)) for name,rows in others.items()}
paired['allPreviouslySettled'] = compare(accepted_adapted,set.union(*(accepted(rows) for rows in others.values())))
print(json.dumps({'inputs':250,'adaptedAccepted':len(accepted_adapted),'comparisons':paired},indent=2))
