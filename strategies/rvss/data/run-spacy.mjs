// rvss data, step 1: the spaCy strategy over every message of the dataset, in parallel worker processes.
//
//   node strategies/rvss/data/run-spacy.mjs [--code <tree>] [--out <folder>] [--workers 10] [--dataset <webmeet-dataset>]
//        [--stride n] [--limit n] [--dir semantic] [--prefix '']
//
// --dir is the dataset folder whose CSV files are read (default semantic; syntactic/general for the general corpora,
// which have no semantic file); `file` in the output is --prefix + the path inside --dir (e.g. general/sgd/0013.csv).
// --code is a copy of the soplang-nlu code that holds lib/ and strategies/{spacy,spacy-beam,spacy-direct,
// neural-dependencies}/ (made with `git archive <commit> ... | tar -x`), so the run reads one commit's code even
// when the working tree changes while it runs. Default: this repository.
// Every message of <dataset>/semantic/**/*.csv (one per row, `row` = the record number from 1, as the
// dataset's reader counts) is read through createReader({strategy: spacy}) exactly as the syntax benchmark does
// (tests/benchmark/syntax/run.mjs: sop of the first valid candidate, else the error; ms around propose()).
// The parser's raw output (greedy tokens and beam alternatives) is recorded beside it, by an observing wrapper
// around the parser transport, so later commits of the writer can be run again without the parser (rewrite.mjs).
//
// Output: <out>/run.jsonl, one line per message {file, row, text, sop, error, ms, parse}, appended as results
// come. The run resumes: messages already in run.jsonl are skipped; a cut last line is cut off before appending.
import {fork} from 'node:child_process'
import {appendFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, ftruncateSync, closeSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createInterface} from 'node:readline'
import {createReadStream} from 'node:fs'

const thisFile = fileURLToPath(import.meta.url)
const repo = resolve(thisFile, '../../../..')
const args = process.argv.slice(2)
const opt = (name, fallback) => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : fallback }
const code = resolve(opt('code', repo))
const out = resolve(opt('out', join(repo, '.local-data/rvss/spacy-run')))
const workers = Number(opt('workers', 10))
const dataset = resolve(opt('dataset', join(repo, '../webmeet-dataset')))
const limit = Number(opt('limit', Infinity))
const dir = opt('dir', 'semantic'), prefix = opt('prefix', '')
const stride = Number(opt('stride', 1))     // every stride-th message only: a sample to check a rewrite against the live strategy

// ---- CSV: the same records as tests/benchmark/syntax/lib.mjs readCsv (checked on every file of the dataset by
// check-csv.mjs), built from slices instead of one character at a time, which holds the whole dataset in a few
// hundred MB instead of several GB; copied so the run does not depend on that folder.
export function readCsv(content) {
  const rows = [], n = content.length
  let row = [], field = '', quoted = false, at = 0
  while (at < n) {
    if (quoted) {
      const q = content.indexOf('"', at)
      if (q < 0) { field += content.slice(at); at = n; break }
      field += content.slice(at, q)
      if (content[q + 1] === '"') { field += '"'; at = q + 2 } else { quoted = false; at = q + 1 }
      continue
    }
    let j = at
    while (j < n) { const c = content.charCodeAt(j); if (c === 34 || c === 44 || c === 10 || c === 13) break; j++ }
    field += content.slice(at, j)
    if (j >= n) break
    const sign = content[j]; at = j + 1
    if (sign === '"') quoted = true
    else if (sign === ',') { row.push(field); field = '' }
    else if (sign === '\n') { row.push(field); rows.push(row); row = []; field = '' }
  }
  if (field || row.length) rows.push([...row, field])
  return rows.filter(cells => !(cells.length === 1 && cells[0] === ''))
}
export const csvFilesOf = dir => readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  .flatMap(entry => entry.isDirectory() ? csvFilesOf(join(dir, entry.name)).map(file => entry.name + '/' + file) : entry.name.endsWith('.csv') ? [entry.name] : [])
/** Every message of a folder of dataset CSV files: [{file, row, text}], and the other cells when `keep` */
export function messagesOf(dir, keep = false) {
  const all = []
  for (const file of csvFilesOf(dir)) {
    const [header, ...records] = readCsv(readFileSync(join(dir, file), 'utf8'))
    if (header?.[0] !== 'text') throw Error(file + ': the first column is not `text`')
    records.forEach((cells, index) => all.push(keep ? {file, row: index + 1, text: cells[0], cells} : {file, row: index + 1, text: cells[0]}))
  }
  return all
}

