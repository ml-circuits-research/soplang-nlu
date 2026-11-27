const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {parseCircuit} = await import(root + 'lib/syntax.mjs')
const labels = readLabels()
const shapes = {}, ex = {}
const count = (k, text) => { shapes[k] = (shapes[k] ?? 0) + 1; if (!ex[k]) ex[k] = text }
for (const [text, line] of labels) {
  const wires = parseCircuit(line.label)
  const byId = new Map(wires.map(w => [w.id, w]))
  const inc = new Map(wires.map(w => [w.id, []]))
  for (const w of wires) for (const [k, v] of w.slots) if (v.startsWith('$')) inc.get(v.slice(1))?.push((byId.get(w.id).type.slice(7,10)) + '.' + k)
  for (const w of wires) {
    const t = w.type.slice(7)
    const kinds = inc.get(w.id).sort().join('+') || 'none'
    if (t === 'coordination') {
      const ct = byId.get(w.slots.find(s => s[0]==='conjunct')[1].slice(1)).type.slice(7)
      count(`coord(${ct}) in:${kinds}`, text)
      // conjuncts referenced elsewhere?
      for (const [k, v] of w.slots) if (k==='conjunct') { const o = inc.get(v.slice(1)).filter(x => x !== 'coo.conjunct'); count(`  conjunct(${ct}) of coord also in: ${o.sort().join('+')||'none'}`, text) }
    } else count(`${t} in:${kinds}`, text)
  }
}
for (const [k, v] of Object.entries(shapes).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(7), k.padEnd(60), ' | ', ex[k].slice(0, 90))
