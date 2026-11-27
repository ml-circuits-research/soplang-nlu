// Training data: every label of the dataset as a tree with the parser's observations, split into
// train / dev (10% by a hash of the text) and with the benchmark's 1,831 messages left out.
// The benchmark messages are observed too (no tree), for prediction.   node prep.mjs
import {readFileSync, writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {gzipSync} from 'node:zlib'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {createVssReader} = await import(root + 'strategies/vss/src/reader.mjs')
const {circuitToTree} = await import('./tree.mjs')
const {observeWords} = await import('./observe.mjs')
const {projective} = await import('./projective.mjs')

const model = JSON.parse(readFileSync(root + 'strategies/vss/model/model.json', 'utf8'))
const vss = createVssReader(model, {schema: 'syntax'})
const clusters = JSON.parse(readFileSync('clusters.json', 'utf8'))
const outFile = process.argv[2] ?? 'data.json.gz'
const bench = readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz')
const benchTexts = new Set(bench.map(b => b.text))
const labels = readLabels()
export const isDev = text => createHash('sha1').update(text).digest()[0] % 10 === 0
const out = [], stats = {train: 0, dev: 0, benchLeftOut: 0, encodeFailed: 0, nonprojective: 0, gold: {train: 0, dev: 0}, silver: {train: 0, dev: 0}}
const t0 = performance.now()
for (const [text, line] of labels) {
  if (benchTexts.has(text)) { stats.benchLeftOut++; continue }
  const split = isDev(text) ? 'dev' : 'train'
  const gold = line.accepted_by !== 'agreement'
  const tree = circuitToTree(text, line.label)
  const obs = observeWords(text, vss, clusters)
  const proj = tree.heads && !tree.error ? projective(tree.heads) : false
  if (tree.error) stats.encodeFailed++
  else if (!proj) stats.nonprojective++
  stats[split]++; stats[gold ? 'gold' : 'silver'][split]++
  out.push({text, split, gold, atoms: obs.atoms, endsQ: obs.endsQ, heads: tree.error ? null : tree.heads, labels: tree.error ? null : tree.labels, proj, label: line.label})
}
for (const {id, text} of bench) {
  const obs = observeWords(text, vss, clusters)
  out.push({id, text, split: 'bench', gold: false, atoms: obs.atoms, endsQ: obs.endsQ, heads: null, labels: null, proj: false})
}
stats.ms = Math.round(performance.now() - t0)
writeFileSync(outFile, gzipSync(JSON.stringify(out)))
console.log(stats)
