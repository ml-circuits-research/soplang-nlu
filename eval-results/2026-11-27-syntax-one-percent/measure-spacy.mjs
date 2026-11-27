// Measure the dependency strategies (neural-dependencies, spacy-direct, spacy-beam) on the fixed
// one-percent sample, through the common reader, with no knowledge repository.
//
//   env -u SOP_KNOWLEDGE_DIR node eval-results/2026-11-27-syntax-one-percent/measure-spacy.mjs \
//     [strategy ...]            default: all three
//   SOP_NLU_SYNTAX_PYTHON, SOP_NLU_SYNTAX_MODEL choose the parser (see docs/strategies/neural-dependencies.md)
//
// Writes <strategy>.jsonl (one line per message: id, text, sop or null, error or null) and
// <strategy>.summary.json next to this file.
import {gunzipSync} from 'node:zlib'
import {readFileSync, writeFileSync} from 'node:fs'
import {createReader} from '../../lib/index.mjs'
import {neuralDependencies} from '../../strategies/neural-dependencies/index.mjs'
import {spacyDirect} from '../../strategies/spacy-direct/index.mjs'
import {spacyBeam} from '../../strategies/spacy-beam/index.mjs'

if (process.env.SOP_KNOWLEDGE_DIR !== undefined) throw new Error('Run with SOP_KNOWLEDGE_DIR unset.')
const here = new URL('./', import.meta.url)
const sample = JSON.parse(gunzipSync(readFileSync(new URL('../2026-11-26-fresh-locked-one-percent/sample.json.gz', here))))
const strategies = {'neural-dependencies': neuralDependencies, 'spacy-direct': spacyDirect, 'spacy-beam': spacyBeam}
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(strategies)
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]

for (const name of wanted) {
  const opened = performance.now()
  const reader = await createReader({strategy: strategies[name]})
  const openMs = performance.now() - opened
  const lines = [], times = [], causes = new Map()
  let valid = 0, loose = 0, unsettled = 0
  for (const {id, text} of sample) {
    const started = performance.now()
    const result = await reader.propose(text)
    times.push(performance.now() - started)
    const [candidate] = result.candidates
    let error = null
    if (candidate) {
      valid++
      if (candidate.loose?.length) loose++
      if (candidate.unsettled) unsettled++
    } else {
      const findings = result.rejected?.[0]?.check.findings ?? []
      const codes = [...new Set(findings.map(finding => finding.code))]
      error = codes.length ? `${result.error} Findings: ${codes.join(', ')}.` : result.error
      // one cause per message: the validation findings, or the writer's error without the words it quotes
      const cause = codes.length ? codes.join(', ') : String(result.error).replace(/"[^"]*"/gu, '"…"').replace(/\s*\(.*\)$/u, '').replace(/:.*$/u, '')
      if (!causes.has(cause)) causes.set(cause, {count: 0, example: text, error})
      causes.get(cause).count++
    }
    lines.push(JSON.stringify({id, text, sop: candidate?.sop ?? null, error}))
  }
  await reader.close()
  const sorted = [...times].sort((a, b) => a - b)
  const summary = {
    strategy: name, schema: 'syntax', messages: sample.length, valid, invalid: sample.length - valid,
    failures: [...causes].sort((a, b) => b[1].count - a[1].count).map(([cause, {count, example, error}]) => ({cause, count, example, error})),
    // words the parse gave no grammatical place; they are held by the nearest clause
    messagesWithLooselyPlacedWords: loose,
    ...(name === 'spacy-beam' ? {messagesWithUnsettledAttachment: unsettled} : {}),
    msPerMessage: {mean: +(times.reduce((sum, time) => sum + time, 0) / times.length).toFixed(2), median: +quantile(sorted, 0.5).toFixed(2), p95: +quantile(sorted, 0.95).toFixed(2)},
    openMs: +openMs.toFixed(0),
    parser: {python: process.env.SOP_NLU_SYNTAX_PYTHON ?? 'python3', model: process.env.SOP_NLU_SYNTAX_MODEL ?? 'en_core_web_sm'},
    knowledgeDir: null, node: process.version, date: new Date().toISOString()
  }
  writeFileSync(new URL(name + '.jsonl', here), lines.join('\n') + '\n')
  writeFileSync(new URL(name + '.summary.json', here), JSON.stringify(summary, null, 2) + '\n')
  console.log(`${name}: ${valid}/${sample.length} valid; ${summary.msPerMessage.mean} ms per message (median ${summary.msPerMessage.median}, p95 ${summary.msPerMessage.p95})`)
  for (const failure of summary.failures) console.log(`  ${failure.count} × ${failure.cause} | e.g. ${JSON.stringify(failure.example.slice(0, 120))}`)
}
