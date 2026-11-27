// Runs every ported strategy over a sample of messages and writes one file per strategy.
//   node tests/benchmark/syntax/run.mjs <run-folder> [--sample <file>] [--only a,b] [--limit n] [--reuse <folder>]
//        [--timeout <seconds>] [--jobs n] [--options <file>] [--strategies <file>]
// --sample <file>: a JSON array of {id, text}, gzipped or not, such as sample.mjs writes. Without it,
// the earlier fixed sample eval-results/2026-11-26-fresh-locked-one-percent/sample.json.gz.
// <run-folder>/<strategy>.jsonl   one line per message: {id, text, sop, error, ms}
// <run-folder>/summary.json       per strategy: messages, valid circuits, errors by kind, median ms
// A strategy takes part when its exported object declares `schema: 'syntax'`; the others are
// reported as "not ported". Each strategy runs in a process of its own, so one that crashes or
// hangs loses one message and never stops the others.
// --reuse <folder>: when <folder>/<strategy>.jsonl exists, its circuits are checked again and taken
// instead of running the strategy. Name the run folder itself to continue a run.
// --options <file>: a JSON file {"<strategy>": {…}} with what a strategy needs to open, such as the
// path of its model. A strategy also sees the environment variables it documents.
// No knowledge repository is read: SOP_KNOWLEDGE_DIR is removed before a strategy is loaded, and a
// `knowledgeDir` among the options is dropped.
import {fork} from 'node:child_process'
import {existsSync, mkdirSync, openSync, closeSync} from 'node:fs'
import {join, resolve, relative, basename} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createReader} from '../../../lib/reader.mjs'
import {validateSyntax} from '../../../lib/syntax.mjs'
import {readArguments, readSample, readJson, writeJson, readJsonl, writeJsonl, sampleFile, packageRoot} from './lib.mjs'

const thisFile = fileURLToPath(import.meta.url)
const {words, named} = readArguments(process.argv.slice(2))
const strategiesFile = resolve(named.strategies ?? fileURLToPath(new URL('./strategies.mjs', import.meta.url)))
const sampleSource = resolve(named.sample ?? sampleFile)
const limit = named.limit ? Number(named.limit) : Infinity
const messageOf = error => error instanceof Error ? error.message : String(error)

/** The error text of a message with no valid circuit starts with its kind. */
export function errorKind(error) {
  if (!error) return null
  const invalid = /^invalid circuit: ([a-z-]+)/u.exec(error)
  if (invalid) return `invalid circuit (${invalid[1]})`
  return /^(no circuit|crash|timeout)/u.exec(error)?.[1] ?? 'other'
}
const median = values => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null }

if (named.child) await child()
else if (process.argv[1] && resolve(process.argv[1]) === thisFile) await parent()

// ---- one strategy, in its own process
async function child() {
  delete process.env.SOP_KNOWLEDGE_DIR
  const send = message => new Promise((done, failed) => process.send(message, error => error ? failed(error) : done()))
  const leave = async message => { await send(message); process.exit(0) }
  let strategy
  try {
    const {strategyModules} = await import(pathToFileURL(strategiesFile).href)
    const [entry, exported] = strategyModules[named.child]
    strategy = (await import(new URL(entry, pathToFileURL(strategiesFile)).href))[exported]
  } catch (error) { await leave({type: 'failed', error: 'the module could not be loaded: ' + messageOf(error)}) }
  if (strategy?.schema !== 'syntax') await leave({type: 'not ported'})
  const sample = readSample(sampleSource).slice(0, limit)
  const started = performance.now()
  let reader
  const {knowledgeDir, strategy: _, ...configuration} = typeof named.options === 'string' ? readJson(resolve(named.options))[named.child] ?? {} : {}
  try { reader = await createReader({...configuration, strategy}) } catch (error) { await leave({type: 'failed', error: 'the strategy could not be opened: ' + messageOf(error)}) }
  await send({type: 'ready', startupMs: Math.round(performance.now() - started)})
  for (let index = Number(named.from ?? 0); index < sample.length; index++) {
    const start = performance.now()
    let row
    try {
      const result = await reader.propose(sample[index].text)
      const circuit = result.candidates?.[0]?.sop
      if (typeof circuit === 'string') row = {sop: circuit, error: null}
      else if (result.rejected?.length) row = {sop: null, error: 'invalid circuit: ' + [...new Set(result.rejected[0].check.findings.map(finding => finding.code))].join(', ')}
      else row = {sop: null, error: 'no circuit: ' + (result.error ?? 'The strategy returned no circuit.')}
    } catch (error) { row = {sop: null, error: 'crash: ' + messageOf(error)} }
    await send({type: 'row', index, row: {...row, ms: Math.round((performance.now() - start) * 1000) / 1000}})
  }
  try { await reader.close?.() } catch { /* the circuits are already delivered */ }
  await leave({type: 'done'})
}

