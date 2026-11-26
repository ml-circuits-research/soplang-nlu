import gzip,json,sys,pathlib
mode, stage, compact_review, transformer_review = sys.argv[1:]
base=pathlib.Path(compact_review)/'novel'
peer=pathlib.Path(transformer_review)/'novel'
assert stage in ('candidate','audit')
fn=stage+'-packets.json.gz'
def pk(path):return json.loads(gzip.decompress(path.read_bytes()))
def identity(r,i):return r['text'],'\n'.join(r['lines'][x] for x in r['circuits'][i])
a,b=[pk(d/fn) for d in (base,peer)]
index={identity(r,v[0]):(r['rowIndex'],g) for r in a for g,v in r['groups'].items()}
pairs={}; remainder=[]
for r in b:
 groups={}
 for g,v in r['groups'].items():
  exact=identity(r,v[0])
  if exact in index:pairs[(r['rowIndex'],g)]=(index[exact], v[0])
  else:groups[g]=v
 if groups:remainder.append(r|{'groups':groups})
if mode=='plan':
 (peer/'deduplicated-packets.json.gz').write_bytes(gzip.compress(json.dumps(remainder,ensure_ascii=False).encode(),mtime=0))
 print(len(pairs), 'shared novel')
else:
 for name in ('audit',) if stage == 'audit' else ('primary','independent'):
  def load(d):return {(r['rowIndex'],r['group']):r for r in map(json.loads,(d/(name+'.jsonl')).read_text().splitlines())}
  lookup,own=load(base),load(peer)
  for (row,group),(src,candidate) in pairs.items():
   old=lookup[src]
   own[row,group]=old|dict(rowIndex=row,group=group,candidate=candidate if old['grade'] else None)
  (peer/(name+'.jsonl')).write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in own.values()))
