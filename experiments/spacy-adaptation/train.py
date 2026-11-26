"""Fine-tune pretrained English query tagging and parsing against corrected arcs."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import random
import time

import spacy
from spacy.training import Example
from spacy.util import fix_random_seed, minibatch
from thinc.api import Adam

parser=argparse.ArgumentParser()
parser.add_argument('artifacts',type=Path)
parser.add_argument('base_model')
parser.add_argument('--seed',type=int,default=23187)
parser.add_argument('--max-epochs',type=int,default=8)
parser.add_argument('--patience',type=int,default=2)
args=parser.parse_args()
output=args.artifacts/'adapted-model'
if output.exists():
    raise SystemExit('Adapted checkpoint already exists')
corrected=(args.artifacts/'corrected-graphs.json.gz').read_bytes()
rows=json.loads(gzip.decompress(corrected))
fix_random_seed(args.seed)
rng=random.Random(args.seed)
nlp=spacy.load(args.base_model,exclude=['ner','textcat'])
base_meta={key:nlp.meta.get(key) for key in ('name','version','lang')}
labels=set(nlp.get_pipe('parser').labels)
tags=set(nlp.get_pipe('tagger').labels)
for row in rows:
    expected=row['tokens']
    actual=nlp.make_doc(row['text'])
    if [t.text for t in actual]!=[t['text'] for t in expected]:
        raise ValueError('Tokenizer mismatch for '+row['id'])
    if any(t['tag'] not in tags or t['dep'] not in labels for t in expected):
        raise ValueError('Unknown gold label for '+row['id'])
train=[row for row in rows if row['split']=='train']
valid=[row for row in rows if row['split']=='validation']
if len(train)!=510 or len(valid)!=90 or len({r['text'] for r in rows})!=600:
    raise ValueError('Training and validation population mismatch')
def annotations(row):
    tokens=row['tokens']
    return {target:[t[field] for t in tokens] for target,field in [('heads','head'),('deps','dep'),('tags','tag')]}
def validate():
    totals={'tokens':0,'head':0,'las':0,'tag':0}
    for row,doc in zip(valid,nlp.pipe((row['text'] for row in valid),batch_size=32),strict=True):
        for pred,gold in zip(doc,row['tokens'],strict=True):
            if gold['pos'] in ('PUNCT','SPACE'):
                continue
            totals['tokens']+=1
            totals['head']+=pred.head.i==gold['head']
            totals['las']+=pred.head.i==gold['head'] and pred.dep_==gold['dep']
            totals['tag']+=pred.tag_==gold['tag']
    return {key:totals[key]/totals['tokens'] for key in ('head','las','tag')}|{'tokens':totals['tokens']}
def rank(metrics):
    # Validation prioritizes labeled attachment, with tag and head ties in order.
    return metrics['las'],metrics['tag'],metrics['head']
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
start=time.monotonic()
initial=validate()
history=[]
best=None
best_epoch=None
patience=0
optimizer=Adam(learn_rate=.00012,L2=.0001,grad_clip=1,use_averages=False)
nlp.resume_training(sgd=optimizer)
for epoch in range(1,args.max_epochs+1):
    shuffle=train.copy()
    rng.shuffle(shuffle)
    losses={}
    with nlp.select_pipes(enable=['tok2vec','tagger','parser']):
        for batch in minibatch(shuffle,size=12):
            examples=[Example.from_dict(nlp.make_doc(row['text']),annotations(row)) for row in batch]
            nlp.update(examples,sgd=optimizer,drop=.12,losses=losses)
    scores=validate()
    history.append({'epoch':epoch,'losses':{name:float(value) for name,value in losses.items()},'validation':scores})
    print(json.dumps(history[-1]),flush=True)
    if best is None or rank(scores)>rank(best):
        best=scores
        best_epoch=epoch
        patience=0
        nlp.meta['name']='webmeet_compact_adaptation_pilot'
        nlp.meta['description']='Compact English parser/tagger fine-tuned on 600 source-only WebMeet teacher graphs'
        nlp.to_disk(output)
    else:
        patience+=1
        if patience>=args.patience:
            break
files={str(path.relative_to(output)):digest(path) for path in sorted(output.rglob('*')) if path.is_file()}
manifest={'baseModel':base_meta,'spacy':spacy.__version__,'seed':args.seed,'trainingRows':len(train),'validationRows':len(valid),
          'maxEpochs':args.max_epochs,'patience':args.patience,'initialValidation':initial,'bestEpoch':best_epoch,
          'bestValidation':best,'epochs':history,'elapsedSeconds':time.monotonic()-start,
          'correctedGraphsSha256':hashlib.sha256(corrected).hexdigest(),'modelFiles':files,
          'modelSha256':hashlib.sha256(json.dumps(files,separators=(',',':')).encode()).hexdigest()}
(args.artifacts/'training-summary.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ('initialValidation','bestEpoch','bestValidation','elapsedSeconds','modelSha256')}),flush=True)
