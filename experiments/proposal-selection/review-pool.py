"""Prepare blinded singleton reviews and reconcile exact pool-SOP judgments."""
import argparse
import collections
import gzip
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('stage', choices=['plan','audit','seal'])
parser.add_argument('cohort', type=Path)
parser.add_argument('prior', nargs='*', type=Path)
args = parser.parse_args()
work = args.cohort/'review'
work.mkdir(exist_ok=True)
def jsonl(path):
    if path.suffix=='.gz':
        with gzip.open(path,'rt') as stream:
            return [json.loads(line) for line in stream if line.strip()]
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
def encode(item):
    return json.dumps(item,ensure_ascii=False,separators=(',',':'))
def archive(path,item):
    path.write_bytes(gzip.compress(encode(item).encode(),mtime=0))
def read_archive(path):
    return json.loads(gzip.decompress(path.read_bytes()))
def write_json(name,item):
    (work/name).write_text(json.dumps(item,indent=2)+'\n')
def sha(data):
    return hashlib.sha256(data.encode()).hexdigest()
def normalize(sop):
    return sop.replace('\r\n','\n').replace('\r','\n').strip()
def fingerprint(source,sop):
    return sha(encode([source,normalize(sop)]))
def key(row):
    return row['rowIndex'],row['group']
def accept(grade):
    return grade==8
def restrict(packets,target_keys):
    selected=[]
    for packet in packets:
        groups={group:indices for group,indices in packet['groups'].items()
                if (packet['rowIndex'],group) in target_keys}
        if groups:
            selected.append(packet|{'groups':groups})
    return selected
def read_votes(path,expected):
    result={}
    for record in jsonl(path):
        k=key(record)
        target=expected.get(k)
        if (target is None or k in result or record['grade'] not in (0,1,3,4,5,6,7,8) or
            record['candidate']!=(None if record['grade']==0 else target['candidate']) or
            not isinstance(record['reason'],str) or not record['reason'].strip()):
            raise ValueError('Invalid singleton vote in '+str(path))
        result[k]=record
    if result.keys()!=expected.keys():
        raise ValueError('Review does not cover all expected exact circuits in '+str(path))
    return result

if args.stage=='plan':
    pool_path=args.cohort/'pool.jsonl.gz'
    pool=jsonl(pool_path)
    expected=jsonl(args.cohort/'sources.jsonl.gz')
    if [(row['id'],row['text']) for row in pool]!=[(row['id'],row['text']) for row in expected]:
        raise ValueError('Pool differs from frozen model inputs')
    if len({row['id'] for row in pool})!=len(pool):
        raise ValueError('Pool repeats input IDs')
    known={}
    disagreements=0
    for prior in args.prior:
        for row in jsonl(prior/'candidate-decisions.jsonl.gz'):
            if 'gateRecheck' in row:
                corrected=row['gateRecheck']
                row=row|{'primary':corrected['primary'],'independent':corrected['independent'],'audit':corrected['adjudicator']}
            if not isinstance(row.get('primary'),dict) or not isinstance(row.get('independent'),dict):
                continue
            old=known.get(row['fingerprint'])
            if old and accept(old['grade'])!=accept(row['grade']):
                disagreements+=1
            known[row['fingerprint']]=row
    packets=[]
    targets=[]
    by_fingerprint=set()
    originals=[]
    families=collections.Counter()
    eligible_families=collections.Counter()
    for index,row in enumerate(pool):
        if not isinstance(row['candidates'],list):
            raise ValueError('Invalid row candidate array')
        exact=set()
        for candidate in row['candidates']:
            fam,rank,sop,eligible=(candidate[name] for name in ('family','rank','sop','eligible'))
            if type(rank) is not int or rank<0 or not isinstance(sop,str) or not sop.strip() or type(eligible) is not bool:
                raise ValueError('Invalid sealed candidate')
            families[fam]+=1
            eligible_families[fam]+=eligible
            if eligible:
                exact.add(sop)
        originals.extend({'id':row['id'],'sop':sop,'fingerprint':fingerprint(row['text'],sop)} for sop in sorted(exact))
        circuits=[]
        for candidate in sorted(set(map(normalize,exact))):
            fp=fingerprint(row['text'],candidate)
            if fp not in by_fingerprint:
                circuits.append(candidate)
                by_fingerprint.add(fp)
        lines=[]
        line_indices={}
        packed=[]
        for i,circuit in enumerate(circuits):
            indices=[]
            for line in circuit.split('\n'):
                if line not in line_indices:
                    line_indices[line]=len(lines)
                    lines.append(line)
                indices.append(line_indices[line])
            packed.append(indices)
            fp=fingerprint(row['text'],circuit)
            targets.append({'rowIndex':index,'group':str(i),'candidate':i,'fingerprint':fp})
        if circuits:
            packets.append({'rowIndex':index,'text':row['text'],'references':[],'lines':lines,'circuits':packed,
                            'groups':{str(i):[i] for i in range(len(circuits))},'staticJudgments':{}})
    reuse={target['fingerprint']:known[target['fingerprint']] for target in targets if target['fingerprint'] in known}
    novel={key(target) for target in targets if target['fingerprint'] not in reuse}
    archive(work/'all-packets.json.gz',packets)
    archive(work/'candidate-packets.json.gz',restrict(packets,novel))
    archive(work/'targets.json.gz',targets)
    archive(work/'exact-membership.json.gz',originals)
    archive(work/'reused.json.gz',reuse)
    manifest={'messages':len(pool),'publicFamilies':dict(families),'eligibleFamilies':dict(eligible_families),
              'distinctExactTargets':len(targets),'eligibleIdCircuitPairs':len(originals),
              'novel':len(novel),'reused':len(reuse),'priorThresholdConflicts':disagreements,
              'poolSha256':hashlib.sha256(pool_path.read_bytes()).hexdigest()}
    write_json('plan.json',manifest)
    print(json.dumps(manifest))
