// Measure a checkpoint of the DistilBERT syntax model, through the common reader.
//   env -u SOP_KNOWLEDGE_DIR node measure.mjs <name> <training folder> [--python <interpreter>]
// <training folder> is what strategies/distilbert/retrain.mjs wrote: checkpoint/, data/, training-summary.json.
// Writes <name>.summary.json, <name>.development.jsonl and <name>.round-02.jsonl beside this file.
//   development  the gold messages kept out of training: valid circuits, and circuits equal to
//                the gold circuit by core (the normal form of tests/benchmark/syntax/lib.mjs)
//   round 02     the 598 messages of eval-results/2026-11-27-round-02/sample.json: valid circuits,
//                and how often the circuit is the one VSS wrote (first-run/vss.jsonl) and the one
//                spacy-direct wrote (spacy-direct.jsonl of that folder); and how many of these
//                messages the checkpoint was trained on
//   time         milliseconds per message over those 598 messages, on CPU and on GPU
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {createReader} from '../../lib/index.mjs'
import {distilBert} from '../../strategies/distilbert/index.mjs'
import {normalForm} from '../../tests/benchmark/syntax/lib.mjs'

const [name, folder, ...rest] = process.argv.slice(2)
if (!name || !folder) throw Error('Usage: node measure.mjs <name> <training folder> [--python <interpreter>]')
if (process.env.SOP_KNOWLEDGE_DIR) throw Error('Run with SOP_KNOWLEDGE_DIR unset.')
const python = rest[rest.indexOf('--python') + 1] ?? process.env.SOP_NLU_DISTILBERT_PYTHON ?? 'python3'
const here = file => new URL(file, import.meta.url)
const lines = file => readFileSync(file, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
const modelPath = join(resolve(folder), 'checkpoint')
const core = (text, sop) => typeof sop === 'string' ? normalForm(text, sop)?.core ?? null : null
const share = (count, of) => ({count, of, percent: of ? +(100 * count / of).toFixed(1) : null})

async function run(rows, device) {
  const started = performance.now()
  const reader = await createReader({strategy: distilBert, python, modelPath, device})
  const startupMs = performance.now() - started
  const out = [], times = []
  try {
    for (const row of rows) {
      const start = performance.now()
      let result
      try { result = await reader.propose(row.text) } catch (error) { result = {candidates: [], error: 'crash: ' + error.message} }
      times.push(performance.now() - start)
      const sop = result.candidates?.[0]?.sop ?? null
      const codes = [...new Set((result.rejected?.[0]?.check.findings ?? []).map(finding => finding.code))]
      out.push({id: row.id, text: row.text, sop, error: sop ? null : codes.length ? 'invalid circuit: ' + codes.join(', ') : 'no circuit: ' + (result.error ?? 'The strategy returned no circuit.')})
    }
  } finally { await reader.close() }
  const sorted = times.toSorted((a, b) => a - b)
  return {out, time: {device, startupMs: Math.round(startupMs), meanMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1), medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(1), p95Ms: +sorted[Math.floor(sorted.length * .95)].toFixed(1)}}
}
const errors = out => { const kinds = {}; for (const row of out) if (row.error) { const kind = row.error.replace(/\s*\(.*$/u, ''); (kinds[kind] ??= {count: 0, example: row.text}).count++ } return kinds }

// ---- the development messages
const development = lines(join(resolve(folder), 'data', 'development.jsonl'))
const first = await run(development.map((row, index) => ({id: 'development#' + index, ...row})), 'cuda')
const devEqual = first.out.filter((row, index) => row.sop && core(row.text, row.sop) === core(row.text, development[index].label)).length
writeFileSync(here(name + '.development.jsonl'), first.out.map((row, index) => JSON.stringify({...row, gold: development[index].label})).join('\n') + '\n')

// ---- the messages of round 02
const round = here('../2026-11-27-round-02/')
const sample = JSON.parse(readFileSync(new URL('sample.json', round), 'utf8'))
const byId = file => new Map(lines(new URL(file, round)).map(row => [row.id, row]))
const vss = byId('first-run/vss.jsonl'), spacy = byId('spacy-direct.jsonl')
const trained = new Set(lines(join(resolve(folder), 'data', 'train.jsonl')).map(row => row.text)), developed = new Set(development.map(row => row.text))
const gpu = await run(sample, 'cuda'), cpu = await run(sample, 'cpu')
writeFileSync(here(name + '.round-02.jsonl'), gpu.out.map(row => JSON.stringify(row)).join('\n') + '\n')
const same = other => gpu.out.filter(row => row.sop && other.get(row.id)?.sop && core(row.text, row.sop) === core(row.text, other.get(row.id).sop)).length
const withCircuit = other => sample.filter(row => other.get(row.id)?.sop).length
const summaryFile = join(resolve(folder), 'training-summary.json')
const summary = {
  name, checkpoint: modelPath, training: existsSync(summaryFile) ? (({messages, trainRows, trainWeight, developmentRows, selectedEpoch, seed, base, baseRevision, development: chosen}) =>
    ({messages, trainRows, trainWeight, developmentRows, selectedEpoch, seed, base, baseRevision, thresholds: {node: chosen.nodeThreshold, tie: chosen.tieThreshold}}))(JSON.parse(readFileSync(summaryFile, 'utf8'))) : null,
  development: {messages: development.length, valid: share(first.out.filter(row => row.sop).length, development.length), equalToGoldByCore: share(devEqual, development.length), errors: errors(first.out)},
  round02: {messages: sample.length, valid: share(gpu.out.filter(row => row.sop).length, sample.length),
    sameAsVssFirstRun: share(same(vss), withCircuit(vss)), sameAsSpacyDirect: share(same(spacy), withCircuit(spacy)),
    cpuAndGpuWriteTheSameCircuit: share(gpu.out.filter((row, index) => row.sop === cpu.out[index].sop).length, sample.length),
    messagesTheCheckpointWasTrainedOn: sample.filter(row => trained.has(row.text)).length,
    messagesAmongItsDevelopmentMessages: sample.filter(row => developed.has(row.text)).length, errors: errors(gpu.out)},
  time: {messages: sample.length, cpu: cpu.time, gpu: gpu.time}
}
writeFileSync(here(name + '.summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary))
