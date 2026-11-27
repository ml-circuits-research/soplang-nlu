const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {derive} = await import('./oracle-instr.mjs')
const L = readLabels()
let shown = 0
for (const [text, row] of L) {
  if (!L.files.get(text).startsWith('drawing/scenes-08') || text.length > 400) continue
  try { derive(text, row.label) } catch (e) {
    if (!e.message.startsWith('closed with held items')) continue
    if (shown++ < 1) { console.log(text); console.log(row.label); console.log(row.source, row.accepted_by) }
  }
}
