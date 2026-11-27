// Data study: label counts, benchmark overlap, shapes of the circuits.
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {parseCircuit} = await import(root + 'lib/syntax.mjs')
const bench = readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz')
const benchTexts = new Set(bench.map(b => b.text))
const t0 = performance.now()
const labels = readLabels()
console.log('labels', labels.size, 'messages in files', labels.files.size, 'ms', Math.round(performance.now() - t0))
const by = {}
let inBench = 0
const shapes = {}
const count = (k) => shapes[k] = (shapes[k] ?? 0) + 1
for (const [text, line] of labels) {
  by[line.accepted_by] = (by[line.accepted_by] ?? 0) + 1
  if (benchTexts.has(text)) { inBench++; continue }
  let wires
  try { wires = parseCircuit(line.label) } catch { count('unparsable'); continue }
  const byId = new Map(wires.map(w => [w.id, w]))
  const refCount = new Map()
  for (const w of wires) for (const [k, v] of w.slots) if (v.startsWith('$')) {
    refCount.set(v.slice(1), (refCount.get(v.slice(1)) ?? 0) + 1)
    const t = byId.get(v.slice(1))?.type
    count(`${w.type.slice(7)}.${k}->${t?.slice(7)}`)
  }
  for (const w of wires) {
    const n = refCount.get(w.id) ?? 0
    count(`${w.type.slice(7)} referenced ${n}x`)
    for (const [k, v] of w.slots) if (v.startsWith('"') && JSON.parse(v).trim().split(/\s+/).length > 1) count(`multiword ${w.type.slice(7)}.${k}`)
    if (w.type === 'syntax.clause') count('form ' + w.slots.find(s => s[0] === 'form')?.[1])
  }
}
console.log('by', by, 'labels of benchmark texts', inBench, 'bench', bench.length)
for (const [k, v] of Object.entries(shapes).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(7), k)
