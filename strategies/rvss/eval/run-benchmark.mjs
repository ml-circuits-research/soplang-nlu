// rvss over the 1,831 benchmark messages through createReader, rows as tests/benchmark/syntax/run.mjs writes them.
//   node strategies/rvss/eval/run-benchmark.mjs <model dir> <out.jsonl> [--python <path>] [--limit n]
import {writeFileSync, readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {createReader} = await import(root + 'lib/reader.mjs')
const {rvss} = await import(root + 'strategies/rvss/index.mjs')
const args = process.argv.slice(2)
const [modelPath, out] = args
const opt = k => args.includes(k) ? args[args.indexOf(k) + 1] : undefined
const python = opt('--python') ?? '/home/salboaie/nlp-venv/bin/python'
const sample = JSON.parse(gunzipSync(readFileSync(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz'))).slice(0, Number(opt('--limit') ?? Infinity))
const t0 = performance.now()
const reader = await createReader({strategy: rvss, modelPath, python})
const startup = performance.now() - t0
const rows = []; const kinds = {}
for (const s of sample) {
  const start = performance.now(); let row
  try {
    const r = await reader.propose(s.text); const sop = r.candidates?.[0]?.sop
    if (typeof sop === 'string') row = {sop, error: null}
    else if (r.rejected?.length) row = {sop: null, error: 'invalid circuit: ' + [...new Set(r.rejected[0].check.findings.map(f => f.code))].join(', ')}
    else row = {sop: null, error: 'no circuit: ' + (r.error ?? 'The strategy returned no circuit.')}
  } catch (e) { row = {sop: null, error: 'crash: ' + e.message} }
  row.ms = Math.round((performance.now() - start) * 1000) / 1000
  const k = row.error ? row.error.slice(0, 30) : 'ok'; kinds[k] = (kinds[k] ?? 0) + 1
  rows.push({id: s.id, text: s.text, ...row})
}
await reader.close()
writeFileSync(out, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
const ms = rows.map(r => r.ms).sort((a, b) => a - b)
console.log(JSON.stringify({messages: rows.length, kinds, startupMs: Math.round(startup), medianMs: ms[Math.floor((ms.length - 1) / 2)], p90: ms[Math.floor(ms.length * 0.9)]}))
