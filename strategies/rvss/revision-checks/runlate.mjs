const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const variants = {base: await import('./oracle-instr.mjs'), claimstack: await import('./oracle-claimstack.mjs')}
const R = {}
for (const [text, row] of readLabels()) {
  if (bench.has(norm(text))) continue
  for (const [k, m] of Object.entries(variants)) {
    R[k] ??= {n: 0, ok: 0, same: 0, fails: {}, pre: 0}
    R[k].n++
    try { const r = m.derive(text, row.label); R[k].ok++; if (r.same) R[k].same++
      // opens that happen before any own word of the wire (pre-emptive), relations only
      const {wires, byId, ownFirst, open} = r.info
      for (const w of wires) if (w.type === 'syntax.relation' && open[w.id] < (ownFirst[w.id] ?? Infinity) && open[w.id] !== undefined) {
        // count only when the relation opens before the first own word of its `to` wire too
        R[k].pre++ }
    } catch (e) { R[k].fails[e.message] = (R[k].fails[e.message] ?? 0) + 1 }
  }
}
for (const [k, v] of Object.entries(R)) console.log(k, 'labels', v.n, 'derived', v.ok, 'same core', v.same, (100 * v.same / v.n).toFixed(2) + '%', 'relations opened before their own words', v.pre, JSON.stringify(v.fails))
