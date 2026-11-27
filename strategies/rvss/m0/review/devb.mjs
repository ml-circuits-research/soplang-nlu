// How unseen is dev-B? Share of held-out texts with a training text at most one word substitution away,
// for the design's split (sha1 of the file name) and for a split by file stem (scenes-13.01 -> scenes-13).
import {createHash} from 'node:crypto'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const norm = t => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => r.text.toLowerCase().replace(/\s+/gu, ' ').trim()))
const labels = readLabels()
const rows = [...labels].filter(([t]) => !bench.has(t.toLowerCase().replace(/\s+/gu, ' ').trim())).map(([t]) => ({t, file: labels.files.get(t)}))
const h = s => parseInt(createHash('sha1').update(s).digest('hex').slice(0, 8), 16) % 10
const variants = t => { const w = norm(t).split(' '); return w.map((_, i) => w.map((x, j) => j === i ? '*' : x).join(' ')).concat([w.join(' ')]) }
for (const [name, key] of [['file name', f => f], ['file stem', f => f.replace(/\.\d+\.csv$/u, '').replace(/\.csv$/u, '')], ['topic folder', f => f.split('/')[0]]]) {
  const isDev = r => h(key(r.file)) === 0
  const train = new Set(), dev = rows.filter(isDev)
  for (const r of rows) if (!isDev(r)) for (const v of variants(r.t)) train.add(v)
  const near = dev.filter(r => variants(r.t).some(v => train.has(v))).length
  console.log(`dev by ${name}: ${dev.length} texts, ${new Set(dev.map(r => r.file)).size} files; ${near} (${(100 * near / dev.length).toFixed(1)}%) have a training text <= 1 word substitution away`)
}
// dev-A for comparison
{ const isDev = r => h(r.t.toLowerCase().replace(/\s+/gu, ' ').trim()) === 0
  const train = new Set(), dev = rows.filter(isDev)
  for (const r of rows) if (!isDev(r)) for (const v of variants(r.t)) train.add(v)
  const near = dev.filter(r => variants(r.t).some(v => train.has(v))).length
  console.log(`dev-A by text hash: ${dev.length} texts; ${near} (${(100 * near / dev.length).toFixed(1)}%) near a training text`) }
// the benchmark itself
{ const train = new Set(); for (const r of rows) for (const v of variants(r.t)) train.add(v)
  const s = readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz')
  const near = s.filter(r => variants(r.text).some(v => train.has(v))).length
  const lab = s.filter(r => labels.has(r.text))
  console.log(`benchmark: ${near}/${s.length} (${(100 * near / s.length).toFixed(1)}%) near a training text`) }
