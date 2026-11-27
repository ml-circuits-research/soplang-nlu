// Why do 26 relation coordinations still not come back with the patched tree? Compare cores without attachment=ambiguous.
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample, normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {parseCircuit} = await import(root + 'lib/syntax.mjs')
const B = await import('./tree-patched.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const strip = s => s.split('\n').map(l => l.replace(/ attachment=ambiguous/u, '')).join('\n')
let n = 0, lost = 0, onlyAmb = 0; const other = []
for (const [text, row] of readLabels()) {
  if (bench.has(norm(text))) continue
  const wires = parseCircuit(row.label), byId = new Map(wires.map(w => [w.id, w]))
  if (!wires.some(w => w.type === 'syntax.coordination' && byId.get(w.slots.find(s => s[0] === 'conjunct')[1].slice(1)).type === 'syntax.relation')) continue
  n++
  const t = B.circuitToTree(text, row.label); const sop = B.treeToCircuit(text, t.heads, t.labels)
  if (normalForm(text, sop)?.core === row.core) continue
  lost++
  if (normalForm(text, strip(sop))?.core === normalForm(text, strip(row.label))?.core) onlyAmb++; else other.push(text)
}
console.log({n, lost, onlyAmb, other: other.length}); for (const t of other.slice(0, 5)) console.log('  ', t)
