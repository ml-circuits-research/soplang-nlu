import sys,json,gzip,time
from pathlib import Path
import spacy
from spacy.tokens import Doc
model,source,out=sys.argv[1:]
nlp=spacy.load(model,exclude=['ner','textcat'])
rows=json.load(gzip.open(source))
parser=nlp.get_pipe('parser')
results=[]
for row in rows:
 text=row['text']
 start=time.perf_counter()
 doc=nlp(text)
 greedy_ms=(time.perf_counter()-start)*1000
 base=[]
 units=[0]
 for c in text: units.append(units[-1]+(2 if ord(c)>0xffff else 1))
 for w in doc:
  base.append(dict(i=w.i,text=w.text,start=units[w.idx],end=units[w.idx+len(w)],pos=w.pos_,tag=w.tag_,dep=w.dep_,head=w.head.i,lemma=w.lemma_))
 # A parser state must start without the greedy sentence-boundary decisions.
 # Preserve the tensor/features already encoded by the pretrained model.
 before=nlp.make_doc(text)
 before.tensor=doc.tensor
 if doc.has_extension('trf_data'): before._.trf_data=doc._.trf_data
 for a,b in zip(before,doc):a.tag=b.tag
 start=time.perf_counter()
 beam=parser.beam_parse([before],beam_width=8,beam_density=0.0001)[0]
 options=[]
 for prob,arcs in parser.moves.get_beam_parses(beam):
  tokens=[dict(t,dep='ROOT',head=t['i']) for t in base]
  for h,i,dep in arcs:tokens[i]['head']=h;tokens[i]['dep']=dep
  key=[(t['head'],t['dep']) for t in tokens]
  if any(key==k for k,_,_ in options):continue
  options.append((key,prob,tokens))
  if len(options)>=3:break
 results.append(dict(id=row['id'],text=text,base=base,options=[dict(score=s,tokens=t) for _,s,t in options],greedyMs=greedy_ms,beamMs=(time.perf_counter()-start)*1000))
with gzip.open(out,'wt') as stream:json.dump(results,stream,ensure_ascii=False)
print(len(rows),sum(len(r['options']) for r in results),sum(r['beamMs'] for r in results))
