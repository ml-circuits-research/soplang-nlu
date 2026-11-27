// Export gold trees (circuitToTree) of labels outside the benchmark, for the capacity check.
import {writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {wordsOf} = await import(root + 'lib/syntax.mjs')
const {circuitToTree} = await import(root + 'experiments/syntax-learned/parser/tree.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const out = []
for (const [text, row] of readLabels()) {
  if (bench.has(norm(text))) continue
  const t = circuitToTree(text, row.label)
  if (t.error) continue
  out.push({w: wordsOf(text).map(x => x.text.toLowerCase()), h: t.heads, l: t.labels})
}
writeFileSync('trees.json', JSON.stringify(out))
console.log(out.length)
