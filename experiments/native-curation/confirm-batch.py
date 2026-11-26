"""Confirm one curated batch and commit its evidence and native reference shard."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor

parser=argparse.ArgumentParser()
parser.add_argument('inventory',type=Path)
parser.add_argument('number',type=int)
parser.add_argument('dataset',type=Path)
parser.add_argument('--prior',action='append',type=Path,default=[])
parser.add_argument('--jobs',type=int,default=6)
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
inventory=args.inventory.resolve()
dataset=args.dataset.resolve()
manifest=json.loads((inventory/'manifest.json').read_text())
group=next(g for g in manifest['groups'] if int(g['number'])==args.number)
if group['usage']!='development': raise ValueError('Reserved test sources are excluded from development publication')
number=group['number']
work=inventory/'work'/number
logical=work/'logical-00000'
if not (work/'summary.json').is_file(): raise ValueError('Curation has not finished')
source=inventory/group['file']
if hashlib.sha256(source.read_bytes()).hexdigest()!=group['sha256']: raise ValueError('Input batch changed')
knowledge=Path(os.environ['SOP_KNOWLEDGE_DIR'])
verify=work/'confirmation'
verify.mkdir(exist_ok=True)
review=verify/'review'
tool=root/'experiments/native-teacher/curation-review-data.mjs'
reviewer=root/'tests/benchmark/meaning-review/run-review.py'
decider=root/'experiments/proposal-selection/review-pool.py'
archive=root/'eval-results/2026-11-26-sol-native-curation'/number
def run(argv,log=None):
    subprocess.run([str(x) for x in argv],check=True,cwd=root,stdout=log,stderr=log)
def pass_once(stage,model):
    if (review/(stage+'.jsonl')).is_file():return
    packets=('audit' if stage=='audit' else 'candidate')+'-packets.json.gz'
    with (verify/(stage+'.log')).open('a') as log:
        run(['python3',reviewer,review/packets,review/(stage+'.jsonl'),'--profile','native','--model',model,
             '--jobs',args.jobs,'--rows','15','--groups','24','--characters','42000','--expanded'],log)
def commit(repo,paths,message):
    run(['git','-C',repo,'add','--',*paths])
    result=subprocess.run(['git','-C',repo,'diff','--cached','--quiet','--',*paths])
    if result.returncode==1:run(['git','-C',repo,'commit','--only','-m',message,'--',*paths])
    elif result.returncode:raise RuntimeError('Could not check pending batch commit')

with (work/'confirmation.lock').open('a') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    if not (verify/'pool.jsonl.gz').exists():run(['node',tool,'prepare',logical,verify,knowledge])
    if not (review/'plan.json').exists():run(['python3',decider,'plan',verify,*args.prior])
    if not (review/'candidate-decisions.jsonl.gz').exists():
        with ThreadPoolExecutor(max_workers=2) as executor:
            jobs=[executor.submit(pass_once,'primary','gpt-6.1-terra'),executor.submit(pass_once,'independent','gpt-6.2-sol')]
            for job in jobs:job.result()
        run(['python3',decider,'audit',verify])
        pass_once('audit','gpt-6.1-sol')
        run(['python3',decider,'seal',verify])
    if not (verify/'curation-review-summary.json').exists():run(['node',tool,'accept',logical,verify,knowledge])
    archive.mkdir(parents=True,exist_ok=True)
    for directory,files in [(work,['manifest.json']), (logical,['records.jsonl.gz']),
        (review,['candidate-decisions.jsonl.gz','audit-selection.json']),
        (verify,['accepted.jsonl.gz','rework.jsonl.gz','votes.jsonl.gz','curation-review-summary.json'])]:
        for name in files:shutil.copyfile(directory/name,archive/name)
    with (inventory/'publication.lock').open('a') as publish_lock:
        fcntl.flock(publish_lock,fcntl.LOCK_EX)
        commit(root,[archive.relative_to(root)],'Archive Sol native syntax review for batch '+number)
        shard='2026-11-26-sol-'+number
        path=Path('annotations/nlu/v1/batches')/(shard+'.jsonl')
        if not (dataset/path).exists():
            run(['node',root/'experiments/native-curation/publish-reviewed.mjs',dataset,archive,
                archive/'accepted.jsonl.gz',archive/'candidate-decisions.jsonl.gz',shard,
                manifest['sourceRevision'],'gpt-6-sol'])
        if (dataset/path).exists():commit(dataset,[path],'Publish reviewed native syntax for Sol batch '+number)
        committed=[]
        if (dataset/path).exists():
            content=subprocess.check_output(['git','-C',dataset,'show','HEAD:'+str(path)])
            committed=[json.loads(line) for line in content.splitlines() if line]
        receipt={'batch':number,'sourceRevision':manifest['sourceRevision'],
                 'confirmed':json.loads((verify/'curation-review-summary.json').read_text()),
                 'publishedSources':len(committed),'publishedCircuits':sum(len(r['readings']) for r in committed),
                 'datasetCommit':subprocess.check_output(['git','-C',dataset,'rev-parse','HEAD'],text=True).strip()}
        (work/'published.json').write_text(json.dumps(receipt,indent=2)+'\n')
