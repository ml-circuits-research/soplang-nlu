const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {derive} = await import('./oracle-instr.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
let shown = {}
for (const [text, row] of readLabels()) {
  if (bench.has(norm(text))) continue
  try { derive(text, row.label) } catch (e) {
    const k = e.message + ' / ' + row.accepted_by
    if ((shown[k] = (shown[k] ?? 0) + 1) > 1 || text.length > 160) continue
    console.log('### ' + k + '\n' + text + '\n' + row.label + '\n')
  }
}
