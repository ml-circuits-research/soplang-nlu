// Gold and silver labels of the dataset, the benchmark's 1,831 messages left out, split by a hash of
// the text into train (90%) and dev (10%).   node split.mjs
// Writes data/gold-train.jsonl, data/gold-dev.jsonl, data/silver-train.jsonl, data/silver-dev.jsonl,
// data/bench.jsonl (the benchmark messages), data/split-counts.json
import {createHash} from 'node:crypto'
import {writeFileSync, mkdirSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const here = new URL('.', import.meta.url).pathname
mkdirSync(here + 'data', {recursive: true})
const bench = readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz')
const benchTexts = new Set(bench.map(row => row.text))
// the same text with other spacing or case is also left out
const squash = text => text.toLowerCase().replace(/\s+/gu, ' ').trim()
const benchSquashed = new Set(bench.map(row => squash(row.text)))
export const isDev = text => createHash('sha1').update(text).digest()[0] % 10 === 0
const labels = readLabels()
const out = {'gold-train': [], 'gold-dev': [], 'silver-train': [], 'silver-dev': []}
const counts = {labels: labels.size, benchmarkLeftOut: 0, benchmarkLeftOutBySpacingOrCase: 0, invalid: 0, byAcceptedBy: {}}
for (const [text, line] of labels) {
  counts.byAcceptedBy[line.accepted_by] = (counts.byAcceptedBy[line.accepted_by] ?? 0) + 1
  if (benchTexts.has(text)) { counts.benchmarkLeftOut++; continue }
  if (benchSquashed.has(squash(text))) { counts.benchmarkLeftOutBySpacingOrCase++; continue }
  const kind = line.accepted_by === 'judge' || line.accepted_by === 'written' ? 'gold' : line.accepted_by === 'agreement' ? 'silver' : null
  if (!kind) continue
  if (!line.core) { counts.invalid++; continue }
  out[kind + '-' + (isDev(text) ? 'dev' : 'train')].push({text, sop: line.label, accepted_by: line.accepted_by, source: line.source})
}
for (const [name, rows] of Object.entries(out)) {
  writeFileSync(here + 'data/' + name + '.jsonl', rows.map(row => JSON.stringify(row)).join('\n') + '\n')
  counts[name] = rows.length
}
writeFileSync(here + 'data/bench.jsonl', bench.map(row => JSON.stringify(row)).join('\n') + '\n')
writeFileSync(here + 'data/split-counts.json', JSON.stringify(counts, null, 2))
console.log(counts)
