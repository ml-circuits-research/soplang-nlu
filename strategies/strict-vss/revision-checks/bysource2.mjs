const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {wordsOf} = await import(root + 'lib/syntax.mjs')
const {derive} = await import('./oracle-claimstack.mjs')
import {statSync} from 'node:fs'
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const labels = readLabels()
const H = {}, S = {}, A = {}, ex = {}
const cutoff = new Date('2026-11-27T22:02:00').getTime()
for (const [text, row] of labels) {
  if (bench.has(norm(text))) continue
  const file = labels.files.get(text)
  const recent = statSync(root + '../webmeet-dataset/syntactic/' + file).mtimeMs > cutoff ? 'file changed after 22:02' : 'file older'
  const src = (row.source || '?').split(/[ ,;:]/)[0], acc = (row.accepted_by || '?').split(/[ ,;:]/)[0]
  let ok = 1, err = ''
  try { derive(text, row.label) } catch (e) { ok = 0; err = e.message }
  for (const [h, k] of [[H, recent], [S, src], [A, acc]]) { h[k] ??= [0, 0]; h[k][0]++; h[k][1] += 1 - ok }
  if (!ok) { const k = file.split('/')[0]; ex[k] = (ex[k] ?? 0) + 1 }
  // lookahead examples by category handled elsewhere
}
console.log('by file age [labels, oracle failures]', JSON.stringify(H))
console.log('by source', JSON.stringify(Object.entries(S).sort((a, b) => b[1][0] - a[1][0]).slice(0, 15)))
console.log('by accepted_by', JSON.stringify(Object.entries(A).sort((a, b) => b[1][0] - a[1][0]).slice(0, 15)))
console.log('failures by top folder', JSON.stringify(ex))
