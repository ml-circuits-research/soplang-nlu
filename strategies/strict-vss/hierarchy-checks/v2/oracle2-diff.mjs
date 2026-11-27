// Which labels does each oracle fail? Writes oracle2-failures.json: every failure of the base and the late
// conventions with text, label, file and accepted_by (for the data session to look at; nothing is changed).
import {writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {derive} = await import('./oracle2.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const labels = readLabels(process.env.SYNTACTIC_DIR || undefined)
const out = {base: [], late: []}, both = {baseOnly: 0, lateOnly: 0, both: 0}
for (const [text, row] of labels) {
  if (bench.has(norm(text))) continue
  const f = {}
  for (const late of [false, true]) { try { derive(text, row.label, {late}) } catch (e) { f[late ? 'late' : 'base'] = e.message } }
  for (const k of ['base', 'late']) if (f[k]) out[k].push({why: f[k], text, sop: row.label, file: labels.files.get(text), accepted_by: row.accepted_by})
  if (f.base && f.late) both.both++; else if (f.base) both.baseOnly++; else if (f.late) both.lateOnly++
}
console.log('failures: base', out.base.length, 'late', out.late.length, JSON.stringify(both))
writeFileSync(new URL('./oracle2-failures.json', import.meta.url), JSON.stringify(out, null, 1))
