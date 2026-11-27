const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {derive} = await import('./oracle.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const hist = (h, k) => { h[k] = (h[k] ?? 0) + 1 }
const H = {maxDepth: {}, need: {}, short12: {}}
let msgs = 0
for (const [text, row] of readLabels(process.env.SYNTACTIC_DIR || undefined)) {
  if (bench.has(norm(text))) continue
  let r; try { r = derive(text, row.label) } catch { continue }
  msgs++
  let d = 1, mx = 1
  for (const m of r.moves) { if (m.startsWith('OPEN') || m.startsWith('COORD') || m === 'REOPEN last' || m === 'REOPEN other') d++; else if (m.startsWith('CLOSE')) d--; mx = Math.max(mx, d) }
  hist(H.maxDepth, Math.min(mx, 10))
  const s = new Set(r.moves.map(m => m.split(' ')[0] + (m.startsWith('OPEN') && m.endsWith('@held') ? '@held' : '') + (m.startsWith('COORD') ? ' ' + m.split(' ')[1] : '') + (m.startsWith('REOPEN') ? ' ' + m.split(' ')[1] : '') + (m.startsWith('POINT') ? ' ' + m.split(' ')[1] : '')))
  for (const k of s) hist(H.need, k)
  hist(H.short12, r.n <= 12 ? '<=12' : '>12')
}
console.log('messages derived', msgs)
for (const [k, v] of Object.entries(H)) console.log(k, JSON.stringify(v))
