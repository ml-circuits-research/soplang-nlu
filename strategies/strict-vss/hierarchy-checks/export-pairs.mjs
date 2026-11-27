// Pairs of judged circuits of one message outside the benchmark (accepted and rejected), as holding trees,
// with the number of core lines that differ, for the equivalence check of the M1 probe.
import {writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readRegistry, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {coreOf} = await import(root + 'lib/syntax.mjs')
const {holdingTree} = await import('./holdtree.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const reg = readRegistry(process.env.REGISTRY_DIR || undefined)   // REGISTRY_DIR: frozen snapshot; PAIRS_OUT: output path
const out = []
for (const [text, circuits] of reg.byText) {
  if (bench.has(norm(text))) continue
  const acc = [...circuits.values()].filter(c => c.verdict === 'accepted'), rej = [...circuits.values()].filter(c => c.verdict === 'rejected')
  if (!acc.length || !rej.length) continue
  const a = acc[0], r = rej[0]
  const ta = holdingTree(text, a.sop), tr = holdingTree(text, r.sop)
  if (!ta || !tr) continue
  const ca = new Set(coreOf(text, a.sop).split('\n')), cr = new Set(coreOf(text, r.sop).split('\n'))
  const diff = [...ca].filter(x => !cr.has(x)).length + [...cr].filter(x => !ca.has(x)).length
  out.push({text, acc: ta, rej: tr, diff, lines: ca.size})
}
writeFileSync(process.env.PAIRS_OUT || new URL('./pairs.json', import.meta.url), JSON.stringify(out))
console.log('pairs', out.length)
