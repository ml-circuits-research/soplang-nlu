import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {arch, cpus, platform} from 'node:os'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {Worker} from 'node:worker_threads'
import {gunzipSync, gzipSync} from 'node:zlib'
import {compareAlternatives} from '../../lib/compare-alternatives.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const workspace = resolve(process.env.SOP_WORKSPACE ?? join(root, '..'))
const [sourceArg, destinationArg, ...extraArgs] = process.argv.slice(2)
if (extraArgs.length || sourceArg === '--help') {
  console.log('Usage: node tests/benchmark/port-run.mjs [prior-run-directory|-] [new-output-directory]')
  console.log('Defaults to a fresh 1% sample at dataset HEAD and eight workers per strategy.')
  console.log('Environment: SOP_WORKSPACE, KNOWLEDGE_DIR, WORKERS, PROGRESS_EVERY, SAMPLE_PERCENT, SAMPLE_SEED, Z3_MODULE, SWIPL')
  process.exit(extraArgs.length ? 1 : 0)
}

const workers = Number(process.env.WORKERS ?? 8)
const progressEvery = Number(process.env.PROGRESS_EVERY ?? 25)
if (![workers, progressEvery].every(value => Number.isSafeInteger(value) && value > 0)) {
  throw Error('WORKERS and PROGRESS_EVERY must be positive integers.')
}

const hash = value => createHash('sha256').update(value).digest('hex')
async function freshSample() {
  const percent = Number(process.env.SAMPLE_PERCENT ?? 1)
  if (!(percent > 0 && percent <= 100)) throw Error('SAMPLE_PERCENT must be greater than 0 and at most 100.')
  const seed = process.env.SAMPLE_SEED ?? '42'
  const dataset = join(workspace, 'webmeet-dataset')
  const git = (...args) => execFileSync('git', ['-C', dataset, ...args], {
    encoding: 'utf8', maxBuffer: 128 * 1024 * 1024
  })
  const revision = git('rev-parse', 'HEAD').trim()
  const {readRecords} = await import(pathToFileURL(join(dataset, 'tools/rows.mjs')))
  const pool = []
  for (const file of git('ls-tree', '-r', '--name-only', revision).split('\n')) {
    if (!/^(diagram|drawing|calendar|document)\/[^/]+\.csv$/.test(file)) continue
    const parsed = readRecords(git('show', revision + ':' + file))
    if (!parsed.ok) throw Error(file + ': ' + parsed.why)
    for (const record of parsed.records) {
      const id = file + '#' + record.record
      pool.push({score: hash(seed + '\0' + id), row: {
        id, text: record.text, references: record.circuits.map(circuit => circuit.sop)
      }})
    }
  }
  pool.sort((a, b) => a.score.localeCompare(b.score))
  const rows = pool.slice(0, Math.max(1, Math.round(pool.length * percent / 100))).map(item => item.row)
  return {sample: gzipSync(JSON.stringify(rows)), revision, seed, percent, population: pool.length}
}

function priorSample(directory) {
  const {revision, seed, percent, population} = JSON.parse(readFileSync(join(directory, 'environment.json'), 'utf8'))
  return {sample: readFileSync(join(directory, 'sample.json.gz')), revision, seed, percent, population}
}

const strategyLabel = name => name === 'prolog-worlds' ? 'prolog' : name

function runWorker(name, options, rows, index) {
  return new Promise((resolveResult, reject) => {
    const label = `${strategyLabel(name)} worker ${index + 1}`
    console.log(`${label} opening for ${rows.length} requests`)
    const worker = new Worker(new URL('./port-worker.mjs', import.meta.url), {
      workerData: {name, options, rows, progressEvery}
    })
    let result
    worker.on('message', message => {
      if (message.records) result = message
      else console.log(`${label} ${message.completed}/${message.total}`)
    })
    worker.on('error', error => reject(Error(label + ': ' + error.message, {cause: error})))
    worker.on('exit', code => {
      if (code === 0 && result) resolveResult({...result, worker: index + 1})
      else reject(Error(`${label} exited with code ${code} without a complete result`))
    })
  })
}

