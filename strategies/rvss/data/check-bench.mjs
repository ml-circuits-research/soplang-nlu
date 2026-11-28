// Checks that run-spacy.mjs gives what the syntax benchmark's runner gave: the circuits of the run for the messages of
// the 1% benchmark against eval-results/2026-11-27-syntax-benchmark-random/spacy.jsonl (written at 21:41 on
// 2026-11-27, after commit 0f20f16), compared as written and in the normal form; the texts decide (the sample's
// ids name rows that have moved since).
//   node strategies/rvss/data/check-bench.mjs <run.jsonl | spacy-silver.jsonl.gz>
import {createReadStream, readFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {createGunzip} from 'node:zlib'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const repo = resolve(fileURLToPath(import.meta.url), '../../../..')
const {normalForm} = await import(join(repo, 'tests/benchmark/syntax/lib.mjs'))
const file = resolve(process.argv[2])
const bench = readFileSync(join(repo, 'eval-results/2026-11-27-syntax-benchmark-random/spacy.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const want = new Map(bench.map(row => [row.text, row]))
const got = new Map()
const stream = createReadStream(file)
for await (const line of createInterface({input: file.endsWith('.gz') ? stream.pipe(createGunzip()) : stream, crlfDelay: Infinity})) {
  if (!line) continue
  const row = JSON.parse(line)
  if (want.has(row.text)) got.set(row.text, row)
}
const count = {benchmark: bench.length, found: got.size, sameWritten: 0, sameNormalForm: 0, differ: 0, examples: [], msBenchmarkMedian: null, msRunMedian: null}
for (const [text, b] of want) {
  const r = got.get(text)
  if (!r) continue
  if (r.sop === b.sop) { count.sameWritten++; count.sameNormalForm++; continue }
  if (r.sop && b.sop && normalForm(text, r.sop)?.core === normalForm(text, b.sop)?.core) { count.sameNormalForm++; continue }
  count.differ++
  if (count.examples.length < 5) count.examples.push({text, benchmark: b.sop ?? b.error, run: r.sop ?? r.error})
}
const median = values => { const s = values.filter(Number.isFinite).sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)] }
count.msBenchmarkMedian = median(bench.map(row => row.ms))
count.msRunMedian = median([...got.values()].map(row => row.ms))
console.log(JSON.stringify(count, null, 1))
