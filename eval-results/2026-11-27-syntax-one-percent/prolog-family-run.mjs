// Runs one of the three Prolog strategies over the fixed 1% sample through the common reader
// and writes one line per message: {id, text, sop, error}. Then prints what failed.
//   env -u SOP_KNOWLEDGE_DIR node eval-results/2026-11-27-syntax-one-percent/prolog-family-run.mjs <strategy> [--limit n]
// <strategy>: prolog | prolog-example-transfer | neuro-prolog
// Options of a strategy come from the environment: SWIPL, SOP_NLU_SYNTAX_PYTHON, SOP_NLU_SYNTAX_MODEL.
import {readFileSync, writeFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createReader} from '../../lib/reader.mjs'

const [name, ...rest] = process.argv.slice(2)
const limit = rest.includes('--limit') ? Number(rest[rest.indexOf('--limit') + 1]) : Infinity
const modules = {
  prolog: ['../../strategies/prolog/index.mjs', 'prolog'],
  'prolog-example-transfer': ['../../strategies/prolog-example-transfer/index.mjs', 'prologExampleTransfer'],
  'neuro-prolog': ['../../strategies/neuro-prolog/index.mjs', 'neuroProlog']
}
if (!modules[name]) throw new Error('Expected one of: ' + Object.keys(modules).join(', '))
if (process.env.SOP_KNOWLEDGE_DIR) throw new Error('Run with SOP_KNOWLEDGE_DIR unset.')
const strategy = (await import(new URL(modules[name][0], import.meta.url)))[modules[name][1]]
const sample = JSON.parse(gunzipSync(readFileSync(new URL('../2026-11-26-fresh-locked-one-percent/sample.json.gz', import.meta.url))))
  .slice(0, limit).map(({id, text}) => ({id, text}))
const reader = await createReader({strategy})
const rows = [], kinds = new Map()
const started = performance.now()
for (const {id, text} of sample) {
  const result = await reader.propose(text)
  const candidate = result.candidates[0]
  let error = null
  if (!candidate) {
    const findings = result.rejected?.[0]?.check?.findings
    error = findings?.length ? 'invalid circuit: ' + findings.map(finding => finding.code).join(', ') : result.error ?? 'no circuit'
    // one kind per failure: the words differ from message to message
    const kind = error.replace(/"[^"]*"/gu, '"…"').replace(/: .*$/u, match => /^: (?:[a-z-]+(?:, )?)+$/u.test(match) ? match : '')
    if (!kinds.has(kind)) kinds.set(kind, {count: 0, example: text, error})
    kinds.get(kind).count++
  }
  rows.push({id, text, sop: candidate?.sop ?? null, error})
}
const elapsed = performance.now() - started
await reader.close()
writeFileSync(new URL(`./${name}.jsonl`, import.meta.url), rows.map(row => JSON.stringify(row)).join('\n') + '\n')
const valid = rows.filter(row => row.sop).length
console.log(`${name}: ${valid} valid circuits out of ${rows.length} (${(100 * valid / rows.length).toFixed(1)}%), ${(elapsed / rows.length).toFixed(1)} ms per message`)
for (const [kind, {count, example, error}] of [...kinds].sort((a, b) => b[1].count - a[1].count).slice(0, 25)) {
  console.log(`${String(count).padStart(5)}  ${kind}\n         e.g. ${JSON.stringify(example)}${error === kind ? '' : '  ->  ' + error}`)
}
