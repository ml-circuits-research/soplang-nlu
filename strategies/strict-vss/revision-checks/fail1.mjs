const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {derive} = await import('./oracle-instr.mjs')
let shown = 0
const files = {}
const L = readLabels()
for (const [text, row] of L) {
  try { derive(text, row.label) } catch (e) {
    if (!e.message.startsWith('closed with held items')) continue
    files[L.files.get(text)] = (files[L.files.get(text)] ?? 0) + 1
    if (shown++ < 1) { console.log(text); console.log(row.label); console.log(row.source, row.accepted_by) }
  }
}
console.log(JSON.stringify(Object.entries(files).sort((a,b)=>b[1]-a[1]).slice(0,12)))