// ---- the parser's output, compact: greedy tokens once, alternatives as heads and labels
const packParse = ({tokens, alternatives}) => ({
  t: tokens.map(k => [k.text, k.start, k.end, k.pos, k.tag, k.dep, k.head, k.lemma]),
  a: alternatives.map(({score, tokens: graph}) => [score, graph.map(k => k.head), graph.map(k => k.dep)])
})
export const unpackParse = ({t, a}) => {
  const tokens = t.map(([text, start, end, pos, tag, dep, head, lemma], i) => ({i, text, start, end, pos, tag, dep, head, lemma}))
  return {tokens, alternatives: a.map(([score, heads, deps]) => ({score, tokens: tokens.map((k, i) => ({...k, head: heads[i], dep: deps[i]}))}))}
}

async function child() {
  delete process.env.SOP_KNOWLEDGE_DIR
  const {createReader} = await import(pathToFileURL(join(code, 'lib/reader.mjs')).href)
  const {spacy} = await import(pathToFileURL(join(code, 'strategies/spacy/index.mjs')).href)
  const {spacyDependencies} = await import(pathToFileURL(join(code, 'strategies/neural-dependencies/index.mjs')).href)
  let last = null
  // observes the transport; what the strategy receives is unchanged
  const recording = {name: 'spacy', async open(options) {
    const backend = await spacyDependencies.open(options)
    return {...backend, async parseBeam(text) { const result = await backend.parseBeam(text); last = result; return result }}
  }}
  const reader = await createReader({strategy: spacy, maxReadings: 1, syntaxModel: recording})
  process.send({type: 'ready'})
  process.on('message', async ({jobs}) => {
    const rows = []
    for (const {key, text} of jobs) {
      last = null
      const start = performance.now()
      let row
      try {
        const result = await reader.propose(text)
        const circuit = result.candidates?.[0]?.sop
        if (typeof circuit === 'string') row = {sop: circuit, error: null}
        else if (result.rejected?.length) row = {sop: null, error: 'invalid circuit: ' + [...new Set(result.rejected[0].check.findings.map(finding => finding.code))].join(', ')}
        else row = {sop: null, error: 'no circuit: ' + (result.error ?? 'The strategy returned no circuit.')}
      } catch (error) { row = {sop: null, error: 'crash: ' + (error?.message ?? String(error))} }
      const ms = Math.round((performance.now() - start) * 1000) / 1000
      // the parser process died: leave, so the parent starts a new worker and gives the jobs again
      if (row.error?.includes('Dependency parser exited')) { console.error(row.error); process.exit(3) }
      rows.push({key, ...row, ms, parse: last ? packParse(last) : null})
    }
    process.send({type: 'rows', rows})
  })
}

async function readDone(file) {
  const done = new Set()
  if (!existsSync(file)) return done
  // a line cut by an interruption is cut off, so the next append starts on a fresh line
  const size = statSync(file).size
  if (size) {
    const fd = openSync(file, 'r+'), buf = Buffer.alloc(Math.min(size, 1 << 20))
    const at = size - buf.length
    require_read(fd, buf, at)
    const lastNewline = buf.lastIndexOf(10)
    if (lastNewline !== buf.length - 1) { ftruncateSync(fd, lastNewline < 0 ? at : at + lastNewline + 1); console.error('cut a partial last line') }
    closeSync(fd)
  }
  const lines = createInterface({input: createReadStream(file), crlfDelay: Infinity})
  for await (const line of lines) { if (!line) continue; const {file: f, row} = JSON.parse(line); done.add(f + '#' + row) }
  return done
}
import {readSync} from 'node:fs'
function require_read(fd, buf, position) { let got = 0; while (got < buf.length) { const n = readSync(fd, buf, got, buf.length - got, position + got); if (!n) break; got += n } }

