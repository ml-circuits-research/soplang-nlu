// Measure one of the neural strategies over the fixed 1% sample, through the common reader.
//   env -u SOP_KNOWLEDGE_DIR node measure-neural.mjs <distilbert|neuro-selector|selector-distilbert>
// The models are found through the environment variables of each strategy (see its index.mjs).
// Writes <strategy>.jsonl, one line per message {id, text, sop, error}, and <strategy>.summary.json.
// The error of a message with no valid circuit starts with its kind, as in tests/benchmark/syntax/run.mjs:
// "invalid circuit: <findings>", "no circuit: <what the strategy said>" or "crash: <what was thrown>".
import {readFileSync, writeFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createReader} from '../../lib/index.mjs'

const modules = {
  distilbert: ['../../strategies/distilbert/index.mjs', 'distilBert'],
  'neuro-selector': ['../../strategies/neuro-selector/index.mjs', 'neuroSelector'],
  'selector-distilbert': ['../../strategies/selector-distilbert/index.mjs', 'selectorDistilBert']
}
const name = process.argv[2]
if (!modules[name]) throw Error('Expected one of: ' + Object.keys(modules).join(', '))
if (process.env.SOP_KNOWLEDGE_DIR) throw Error('Run with SOP_KNOWLEDGE_DIR unset.')
const strategy = (await import(modules[name][0]))[modules[name][1]]
const here = file => new URL(file, import.meta.url)
const rows = JSON.parse(gunzipSync(readFileSync(here('../2026-11-26-fresh-locked-one-percent/sample.json.gz'))))

const opened = performance.now()
const reader = await createReader({strategy})
const startupMs = performance.now() - opened
const lines = [], times = [], causes = new Map()
let valid = 0
const count = (cause, row, detail) => {
  const entry = causes.get(cause) ?? causes.set(cause, {count: 0, example: {id: row.id, text: row.text, ...detail}}).get(cause)
  entry.count++
}
try {
  for (const row of rows) {
    const start = performance.now()
    let result
    let crash = null
    try { result = await reader.propose(row.text) } catch (thrown) { crash = thrown instanceof Error ? thrown.message : String(thrown); result = {candidates: [], rejected: []} }
    times.push(performance.now() - start)
    const circuit = result.candidates?.[0]?.sop ?? null
    let error = null
    if (circuit) valid++
    else {
      const rejected = result.rejected?.[0]
      const codes = [...new Set((rejected?.check.findings ?? []).map(finding => finding.code))]
      const said = result.error ?? 'The strategy returned no circuit.'
      error = crash !== null ? 'crash: ' + crash : codes.length ? 'invalid circuit: ' + codes.join(', ') : 'no circuit: ' + said
      if (crash !== null) count('crash: ' + crash, row, {})
      else if (codes.length) for (const code of codes) count('invalid circuit: ' + code, row, {finding: rejected.check.findings.find(finding => finding.code === code), sop: rejected.sop})
      else count('no circuit: ' + said.replace(/\s*\(.*$/u, '').replace(/:.*$/u, ''), row, {error: said})
    }
    lines.push(JSON.stringify({id: row.id, text: row.text, sop: circuit, error}))
  }
} finally {
  await reader.close()
}
const sorted = times.toSorted((a, b) => a - b)
// what the run was given: the models and, for the selectors, the families of the pool
const given = Object.fromEntries(['SOP_NLU_DISTILBERT_MODEL', 'SOP_NLU_DISTILBERT_DEVICE', 'SOP_NLU_SYNTAX_MODEL', 'SOP_NLU_ADAPTED_TRF_MODEL',
  'SOP_NLU_COMPACT_MODEL', 'SOP_NLU_SELECTOR_FAMILIES', 'SOP_NLU_SELECTOR_MODEL'].filter(key => process.env[key] !== undefined &&
  (name !== 'distilbert' || key.includes('DISTILBERT')) && (name !== 'neuro-selector' || !key.includes('DISTILBERT'))).map(key => [key, process.env[key]]))
const summary = {
  strategy: name, schema: strategy.schema, given, messages: rows.length, valid, invalid: rows.length - valid,
  startupMs: Math.round(startupMs), meanMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1),
  medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(1), p95Ms: +sorted[Math.floor(sorted.length * .95)].toFixed(1),
  causes: [...causes].sort((a, b) => b[1].count - a[1].count).map(([cause, entry]) => ({cause, ...entry}))
}
writeFileSync(here(name + '.jsonl'), lines.join('\n') + '\n')
writeFileSync(here(name + '.summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({...summary, causes: summary.causes.map(({cause, count}) => [cause, count])}))
