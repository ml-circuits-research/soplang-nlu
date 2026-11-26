"""Reassemble per-rank outputs in the exact order of the original split."""
import gzip, hashlib, json, sys
from collections import Counter
from pathlib import Path

original, work = map(Path,sys.argv[1:3])
parts=int(sys.argv[3])
def load(p):
    with gzip.open(p,'rt') as stream:return [json.loads(line) for line in stream if line.strip()]
report={'counts':{},'splits':{}}
counts=Counter()
for i in range(parts):
    with (work/f'part-{i}.log').open() as stream:
        manifest=json.loads(stream.read().strip().splitlines()[-1])
    if manifest['rank']!=i:raise ValueError('Shard identity mismatch')
    counts.update(manifest['counts'])
    for split,sha in manifest['digest'].items():
        if hashlib.sha256((work/f'{split}-{i}.jsonl.gz').read_bytes()).hexdigest()!=sha:
            raise ValueError('Changed hint shard')
report['counts']=dict(counts)
for split in ['train','dev','study']:
    expected=load(original/f'{split}.jsonl.gz')
    observed=[r for i in range(parts) for r in load(work/f'{split}-{i}.jsonl.gz')]
    by_text={r['text']:r for r in observed}
    if len(observed)!=len(expected) or len(by_text)!=len(expected):raise ValueError('Incomplete split')
    ordered=[]
    for gold in expected:
        hinted=by_text[gold['text']]
        if any(hinted[key]!=value for key,value in gold.items()):raise ValueError('Ground truth or source drift')
        ordered.append(hinted)
    path=work/f'{split}.jsonl.gz'
    payload=gzip.compress((''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in ordered)).encode(),mtime=0)
    with path.open('xb') as output:output.write(payload)
    report['splits'][split]={'rows':len(ordered),'withDraft':sum(bool(r['draftNodes']) for r in ordered),
        'sha256':hashlib.sha256(payload).hexdigest()}
(work/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
