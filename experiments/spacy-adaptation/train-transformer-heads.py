"""Adapt the pretrained curated transformer listeners' task heads with fixed embeddings."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import random
import shutil
import time

import spacy
from spacy.training import Example
from spacy.util import fix_random_seed, minibatch
from spacy_curated_transformers.models.listeners import ListenerStateUtils
from spacy_curated_transformers.models.output import TransformerModelOutput
from thinc.api import Adam

parser = argparse.ArgumentParser()
parser.add_argument('artifacts', type=Path)
parser.add_argument('base_model', type=Path)
parser.add_argument('--seed', type=int, default=23187)
parser.add_argument('--max-epochs', type=int, default=8)
parser.add_argument('--patience', type=int, default=2)
args = parser.parse_args()
output = args.artifacts/'adapted-model'
if output.exists():
    raise SystemExit('Adapted checkpoint already exists')
data = (args.artifacts/'corrected-graphs.json.gz').read_bytes()
digest = lambda content: hashlib.sha256(content).hexdigest()
rows = json.loads(gzip.decompress(data))
train = [row for row in rows if row['split']=='train']
valid = [row for row in rows if row['split']=='validation']
if len(train)!=510 or len(valid)!=90 or len({row['text'] for row in rows})!=600:
    raise ValueError('Unexpected training and validation population')

fix_random_seed(args.seed)
rng = random.Random(args.seed)
nlp = spacy.load(args.base_model, exclude=['ner','textcat'])
base_name = {key:nlp.meta.get(key) for key in ('name','lang','version')}
encoder = nlp.get_pipe('transformer')
heads = [nlp.get_pipe(name) for name in ('tagger','parser')]
listeners = encoder.listeners
if len(listeners)!=len(heads) or set(encoder.listening_components)!={'tagger','parser'}:
    raise ValueError('Expected one transformer listener per task head')
if any(layer.param_names for listener in listeners for layer in listener.walk()):
    raise ValueError('Expected parameter-free listener pooling below the task heads')
encoder_before = digest(encoder.model.to_bytes())
tag_vocabulary = set(heads[0].labels)
dependency_vocabulary = set(heads[1].labels)
def source_doc(row):
    doc = nlp.make_doc(row['text'])
    if [token.text for token in doc]!=[token['text'] for token in row['tokens']]:
        raise ValueError('Tokenizer mismatch on '+row['id'])
    if any(token['tag'] not in tag_vocabulary or token['dep'] not in dependency_vocabulary
           for token in row['tokens']):
        raise ValueError('Unsupported target label on '+row['id'])
    return doc

started = time.monotonic()
embeddings = {}
for batch in minibatch(rows, size=12):
    predictions = encoder.predict([source_doc(row) for row in batch])
    if not predictions.last_layer_only:
        raise ValueError('Expected pretrained last-layer listeners')
    for row, layers in zip(batch,predictions.all_outputs,strict=True):
        embeddings[row['id']] = layers
cache_seconds = time.monotonic()-started
print(json.dumps({'cachedSources':len(embeddings),'cacheSeconds':cache_seconds}),flush=True)

def cached_predictions(batch):
    return TransformerModelOutput(outputs=[embeddings[row['id']] for row in batch],last_layer_only=True)

def annotations(row):
    return {target:[token[field] for token in row['tokens']]
            for target,field in [('heads','head'),('deps','dep'),('tags','tag')]}

def cached_docs(sample):
    for batch in minibatch(sample,size=12):
        docs = [nlp.make_doc(row['text']) for row in batch]
        encoder.set_annotations(docs,cached_predictions(batch))
        for _, pipe in nlp.pipeline[1:]:
            docs = list(pipe.pipe(docs,batch_size=12))
        yield from docs

def scores(docs):
    total = {'tokens':0,'head':0,'las':0,'tag':0}
    for row,doc in zip(valid,docs,strict=True):
        for pred,gold in zip(doc,row['tokens'],strict=True):
            if gold['pos'] in ('PUNCT','SPACE'):
                continue
            total['tokens'] += 1
            total['head'] += pred.head.i==gold['head']
            total['las'] += pred.head.i==gold['head'] and pred.dep_==gold['dep']
            total['tag'] += pred.tag_==gold['tag']
    return {k:total[k]/total['tokens'] for k in ('head','las','tag')}|{'tokens':total['tokens']}

def signature(docs):
    return [[(t.text,t.tag_,t.pos_,t.dep_,t.head.i) for t in doc] for doc in docs]

def no_encoder_backprop(*args, **kwargs):
    return []

initial = scores(cached_docs(valid))
initial_heads = [head.to_bytes(exclude=['vocab']) for head in heads]
best = initial
best_heads = initial_heads
best_epoch = 0
history = []
stale_epochs = 0
optimizer = Adam(learn_rate=.00012,L2=.0001,grad_clip=1,use_averages=False)
train_start = time.monotonic()
for epoch in range(1,args.max_epochs+1):
    order = train.copy()
    rng.shuffle(order)
    losses = {}
    for batch in minibatch(order,size=12):
        docs = [nlp.make_doc(row['text']) for row in batch]
        output_features = cached_predictions(batch)
        batch_id = ListenerStateUtils.calculate_batch_id(docs)
        for head, listener in zip(heads,listeners,strict=True):
            ListenerStateUtils.receive(listener,batch_id,output_features,no_encoder_backprop)
            examples = [Example.from_dict(doc,annotations(row)) for doc,row in zip(docs,batch,strict=True)]
            head.update(examples,sgd=optimizer,drop=.12,losses=losses)
    metrics = scores(cached_docs(valid))
    history.append({'epoch':epoch,'validation':metrics,'losses':{name:float(value) for name,value in losses.items()}})
    print(json.dumps(history[-1]),flush=True)
    if metrics['las']>best['las']:
        best = metrics
        best_epoch = epoch
        best_heads = [head.to_bytes(exclude=['vocab']) for head in heads]
        stale_epochs = 0
    else:
        stale_epochs += 1
        if stale_epochs>=args.patience:
            break

for head, snapshot in zip(heads,best_heads,strict=True):
    head.from_bytes(snapshot,exclude=['vocab'])
encoder_after = digest(encoder.model.to_bytes())
if encoder_before!=encoder_after:
    raise ValueError('Transformer encoder changed during training')
if best_epoch and not all(a!=b for a,b in zip(initial_heads,best_heads,strict=True)):
    raise ValueError('Selected epoch did not update both classification/action heads')
cached_signature = signature(cached_docs(valid))
nlp.meta['name'] = 'webmeet_transformer_heads_adaptation_pilot'
nlp.meta['description'] = 'English transformer with an untouched encoder and optionally adapted tagger/parser'
nlp.to_disk(output,exclude=['transformer'])
shutil.copytree(args.base_model/'transformer',output/'transformer')
deployed = spacy.load(output,exclude=['ner','textcat'])
live_signature = signature(deployed.pipe((row['text'] for row in valid),batch_size=12))
if live_signature!=cached_signature or digest(deployed.get_pipe('transformer').model.to_bytes())!=encoder_before:
    raise ValueError('Cached and live deployment parity failed on validation inputs')

def file_digest(path):
    with path.open('rb') as content:
        return hashlib.file_digest(content,'sha256').hexdigest()
files = {str(path.relative_to(output)):file_digest(path) for path in sorted(output.rglob('*')) if path.is_file()}
encoder_files = {name:value for name,value in files.items() if name.startswith('transformer/')}
if not encoder_files or any(file_digest(args.base_model/name)!=value for name,value in encoder_files.items()):
    raise ValueError('Deployed transformer files differ from pretrained encoder')
summary = {'baseModel':base_name,'spacy':spacy.__version__,'seed':args.seed,'trainingRows':len(train),
    'validationRows':len(valid),'initialValidation':initial,'bestEpoch':best_epoch,'bestValidation':best,'epochs':history,
    'encoderFrozen':True,'encoderModelSha256':encoder_before,'encoderFiles':encoder_files,
    'liveCacheParityRows':len(valid),'cacheSeconds':cache_seconds,'trainingAndSaveSeconds':time.monotonic()-train_start,
    'correctedGraphsSha256':digest(data),'modelFiles':files,
    'modelSha256':digest(json.dumps(files,separators=(',',':')).encode())}
(args.artifacts/'training-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({key:summary[key] for key in ('initialValidation','bestEpoch','bestValidation','modelSha256')}),flush=True)
