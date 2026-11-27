// Whole-set round trip, original tree.mjs vs the scratch patch (relation coordinations carry no anchor)
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample, normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const A = await import(root + 'experiments/syntax-learned/parser/tree.mjs')
const B = await import('./tree-patched.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const res = {orig: {enc: 0, ok: 0}, patched: {enc: 0, ok: 0}}; let n = 0
const show = process.argv[2]
let shown = 0
for (const [text, row] of readLabels()) {
  if (bench.has(norm(text))) continue
  n++
  for (const [name, T] of [['orig', A], ['patched', B]]) {
    const t = T.circuitToTree(text, row.label)
    if (t.error) { res[name].enc++; continue }
    let sop; try { sop = T.treeToCircuit(text, t.heads, t.labels) } catch { continue }
    if (normalForm(text, sop)?.core === row.core) res[name].ok++
    else if (name === 'patched' && show && text.includes(show) && shown++ < 1) console.log(text, '\nLABEL\n' + normalForm(text, row.label).sop, '\nBACK\n' + normalForm(text, sop)?.sop, '\n', t.labels.map((l, i) => i + ':' + t.words[i].text + '->' + t.heads[i] + '/' + l).join(' '))
  }
}
console.log({n, orig: {...res.orig, share: (100 * res.orig.ok / n).toFixed(2)}, patched: {...res.patched, share: (100 * res.patched.ok / n).toFixed(2)}})
