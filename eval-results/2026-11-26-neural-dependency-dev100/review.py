import json, pathlib, sys, subprocess, concurrent.futures
import gzip
base=pathlib.Path(__file__).parent
model=sys.argv[1]
raw=json.loads(gzip.open(base/'raw.json.gz','rt').read())
rows=[{k:v for k,v in g.items() if k != 'memberships'} for g in raw['groups']]
if len(sys.argv)>2:
    keys=set(json.loads(pathlib.Path(sys.argv[2]).read_text()))
    rows=[g for g in rows if g['key'] in keys]
axis={'type':'string','enum':['ok','wrong','na']}
axes=['predicate','boundaries','arguments','coordination']
fields={'key':{'type':'string'},'usable':{'type':'boolean'},**{name:axis for name in axes},'reason':{'type':'string'}}
schema={'type':'object','properties':{'decisions':{'type':'array','items':{'type':'object','properties':fields,'required':list(fields),'additionalProperties':False}}},'required':['decisions'],'additionalProperties':False}
schema_path=base/'schema.json'
schema_path.write_text(json.dumps(schema))
prompt=(base/'prompt.md').read_text()
out=base/model
out.mkdir(exist_ok=True)
def run(job):
    i,batch=job
    expected={g['key'] for g in batch}
    for attempt in range(3):
        final=out/f'{i:03}.{attempt}.json'
        try:
            with (out/f'{i:03}.{attempt}.log').open('w') as log:
                subprocess.run(['codex','-a','never','exec','--ephemeral','--ignore-user-config','--ignore-rules','--skip-git-repo-check','-s','read-only','-C',str(base),'--color','never','-m',model,'-c','model_reasoning_effort="low"','--output-schema',str(schema_path),'-o',str(final),'-'],input=prompt+'\nPackets:\n'+json.dumps(batch,ensure_ascii=False),text=True,stdout=log,stderr=subprocess.STDOUT,timeout=150,check=True)
            decisions=json.loads(final.read_text())['decisions']
            assert {r['key'] for r in decisions} == expected and len(decisions)==len(expected)
            assert all(r['usable']==all(r[n]!='wrong' for n in axes) and r['reason'].strip() for r in decisions)
            print(model,i,len(decisions),flush=True)
            return decisions
        except (AssertionError,ValueError,KeyError,OSError,subprocess.SubprocessError) as e:
            print(model,i,attempt,type(e).__name__,str(e),flush=True)
    raise RuntimeError(f'Unreviewed batch {i}')
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    values=[r for batch in pool.map(run,enumerate(rows[i:i+12] for i in range(0,len(rows),12))) for r in batch]
(base/(model+'.json')).write_text(json.dumps(values,ensure_ascii=False,indent=2)+'\n')
