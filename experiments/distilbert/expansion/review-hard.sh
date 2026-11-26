#!/usr/bin/env bash
set -euo pipefail
work=$1
root=$(cd "$(dirname "$0")/../../.." && pwd)
driver="$root/experiments/proposal-selection/review-pool.py"
reviewer="$root/tests/benchmark/meaning-review/run-review.py"
python3 "$driver" plan "$work"
review_pass() {
  local packet=$1 pass=$2 model=$3
  python3 "$reviewer" "$work/review/$packet-packets.json.gz" "$work/review/$pass.jsonl" \
    --profile native --model "$model" --jobs "${REVIEW_JOBS:-8}" --rows 8 --groups 8 --characters 36000 --expanded \
    >"$work/$pass.log" 2>&1
}
review_pass candidate primary gpt-6.1-terra & terra=$!
review_pass candidate independent gpt-6.2-sol & sol=$!
wait "$terra"
wait "$sol"
python3 "$driver" audit "$work"
review_pass audit audit gpt-6.1-sol
python3 "$driver" seal "$work"
python3 - "$work" <<'PY'
import gzip
import hashlib
import json
from pathlib import Path
import sys

work=Path(sys.argv[1])
def rows(path):
    with gzip.open(path,'rt') as source:
        return [json.loads(line) for line in source if line.strip()]
pool=rows(work/'pool.jsonl.gz')
votes=rows(work/'votes.jsonl.gz')
by_pair={(row['id'],row['sop']):row['accepted'] for row in votes}
expected={(row['id'],candidate['sop']) for row in pool for candidate in row['candidates'] if candidate['eligible']}
assert len(by_pair)==len(votes) and set(by_pair)==expected
accepted=[{key: row[key] for key in ('id','text')}|{'sop':candidate['sop']}
          for row in pool for candidate in row['candidates'] if candidate['eligible'] and by_pair[(row['id'],candidate['sop'])]]
payload=gzip.compress((''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in accepted)).encode(),mtime=0)
with (work/'accepted-supervision.jsonl.gz').open('xb') as output:
    output.write(payload)
summary=json.loads((work/'review/summary.json').read_text())
with (work/'accepted-manifest.json').open('x') as output:
    json.dump(dict(accepted=len(accepted),samples=len(pool),sha256=hashlib.sha256(payload).hexdigest(),
                   selectionSha256=hashlib.sha256((work/'selection.json').read_bytes()).hexdigest(),
                   teacher=json.loads((work/'pool.jsonl.gz.timing.json').read_text()),review=summary),output,indent=2)
    output.write('\n')
print('Accepted hard-case training pairs:',len(accepted))
PY
