import gzip
import hashlib
import json
import os
from pathlib import Path
import sys

stage, review_name, *baseline_names = sys.argv[1:]
review = Path(review_name)
baselines = map(Path,baseline_names)
def archived(path):
    return json.loads(gzip.decompress(path.read_bytes()))
def jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
def key(row):
    return row['rowIndex'],row['group']
def fingerprint(packet, indices):
    candidate, = indices
    lines = packet['circuits'][candidate]
    sop = '\n'.join(packet['lines'][line] for line in lines)
    return hashlib.sha256(json.dumps([packet['text'],sop],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def archive_filtered(output, packets, selector):
    selected = []
    for packet in packets:
        groups = {g:i for g,i in packet['groups'].items() if selector(packet,g,i)}
        if groups:
            selected.append({**packet,'groups':groups})
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_bytes(gzip.compress(json.dumps(selected,separators=(',',':'),ensure_ascii=False).encode(),mtime=0))
    return sum(len(p['groups']) for p in selected)
old = {}
precedence_conflicts = []
for baseline in baselines:
    with gzip.open(baseline/'candidate-decisions.jsonl.gz','rt') as records:
        for record in map(json.loads,records):
            if 'gateRecheck' in record:
                recheck = record['gateRecheck']
                record = {**record,'primary':recheck['primary'],'independent':recheck['independent'],'audit':recheck['adjudicator']}
            if record['fingerprint'] in old:
                duplicate = old[record['fingerprint']]
                if (duplicate['grade']==8)!=(record['grade']==8):
                    if not os.environ.get('HISTORICAL_TRF_PRECEDENCE'):
                        raise ValueError('Prior consensus changed for '+record['fingerprint'])
                    precedence_conflicts.append(record['fingerprint'])
            old[record['fingerprint']] = record

if precedence_conflicts:
    print(len(set(precedence_conflicts)), 'exact prior decisions differ across archives; later listed historical archives take precedence')
    (review/'historical-precedence-conflicts.json').write_text(json.dumps(sorted(set(precedence_conflicts)),indent=2)+'\n')
packets = archived(review/'candidate-packets.json.gz')
novel_dir = review/'novel'
target = {(p['rowIndex'],g):(fingerprint(p,i),i[0]) for p in packets for g,i in p['groups'].items()}
def eligible_prior_audit(k):
    prior = old.get(target[k][0])
    if prior and (prior['primary']['grade']==8)!=(prior['independent']['grade']==8):
        return prior['audit']
    return None
def merge(name, keys, get_prior):
    path = novel_dir/(name+'.jsonl')
    novel = {key(row):row for row in jsonl(path)} if path.exists() else {}
    output = []
    reused = 0
    for k in keys:
        prior = get_prior(k)
        if prior:
            row = {**prior,'rowIndex':k[0],'group':k[1],'candidate':target[k][1] if prior['grade'] else None}
            reused += 1
        else:
            row = novel.pop(k)
        output.append(row)
    if novel:
        raise ValueError('Unexpected novel targets in '+name)
    (review/(name+'.jsonl')).write_text(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in output))
    print(name,reused,'reused out of',len(keys))
match stage:
    case 'prepare-primary':
        reserved_path = os.environ.get('RESERVED_CANDIDATE_PACKETS')
        reserved = {fingerprint(p,i) for p in archived(Path(reserved_path)) for i in p['groups'].values()} if reserved_path else set()
        blocked = set(old) | reserved
        print(archive_filtered(novel_dir/'candidate-packets.json.gz',packets,lambda p,g,i:fingerprint(p,i) not in blocked),'novel')
        current = {fp for fp,_ in target.values()}
        print(len(current & reserved), 'current identities also queued for transformer; consolidating after it seals')
    case 'merge-primary':
        for name in ('primary','independent'):
            merge(name,target.keys(),lambda k:old.get(target[k][0],{}).get(name))
    case 'prepare-audit':
        audit = archived(review/'audit-packets.json.gz')
        print(archive_filtered(novel_dir/'audit-packets.json.gz',audit,lambda p,g,i:not eligible_prior_audit((p['rowIndex'],g))),'novel audit')
    case 'merge-audit':
        audit = archived(review/'audit-packets.json.gz')
        merge('audit',[(p['rowIndex'],g) for p in audit for g in p['groups']],eligible_prior_audit)
    case _:
        raise ValueError('Unknown stage')