// ---- the run
async function parent() {
  if (!words[0]) { console.error('Usage: node tests/benchmark/syntax/run.mjs <run-folder> [--sample <file>] [--only a,b] [--limit n] [--reuse <folder>]'); process.exit(2) }
  const runDir = resolve(words[0])
  mkdirSync(join(runDir, 'logs'), {recursive: true})
  const sample = readSample(sampleSource).slice(0, limit)
  const {strategyModules} = await import(pathToFileURL(strategiesFile).href)
  const only = typeof named.only === 'string' ? named.only.split(',').map(name => name.trim()).filter(Boolean) : null
  const unknown = (only ?? []).filter(name => !strategyModules[name])
  if (unknown.length) { console.error(`Unknown strategy: ${unknown.join(', ')}. Known: ${Object.keys(strategyModules).join(', ')}`); process.exit(2) }
  const names = only ?? Object.keys(strategyModules)
  const reuseDir = typeof named.reuse === 'string' ? resolve(named.reuse) : null
  const timeoutMs = 1000 * Number(named.timeout ?? 120), startTimeoutMs = Math.max(timeoutMs, 900000), maxRestarts = 20
  const summaryFile = join(runDir, 'summary.json')
  const summary = existsSync(summaryFile) ? readJson(summaryFile) : {}
  Object.assign(summary, {run: basename(runDir), sample: relative(packageRoot, sampleSource), messages: sample.length, strategies: summary.strategies ?? {}})

  /** One start of the strategy's process, from message `from` on. */
  const attempt = (name, from, rows) => new Promise(done => {
    const log = openSync(join(runDir, 'logs', name + '.log'), 'a')
    const environment = {...process.env}
    delete environment.SOP_KNOWLEDGE_DIR
    const options = ['--child', name, '--from', String(from), '--strategies', strategiesFile, '--sample', sampleSource,
      ...(Number.isFinite(limit) ? ['--limit', String(limit)] : []), ...(typeof named.options === 'string' ? ['--options', resolve(named.options)] : [])]
    const worker = fork(thisFile, options, {stdio: ['ignore', log, log, 'ipc'], env: environment})
    let next = from, ready = false, startupMs = null, outcome = null, timer
    const finish = result => { if (outcome) return; outcome = result; clearTimeout(timer) }
    const watch = () => { clearTimeout(timer); timer = setTimeout(() => { finish(ready ? {kind: 'timeout', at: next} : {kind: 'failed', error: `the strategy was not ready after ${startTimeoutMs / 1000} seconds`}); worker.kill('SIGKILL') }, ready ? timeoutMs : startTimeoutMs) }
    watch()
    worker.on('message', message => {
      if (message.type === 'ready') { ready = true; startupMs = message.startupMs; watch() }
      else if (message.type === 'row') { rows[message.index] = message.row; next = message.index + 1; watch(); if (next % 200 === 0) console.error(`  ${name}: ${next} of ${rows.length}`) }
      else if (message.type === 'done') finish({kind: 'done'})
      else if (message.type === 'not ported') finish({kind: 'not ported'})
      else if (message.type === 'failed') finish({kind: 'failed', error: message.error})
    })
    let settled = false
    const settle = () => { if (settled) return; settled = true; closeSync(log); done({...outcome, startupMs}) }
    worker.on('error', error => { finish({kind: 'failed', error: messageOf(error)}); settle() })
    worker.on('exit', (code, signal) => {
      const how = signal ? `signal ${signal}` : `exit code ${code}`
      finish(ready ? {kind: 'crash', at: next, how} : {kind: 'failed', error: `the strategy process ended before it was ready (${how}); see logs/${name}.log`})
      settle()
    })
  })

  async function runStrategy(name) {
    const reused = reuseDir && join(reuseDir, name + '.jsonl')
    if (reused && existsSync(reused)) return {status: 'reused', reusedFrom: relative(packageRoot, reused), rows: takeOver(readJsonl(reused), sample)}
    const rows = new Array(sample.length).fill(null)
    let from = 0, restarts = 0, startupMs = null
    while (from < sample.length) {
      const outcome = await attempt(name, from, rows)
      startupMs ??= outcome.startupMs
      if (outcome.kind === 'done') break
      if (outcome.kind === 'not ported') return {status: 'not ported'}
      if (outcome.kind === 'failed' && !rows.some(Boolean)) return {status: 'failed to start', error: outcome.error}
      const lost = outcome.kind === 'failed' ? `crash: not run: ${outcome.error}`
        : restarts >= maxRestarts ? `crash: not run: the strategy was stopped after ${maxRestarts} restarts` : null
      if (lost) { for (let index = from; index < rows.length; index++) rows[index] ??= {sop: null, error: lost, ms: null}; break }
      rows[outcome.at] = outcome.kind === 'timeout' ? {sop: null, error: `timeout: no circuit within ${timeoutMs / 1000} seconds`, ms: timeoutMs}
        : {sop: null, error: `crash: the strategy process ended on this message (${outcome.how})`, ms: null}
      from = outcome.at + 1
      restarts++
    }
    for (let index = 0; index < rows.length; index++) rows[index] ??= {sop: null, error: 'crash: not run', ms: null}
    return {status: 'ran', startupMs, restarts, rows}
  }

  async function oneStrategy(name) {
    console.error(`${name}: started`)
    let result
    try { result = await runStrategy(name) } catch (error) { result = {status: 'failed to start', error: messageOf(error)} }
    const {rows, ...entry} = result
    if (rows) {
      writeJsonl(join(runDir, name + '.jsonl'), rows.map((row, index) => ({id: sample[index].id, text: sample[index].text, sop: row.sop, error: row.error, ms: row.ms})))
      const errors = {}
      for (const row of rows) if (!row.sop) errors[errorKind(row.error) ?? 'other'] = (errors[errorKind(row.error) ?? 'other'] ?? 0) + 1
      Object.assign(entry, {file: name + '.jsonl', messages: rows.length, valid: rows.filter(row => row.sop).length, errors, medianMs: median(rows.map(row => row.ms))})
    }
    summary.strategies[name] = entry
    writeJson(summaryFile, summary)
    console.error(`${name}: ${entry.status}${entry.error ? ' — ' + entry.error : ''}`)
  }

  const queue = [...names], jobs = Math.max(1, Number(named.jobs ?? 1))
  await Promise.all(Array.from({length: Math.min(jobs, queue.length)}, async () => { while (queue.length) await oneStrategy(queue.shift()) }))
  writeJson(summaryFile, summary)

  console.log(`Run ${summary.run}: ${sample.length} messages of ${summary.sample}`)
  console.log('| Strategy | Status | Messages | Valid circuits | Errors by kind | Median ms |\n| --- | --- | ---: | ---: | --- | ---: |')
  for (const name of names) {
    const entry = summary.strategies[name]
    const errors = Object.entries(entry.errors ?? {}).map(([kind, count]) => `${kind}: ${count}`).join('; ')
    console.log(`| ${name} | ${entry.status}${entry.error ? ': ' + entry.error : ''} | ${entry.messages ?? ''} | ${entry.valid ?? ''} | ${errors} | ${entry.medianMs ?? ''} |`)
  }
  console.log(`Written: ${relative(process.cwd(), summaryFile)}`)
}

/** Rows of an existing file, matched to the sample by id; every circuit is checked again. */
export function takeOver(existing, sample) {
  const byId = new Map(existing.map(row => [row.id, row]))
  return sample.map(({id, text}) => {
    const row = byId.get(id)
    if (!row) return {sop: null, error: 'no circuit: the reused file has no line for this message', ms: null}
    if (row.text !== text) return {sop: null, error: 'no circuit: the reused file has another text under this id', ms: null}
    const ms = Number.isFinite(row.ms) ? row.ms : null
    if (typeof row.sop !== 'string') return {sop: null, error: errorKind(row.error) && errorKind(row.error) !== 'other' ? row.error : 'no circuit: ' + (row.error ?? 'the reused file holds no circuit'), ms}
    const check = validateSyntax(text, row.sop)
    return check.valid ? {sop: row.sop, error: null, ms} : {sop: null, error: 'invalid circuit: ' + [...new Set(check.findings.map(finding => finding.code))].join(', '), ms}
  })
}
