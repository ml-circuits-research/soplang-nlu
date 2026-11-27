// Ceiling of a per-word (domain, beacon) readout: label -> tree -> circuit; is the core (and the variants key) the same?
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample, normalForm, agreementKey} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {circuitToTree, treeToCircuit} = await import(root + 'experiments/syntax-learned/parser/tree.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const c = {n: 0, unencodable: 0, writerError: 0, core: 0, variants: 0}
for (const [text, row] of readLabels()) {
  if (bench.has(norm(text))) continue
  c.n++
  const t = circuitToTree(text, row.label)
  if (t.error) { c.unencodable++; continue }
  let sop; try { sop = treeToCircuit(text, t.heads, t.labels) } catch { c.writerError++; continue }
  if (normalForm(text, sop)?.core === normalForm(text, row.label)?.core) c.core++
  else { let a = null, b = null; try { a = agreementKey(text, sop); b = agreementKey(text, row.label) } catch {} if (a && a === b) c.variants++ }
}
console.log(c, 'core', (100 * c.core / c.n).toFixed(2) + '%', 'core or variants', (100 * (c.core + c.variants) / c.n).toFixed(2) + '%')
