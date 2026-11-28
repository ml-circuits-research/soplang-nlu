// spaCy's circuit compared with distilbert's (a fresh run of the distilbert strategy over the messages of the
// conversion with no label, the judged ones and the benchmark ones), and whether distilbert saw the message in
// training (the train and development files of its checkpoint): only then is its agreement no independent signal.
//   node distil-compare.mjs <features-dir> <distilbert.jsonl> <checkpoint-data-dir> <out.jsonl>
import {readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm, agreementKeysOf, relaxedCore} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const [featuresDir, distilFile, dataDir, outFile] = process.argv.slice(2)
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))

const seen = new Set()
for (const name of readdirSync(dataDir).filter(n => n.endsWith('.jsonl'))) for (const row of lines(join(dataDir, name))) if (typeof row.text === 'string') seen.add(row.text)
const distil = new Map(lines(distilFile).map(row => [row.id, row]))
const circuitOf = (text, sop) => {
  if (!sop) return null
  const normal = normalForm(text, sop)
  if (!normal?.core) return null
  return {core: normal.core, keys: agreementKeysOf(text, {sop: normal.sop, core: normal.core}, 'variants'), relaxed: relaxedCore(normal.core)}
}
const jaccard = (a, b) => { const A = new Set(a.split('\n')), B = new Set(b.split('\n')); let both = 0; for (const x of A) if (B.has(x)) both++; return 1 - both / (A.size + B.size - both || 1) }
// as in features.mjs: the kinds of the lines of the relaxed cores that differ
function lineKind(line) {
  let m = /^\d+-\d+ (\w+) @/u.exec(line)
  if (m) return ['head', 'dependent', 'verb', 'marker', 'conjunction'].includes(m[1]) ? m[1] : 'modifier-like'
  m = /^clause \S+ (\w+)/u.exec(line)
  if (m) return m[1] === 'form' ? 'form' : 'clause-tie'
  m = /^relation \S+ (\w+)/u.exec(line)
  if (m) return 'relation-' + m[1]
  return /^coordination/u.test(line) ? 'coordination' : 'other'
}
function diffKinds(a, b) {
  const A = new Set(a.split('\n')), B = new Set(b.split('\n')), out = {}
  for (const x of A) if (!B.has(x)) out[lineKind(x)] = (out[lineKind(x)] ?? 0) + 1
  for (const x of B) if (!A.has(x)) out[lineKind(x)] = (out[lineKind(x)] ?? 0) + 1
  return out
}
const out = []
for (const name of readdirSync(featuresDir).filter(n => n.endsWith('.jsonl')).sort()) {
  for (const rec of lines(join(featuresDir, name))) {
    const d = distil.get(rec.id)
    if (!d || d.text !== rec.text) continue
    const sp = rec.valid ? circuitOf(rec.text, rec.sop) : null, db = circuitOf(rec.text, d.sop)
    const row = {id: rec.id, trained: +seen.has(rec.text), v: +Boolean(db)}
    if (sp && db) Object.assign(row, {core: +(sp.core === db.core), rel: +(sp.relaxed === db.relaxed), var: +db.keys.some(k => sp.keys.includes(k)), dist: +jaccard(sp.core, db.core).toFixed(4), rdist: +jaccard(sp.relaxed, db.relaxed).toFixed(4), kinds: diffKinds(sp.relaxed, db.relaxed)})
    out.push(row)
  }
}
writeFileSync(outFile, out.map(r => JSON.stringify(r)).join('\n') + '\n')
console.log('compared', out.length, 'trained', out.filter(r => r.trained).length, 'of', seen.size, 'training texts')
