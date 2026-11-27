// Round trip: label -> tree -> circuit, compared by core. Also projectivity (root at the end).
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {circuitToTree, treeToCircuit} = await import('./tree.mjs')
const labels = readLabels()
const limit = Number(process.argv[2] ?? 1e9)
const show = process.argv[3]
let total = 0, ok = 0, encErr = {}, decErr = 0, diff = 0, nonproj = 0
const labelCounts = {}
const shown = {}
export function projective(heads) {
  const n = heads.length
  const arcs = heads.map((h, d) => [h < 0 ? n : h, d])
  for (const [h1, d1] of arcs) { const a = Math.min(h1, d1), b = Math.max(h1, d1)
    for (const [h2, d2] of arcs) { const c = Math.min(h2, d2), e = Math.max(h2, d2); if (a < c && c < b && b < e) return false } }
  return true
}
for (const [text, line] of labels) {
  if (total >= limit) break
  total++
  const t = circuitToTree(text, line.label)
  if (t.error) {
    for (const e of t.error.split(', ')) encErr[e] = (encErr[e] ?? 0) + 1
    if (show === 'enc' && (shown.enc = (shown.enc ?? 0) + 1) <= 8) console.log('ENC', t.error, '|', text, '\n' + line.label)
    continue
  }
  for (const l of t.labels) labelCounts[l] = (labelCounts[l] ?? 0) + 1
  if (!projective(t.heads)) nonproj++
  let sop
  try { sop = treeToCircuit(text, t.heads, t.labels) } catch (e) { decErr++; if (show === 'dec' && (shown.dec = (shown.dec ?? 0) + 1) <= 8) console.log('DEC', e.message, '|', text, '\n' + line.label, '\n', t.heads.join(' '), '\n', t.labels.join(' ')); continue }
  const core = normalForm(text, sop)?.core
  if (core === line.core) ok++
  else { diff++; if (show === 'diff' && (shown.diff = (shown.diff ?? 0) + 1) <= 10) console.log('DIFF |', text, '\nLABEL\n' + normalForm(text, line.label).sop, '\nBACK\n' + (normalForm(text, sop)?.sop ?? sop), '\n', t.labels.map((l, i) => i + ':' + t.words[i].text + '->' + t.heads[i] + '/' + l).join(' ')) }
}
console.log({total, ok, share: (ok / total * 100).toFixed(2) + '%', decErr, diff, nonproj})
console.log('encode errors', encErr)
console.log('labels', Object.keys(labelCounts).length)
if (process.argv.includes('--labels')) for (const [k, v] of Object.entries(labelCounts).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(8), k)
