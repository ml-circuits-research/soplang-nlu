"""Blind, minimal teacher correction of permitted training graphs."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('artifacts', type=Path)
parser.add_argument('student')
parser.add_argument('--jobs',type=int,default=8)
parser.add_argument('--rows',type=int,default=16)
parser.add_argument('--model',default='gpt-6-sol')
args = parser.parse_args()
directory = args.artifacts.resolve()
from spacy import load
student = load(args.student,exclude=['ner','textcat'])
labels = set(student.get_pipe('parser').labels)
tags = set(student.get_pipe('tagger').labels)
graphs = json.loads(gzip.decompress((directory/'teacher-graphs.json.gz').read_bytes()))
rows = graphs['graphs']
work = directory/'teacher-batches'
work.mkdir(exist_ok=True)
prompt = Path(__file__).with_name('teacher-prompt.md').read_text()
prompt += '\nAllowed dependency labels: '+', '.join(sorted(labels))
prompt += '\nAllowed fine tags: '+', '.join(sorted(tags))
edit_fields={'i':{'type':'integer'},'head':{'type':'integer'},'dep':{'type':'string'},'tag':{'type':'string'}}
def schema(fields):
    return {'type':'object','properties':fields,'required':list(fields),'additionalProperties':False}
def array(items):
    return {'type':'array','items':items}
record_fields={'key':{'type':'integer'},'edits':array(schema(edit_fields)),'reason':{'type':'string'}}
schema_path=work/'schema.json'
schema_path.write_text(json.dumps(schema({'rows':array(schema(record_fields))})))

def corrected(tokens, edits):
    replaced = {}
    edited_indices = set()
    for edit in edits:
        index, target, dep, tag = (edit[name] for name in ('i','head','dep','tag'))
        if (type(index) is not int or type(target) is not int or not 0<=index<len(tokens) or
            not 0<=target<len(tokens) or index in edited_indices or dep not in labels or tag not in tags):
            raise ValueError('Unknown edited index, head, dependency label or fine tag')
        edited_indices.add(index)
        original = tokens[index]
        if (target,dep,tag)==(original['head'],original['dep'],original['tag']):
            continue
        replaced[index] = dict(original,head=target,dep=dep,tag=tag)
    result=[replaced.get(i,token) for i,token in enumerate(tokens)]
    for i,token in enumerate(result):
        if token['i']!=i or token['dep'] not in labels or token['tag'] not in tags:
            raise ValueError('Unsupported original or edited label/index')
        if not 0<=token['head']<len(tokens) or (token['head']==i)!=(token['dep']=='ROOT'):
            raise ValueError('Root has nonself head or a nonroot points to itself')
        visited=set()
        cursor=i
        while result[cursor]['head']!=cursor:
            if cursor in visited:
                raise ValueError('Dependency cycle')
            visited.add(cursor)
            cursor=result[cursor]['head']
    return result,len(replaced)

def packet(index):
    row=rows[index]
    return {'key':index,'text':row['text'],
            'edges':[[t[k] for k in ('i','text','pos','tag','dep','head')] for t in row['tokens']]}

def run(index):
    indices=list(range(index,min(index+args.rows,len(rows))))
    remaining=indices
    decisions={}
    feedback=''
    for attempt in range(1,4):
        output=work/f'{index}.{attempt}.json'
        try:
            with (work/f'{index}.{attempt}.log').open('w') as log:
                subprocess.run(['codex','-a','never','exec','--ephemeral','--ignore-user-config','--ignore-rules',
                    '--skip-git-repo-check','-s','read-only','-C',str(work),'--color','never','-m',args.model,
                    '-c','model_reasoning_effort="low"','--output-schema',str(schema_path),'-o',str(output),'-'],
                    input=prompt+'\n'+feedback+'\n'+json.dumps([packet(i) for i in remaining],ensure_ascii=False),
                    text=True,stdout=log,stderr=subprocess.STDOUT,timeout=180,check=True)
            accepted=json.loads(output.read_text())['rows']
            if len(accepted)!=len(remaining) or {r['key'] for r in accepted}!=set(remaining):
                raise ValueError('Unexpected or missing keys')
            failures={}
            for verdict in accepted:
                key=verdict['key']
                try:
                    result,count=corrected(rows[key]['tokens'],verdict['edits'])
                    if not verdict['reason'].strip():
                        raise ValueError('Missing correction rationale')
                    decisions[key]={**rows[key],'tokens':result,'teacher':{**verdict,'acceptedEdits':count,'status':'reviewed'}}
                except ValueError as error:
                    failures[key]=str(error)
            remaining=[key for key in remaining if key not in decisions]
            if not remaining:
                break
            feedback='Earlier edits were invalid on these keys. Correct them or use an empty edit list: '+json.dumps(failures)
        except (ValueError,KeyError,TypeError,OSError,subprocess.SubprocessError) as error:
            feedback='The response failed to validate: '+str(error)
    for key in remaining:
        original,_=corrected(rows[key]['tokens'],[])
        decisions[key]={**rows[key],'tokens':original,
                        'teacher':{'key':key,'edits':[],'reason':feedback,'acceptedEdits':0,'status':'fallback'}}
    print(f'{index}: {len(indices)} rows, {len(remaining)} fallback',flush=True)
    return [decisions[key] for key in indices]

# Package compatibility must hold on the untouched source graphs too.
for row in rows:
    corrected(row['tokens'],[])
start=time.monotonic()
with ThreadPoolExecutor(max_workers=args.jobs) as pool:
    result=[row for batch in pool.map(run,range(0,len(rows),args.rows)) for row in batch]
compressed=gzip.compress(json.dumps(result,ensure_ascii=False,separators=(',',':')).encode(),mtime=0)
(directory/'corrected-graphs.json.gz').write_bytes(compressed)
manifest={'reviewer':args.model,'rows':len(result),'changedRows':sum(row['teacher']['acceptedEdits']>0 for row in result),
          'fallbackRows':sum(row['teacher']['status']=='fallback' for row in result),
          'editedTokens':sum(row['teacher']['acceptedEdits'] for row in result),'elapsedSeconds':time.monotonic()-start,
          'promptSha256':hashlib.sha256(prompt.encode()).hexdigest(),
          'correctionSha256':hashlib.sha256(compressed).hexdigest()}
(directory/'teacher-summary.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest),flush=True)