const source = sourceArg && sourceArg !== '-' ? resolve(sourceArg) : null
const dir = resolve(destinationArg ?? join(root, 'eval-results', 'ports-' + new Date().toISOString().replaceAll(':', '-')))
if (source) {
  const fromSource = relative(source, dir)
  if (!isAbsolute(fromSource) && fromSource.split(sep)[0] !== '..') {
    throw Error('Choose an output directory outside the prior run directory.')
  }
}
const {sample, ...sampleMetadata} = source ? priorSample(source) : await freshSample()
const rows = JSON.parse(gunzipSync(sample))
if (!Array.isArray(rows) || !rows.length || rows.some(row =>
  !row || typeof row.id !== 'string' || typeof row.text !== 'string' ||
  !Array.isArray(row.references) || row.references.some(reference => typeof reference !== 'string')
) || new Set(rows.map(row => row.id)).size !== rows.length) {
  throw Error('The benchmark requires a nonempty sample with unique IDs, text, and reference arrays.')
}

const knowledgeDir = resolve(process.env.KNOWLEDGE_DIR ?? process.env.SOP_KNOWLEDGE_DIR ??
  join(workspace, 'sop-knowledge-worlds'))
const strategies = {
  z3: {knowledgeDir, topK: 8, z3Module: process.env.Z3_MODULE ? resolve(process.env.Z3_MODULE) : undefined},
  'prolog-worlds': {knowledgeDir, evidence: true, swipl: process.env.SWIPL}
}

mkdirSync(dirname(dir), {recursive: true})
mkdirSync(dir)
const save = (name, data) => writeFileSync(join(dir, name), JSON.stringify(data, null, 2) + '\n')
const activeWorkers = Math.min(workers, rows.length)
save('environment.json', {
  ...sampleMetadata, sample: rows.length, source, sampleSha256: hash(sample),
  workers, activeWorkers, node: process.version, cpu: cpus()[0]?.model, platform: platform(), arch: arch(),
  strategies
})
writeFileSync(join(dir, 'sample.json.gz'), sample)

const partitions = Array.from({length: activeWorkers}, () => [])
for (const [index, {id, text}] of rows.entries()) partitions[index % activeWorkers].push({id, text})

for (const [name, options] of Object.entries(strategies)) {
  const label = strategyLabel(name)
  console.log(`${label} starting ${rows.length} requests in ${dir}`)
  const start = performance.now()
  const batches = await Promise.allSettled(partitions.map((batch, index) => runWorker(name, options, batch, index)))
  const wallMs = performance.now() - start
  const failures = batches.flatMap(batch => batch.status === 'rejected' ? [batch.reason.message] : [])
  const completed = batches.flatMap(batch => batch.status === 'fulfilled' ? [batch.value] : [])
  const predictions = new Map(completed.flatMap(batch => batch.records).map(record => [record.id, record]))
  const records = rows.flatMap(({id, references}) => {
    const record = predictions.get(id)
    if (!record) return []
    return [{...record, comparison: compareAlternatives(references, record.candidates)}]
  })
  const latencies = records.map(record => record.latencyMs).sort((a, b) => a - b)
  const summary = {
    wallMs, requests: records.length, expectedRequests: rows.length,
    requestsPerSecond: records.length * 1000 / wallMs,
    medianMs: latencies[Math.ceil(latencies.length * 0.5) - 1] ?? null,
    p95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1] ?? null,
    errors: records.filter(record => record.error).length,
    withExactMatch: records.filter(record => record.comparison.matched).length,
    workerTiming: completed.map(batch => ({worker: batch.worker, ...batch.timing})),
    failures
  }
  save(name + '.json', summary)
  writeFileSync(join(dir, name + '.jsonl.gz'), gzipSync(records.map(record => JSON.stringify(record)).join('\n')))
  console.log(label, JSON.stringify(summary))
  if (failures.length || summary.errors || records.length !== rows.length) {
    console.error(`${label} recorded ${summary.errors} reader errors and ${failures.length} worker failures.`)
    process.exitCode = 1
  }
}