async function parent() {
  mkdirSync(out, {recursive: true})
  const runFile = join(out, 'run.jsonl')
  const all = messagesOf(join(dataset, dir)).map(m => ({...m, file: prefix + m.file})).filter((_, i) => i % stride === 0).slice(0, limit)
  const done = await readDone(runFile)
  const todo = all.filter(m => !done.has(m.file + '#' + m.row))
  const meta = {started: new Date().toISOString(), code, dataset, dir, prefix, messages: all.length, alreadyDone: done.size, todo: todo.length, workers,
    python: process.env.SOP_NLU_SYNTAX_PYTHON, model: process.env.SOP_NLU_SYNTAX_MODEL}
  appendFileSync(join(out, 'runs.log'), JSON.stringify(meta) + '\n')
  console.error(JSON.stringify(meta))
  if (!todo.length) return
  const byKey = new Map(todo.map(m => [m.file + '#' + m.row, m]))
  let next = 0, finished = 0, live = 0
  const started = performance.now(), BATCH = 4
  const fd = openSync(runFile, 'a')
  const env = {...process.env}; delete env.SOP_KNOWLEDGE_DIR
  await new Promise(allDone => {
    const give = worker => {
      if (next >= todo.length) { worker.kill(); return false }
      const jobs = todo.slice(next, next + BATCH).map(m => ({key: m.file + '#' + m.row, text: m.text})); next += jobs.length
      worker.inFlight = jobs
      worker.send({jobs}); return true
    }
    const start = k => {
      live++
      const worker = fork(thisFile, ['--child', '--code', code], {stdio: ['ignore', 'inherit', 'pipe', 'ipc'], env})
      let tail = ''
      worker.stderr.setEncoding('utf8').on('data', d => { tail = (tail + d).slice(-2000) })
      worker.on('message', message => {
        if (message.type === 'ready') { give(worker); return }
        if (message.type === 'rows') {
          let text = ''
          for (const {key, ...row} of message.rows) {
            const m = byKey.get(key)
            text += JSON.stringify({file: m.file, row: m.row, text: m.text, ...row}) + '\n'
          }
          appendFileSync(fd, text)
          finished += message.rows.length; worker.inFlight = null
          if (finished % 2000 < BATCH) {
            const s = (performance.now() - started) / 1000
            console.error(`${finished}/${todo.length} ${(finished / s).toFixed(1)} msg/s, ${s.toFixed(0)} s, eta ${((todo.length - finished) / (finished / s) / 60).toFixed(1)} min`)
          }
          give(worker)
        }
      })
      worker.on('exit', (codeOrSignal, signal) => {
        live--
        if (worker.inFlight) {   // a worker died with jobs in hand: give them to a new worker
          console.error(`worker ${k} exited (${codeOrSignal ?? signal}) with ${worker.inFlight.length} jobs: ${tail.slice(-500)}`)
          for (const job of worker.inFlight) {
            const m = byKey.get(job.key); m.tries = (m.tries ?? 0) + 1
            if (m.tries < 3) todo.push(m)
            else { appendFileSync(fd, JSON.stringify({file: m.file, row: m.row, text: m.text, sop: null, error: 'crash: the worker died 3 times on this batch', ms: null, parse: null}) + '\n'); finished++ }
          }
          start(k)
        }
        if (live === 0) allDone()
      })
    }
    for (let k = 0; k < workers; k++) start(k)
  })
  closeSync(fd)
  const s = (performance.now() - started) / 1000
  const end = {finished: new Date().toISOString(), wrote: finished, seconds: Math.round(s), perSecond: +(finished / s).toFixed(2)}
  appendFileSync(join(out, 'runs.log'), JSON.stringify(end) + '\n')
  console.error(JSON.stringify(end))
}

if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  if (args.includes('--child')) await child()
  else await parent()
}
