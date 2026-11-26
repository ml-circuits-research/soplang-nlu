"""Reuse prior blind votes on the same exact source string and whole SOP."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

stage, dest, *archives = sys.argv[1:]
review = Path(dest)
novel = review / 'novel'
snapshot = review / 'compatible-prior-votes.json.gz'
def read_packets(path):
    return json.loads(gzip.decompress(path.read_bytes()))
def read_rows(path):
    contents = path.read_bytes()
    if path.suffix == '.gz':
        contents = gzip.decompress(contents)
    return [json.loads(line) for line in contents.splitlines() if line]
def write_gz(path, data):
    path.write_bytes(gzip.compress(json.dumps(data,ensure_ascii=False).encode(),mtime=0))
def key(row):
    return row['rowIndex'],row['group']
def fingerprint(packet, index):
    sop = '\n'.join(packet['lines'][i] for i in packet['circuits'][index])
    return hashlib.sha256(json.dumps([packet['text'],sop],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def has_stale_gate(vote):
    return vote['grade'] == 0 and re.search(r'eligib|static(?: check| gate)|marks .*unresolved',vote.get('reason',''),re.I)
def filter_packets(packets, predicate):
    result = []
    for packet in packets:
        groups = {g: i for g,i in packet['groups'].items() if predicate(packet,g,i[0])}
        if groups:
            result.append({**packet,'groups':groups})
    return result
def groups(packets):
    return [(p['rowIndex'], g, i[0]) for p in packets for g,i in p['groups'].items()]

packets = read_packets(review/'candidate-packets.json.gz')
targets = {(p['rowIndex'],g):fingerprint(p,i[0]) for p in packets for g,i in p['groups'].items()}
wanted = set(targets.values())
novel.mkdir(exist_ok=True)
if stage == 'prepare-primary':
    prior, contradictory = {}, set()
    locations = {}
    for path in map(Path,archives):
        for r in read_rows(path):
            fp = r.get('fingerprint')
            if fp not in wanted:
                continue
            if r.get('gateRecheck'):
                changed = r['gateRecheck']
                r = {**r, 'primary':changed['primary'],'independent':changed['independent'],'audit':changed['adjudicator']}
            if not r.get('primary') or not r.get('independent'):
                continue
            votes = [v for v in (r['primary'],r['independent'],r.get('audit')) if v]
            if any(has_stale_gate(v) for v in votes):
                continue
            if fp in prior and (prior[fp]['grade']==8)!=(r['grade']==8):
                contradictory.add(fp)
            if (r['primary']['grade']==8)!=(r['independent']['grade']==8) and not r.get('audit'):
                continue
            prior[fp] = r
            locations[fp] = str(path)
    for fp in contradictory:
        prior.pop(fp,None)
        locations.pop(fp,None)
    write_gz(snapshot,prior)
    work = filter_packets(packets,lambda p,g,i: targets[p['rowIndex'],g] not in prior)
    write_gz(novel/'candidate-packets.json.gz',work)
    meta={'eligibleExactCircuits':len(wanted),'compatiblePriorCircuits':len(prior),'novelCircuits':len(groups(work)),
          'conflictingPriorCircuitsRejudged':len(contradictory),
          'sourceArchiveByFingerprint':locations}
    (review/'reuse.json').write_text(json.dumps(meta,indent=2)+'\n')
    print({k:v for k,v in meta.items() if k!='sourceArchiveByFingerprint'})
    sys.exit()

prior=read_packets(snapshot)
def past(primary_or_independent, row, group):
    match = prior.get(targets[row,group])
    return match.get(primary_or_independent) if match else None
def reuse_audit(row, group):
    match = prior.get(targets[row,group])
    if match and (match['primary']['grade']==8)!=(match['independent']['grade']==8):
        return match.get('audit')
    return None
def merge(metric, expected, reuse):
    raw = novel/(metric+'.jsonl')
    raw_rows = {key(r):r for r in read_rows(raw)} if raw.exists() else {}
    output = []
    used = 0
    for row,group,index in expected:
        r = reuse(row,group)
        if r:
            used += 1
            r = {**r,'rowIndex':row,'group':group,'candidate':index if r['grade'] else None}
        else:
            r = raw_rows.pop((row,group))
        output.append(r)
    assert not raw_rows
    (review/(metric+'.jsonl')).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in output))
    print(metric,used,'reused of',len(output))

if stage=='merge-primary':
    for metric in ('primary','independent'):
        merge(metric,groups(packets),lambda row,group:past(metric,row,group))
elif stage=='prepare-audit':
    audit = read_packets(review/'audit-packets.json.gz')
    work = filter_packets(audit,lambda p,g,i: not reuse_audit(p['rowIndex'],g))
    write_gz(novel/'audit-packets.json.gz',work)
    print(len(groups(work)),'novel audits')
elif stage=='merge-audit':
    merge('audit',groups(read_packets(review/'audit-packets.json.gz')),reuse_audit)
else:
    raise ValueError('Unknown stage')
