// Is the yield of every wire (its own words and those of the wires it holds) one contiguous run of words?
// That is what a bottom-up (merge adjacent constellations) pilot needs.
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {derive} = await import('./oracle-claimstack.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
let n = 0, ok = 0, contig = 0, gapByType = {}, ex = []
for (const [text, row] of readLabels()) {
  if (bench.has(norm(text))) continue
  n++
  let r; try { r = derive(text, row.label) } catch { continue }
  ok++
  const {wires, byId, children, placements} = r.info
  const own = new Map(wires.map(w => [w.id, []]))
  for (const p of placements) for (let i = p.first; i <= p.last; i++) own.get(p.wire).push(i)
  const memo = new Map()
  const yieldOf = id => { if (memo.has(id)) return memo.get(id); const s = new Set(own.get(id)); for (const c of children[id] ?? []) for (const i of yieldOf(c)) s.add(i); memo.set(id, s); return s }
  let all = true
  for (const w of wires) { const s = [...yieldOf(w.id)].sort((a, b) => a - b); if (s.length && s.at(-1) - s[0] + 1 !== s.length) { all = false; const t = w.type.slice(7); gapByType[t] = (gapByType[t] ?? 0) + 1; if (ex.length < 6) ex.push(text + '  [' + w.id + ']') } }
  if (all) contig++
}
console.log('labels', n, 'derived', ok, 'every wire contiguous', contig, (100 * contig / ok).toFixed(2) + '%', 'gapped wires by type', JSON.stringify(gapByType))
console.log(ex.join('\n'))