else:
    all_targets=read_archive(work/'targets.json.gz')
    target_by_key={key(target):target for target in all_targets}
    reused=read_archive(work/'reused.json.gz')
    fresh={k:target for k,target in target_by_key.items() if target['fingerprint'] not in reused}
    primary=read_votes(work/'primary.jsonl',fresh)
    independent=read_votes(work/'independent.jsonl',fresh)
    if args.stage=='audit':
        disagreements=[target for k,target in fresh.items() if accept(primary[k]['grade'])!=accept(independent[k]['grade'])]
        agreements={True:[],False:[]}
        for k,target in fresh.items():
            if accept(primary[k]['grade'])==accept(independent[k]['grade']):
                agreements[accept(primary[k]['grade'])].append(target)
        selected=[{**target,'stratum':'threshold disagreement'} for target in disagreements]
        for label,items in agreements.items():
            ordered=sorted(items,key=lambda target:sha('selector-blind-audit-v1\0'+target['fingerprint']))
            selected.extend({**target,'stratum':'agreed accept' if label else 'agreed reject'} for target in ordered[:20])
        archive(work/'audit-packets.json.gz',restrict(read_archive(work/'all-packets.json.gz'),{key(t) for t in selected}))
        write_json('audit-selection.json',selected)
        print(json.dumps({'novelThresholdDisagreements':len(disagreements),'novelAgreementAudit':len(selected)-len(disagreements)}))
    else:
        audit_targets={key(item):item for item in json.loads((work/'audit-selection.json').read_text())}
        audit=read_votes(work/'audit.jsonl',audit_targets) if audit_targets else {}
        decisions={}
        cases=collections.Counter()
        for k,target in target_by_key.items():
            fp=target['fingerprint']
            if fp in reused:
                prior=reused[fp]
                decisions[fp]={**target,'grade':prior['grade'],'reason':prior['reason'],
                               'primary':prior['primary'],'independent':prior['independent'],'audit':prior.get('audit'),
                               'reused':True}
                continue
            a,b,c=primary[k],independent[k],audit.get(k)
            if accept(a['grade'])!=accept(b['grade']):
                if c is None:
                    raise ValueError('Missing independent adjudication')
                cases['disagreements']+=1
                settled=c
            else:
                settled=a
                if c:
                    cases['agreementChecks']+=1
                    cases['agreementContradictions']+=accept(a['grade'])!=accept(c['grade'])
            decisions[fp]={**target,'grade':settled['grade'],'reason':settled['reason'],
                           'primary':a,'independent':b,'audit':c,'reused':False}
        output=[{'id':item['id'],'sop':item['sop'],'accepted':accept(decisions[item['fingerprint']]['grade'])}
                for item in read_archive(work/'exact-membership.json.gz')]
        packed=gzip.compress(('\n'.join(map(encode,output))+'\n').encode(),mtime=0)
        draw=read_archive(work/'exact-membership.json.gz')
        accepted_fingerprints={fp for fp,decision in decisions.items() if accept(decision['grade'])}
        totals={'distinctReviewedTargets':len(decisions),'acceptedDistinctTargets':len(accepted_fingerprints),
                'eligibleIdCircuitPairs':len(output),'acceptedPoolRows':len({item['id'] for item in output if item['accepted']}),
                'acceptedPoolPairs':sum(item['accepted'] for item in output),'review':dict(cases),
                'votesSha256':hashlib.sha256(packed).hexdigest()}
        if len(draw)!=len(output):
            raise ValueError('Vote coverage differs from the planned pool')
        (work/'candidate-decisions.jsonl.gz').write_bytes(gzip.compress(
            ('\n'.join(map(encode,decisions.values()))+'\n').encode(),mtime=0))
        write_json('summary.json',totals)
        (args.cohort/'votes.jsonl.gz').write_bytes(packed)
        print(json.dumps(totals))
