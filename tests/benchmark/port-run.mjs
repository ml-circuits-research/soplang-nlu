import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, rmdirSync, writeFileSync} from 'node:fs'
import {arch, cpus, platform, tmpdir} from 'node:os'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Worker} from 'node:worker_threads'
import {gunzipSync, gzipSync} from 'node:zlib'
import {compareAlternatives} from '../../lib/compare-alternatives.mjs'
import {datasetRevision, readCommittedRows, splitTrainingRows} from './train-split.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const workspace = resolve(process.env.SOP_WORKSPACE ?? join(root, '..'))
const dataset = join(workspace, 'webmeet-dataset')
const exampleTransfer = 'prolog-example-transfer'
const [sourceArg, destinationArg, ...extraArgs] = process.argv.slice(2)
if (extraArgs.length || sourceArg === '--help') {
  console.log('Usage: node tests/benchmark/port-run.mjs [prior-run-directory|-] [new-output-directory]')
  console.log('Defaults to a fresh 1% sample at dataset HEAD and eight workers per strategy.')
  console.log('Environment: SOP_WORKSPACE, KNOWLEDGE_DIR, WORKERS, PROGRESS_EVERY, SAMPLE_PERCENT, SAMPLE_SEED, Z3_MODULE, SWIPL')
  console.log('Select strategy names with STRATEGIES=z3,prolog,prolog-example-transfer.')
  console.log('Use APPEND=1 with an existing output directory and select only new strategies.')
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
  const revision = datasetRevision(dataset)
  const pool = []
  for await (const row of readCommittedRows(dataset, revision)) {
    pool.push({score: hash(seed + '\0' + row.id), row})
  }
  pool.sort((a, b) => a.score.localeCompare(b.score))
  const rows = pool.slice(0, Math.max(1, Math.round(pool.length * percent / 100))).map(item => item.row)
  return {sample: gzipSync(JSON.stringify(rows)), revision, seed, percent, population: pool.length}
}

async function trainModel(revision, evaluationRows, options, save) {
  if (!revision) throw Error('Training requires the dataset revision in environment.json.')
  const pinnedRevision = datasetRevision(dataset, revision)
  const splitStart = performance.now()
  const {training, metadata} = await splitTrainingRows(readCommittedRows(dataset, pinnedRevision), evaluationRows)
  const splitMs = performance.now() - splitStart
  console.log(`${exampleTransfer} training on ${metadata.trainingRows} rows and ${metadata.trainingCircuits} circuits after excluding ${metadata.excludedRows} rows`)
  const {trainExampleTransfer} = await import('../../strategies/prolog-example-transfer/index.mjs')
  const trainStart = performance.now()
  const model = await trainExampleTransfer(training, {knowledgeDir: options.knowledgeDir})
  const trainingMs = performance.now() - trainStart
  if (model.trainingRows !== training.length) throw Error('Example transfer model row count does not match training split.')
  const modelBytes = JSON.stringify(model) + '\n'
  writeFileSync(options.modelPath, modelBytes, {flag: 'wx'})
  save(exampleTransfer + '-training.json', {
    ...metadata, revision: pinnedRevision, splitMs, trainingMs,
    modelSha256: hash(modelBytes), modelVersion: model.version,
    modelTemplates: model.templates.length, modelTraining: model.training
  })
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

const append = process.env.APPEND === '1'
const dir = resolve(destinationArg ?? join(root, 'eval-results', 'ports-' + new Date().toISOString().replaceAll(':', '-')))
const source = sourceArg && sourceArg !== '-' ? resolve(sourceArg) : append ? dir : null
if (append && !destinationArg) throw Error('APPEND=1 requires an explicit output directory.')
if (source && !(append && source === dir)) {
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
  'prolog-worlds': {knowledgeDir, evidence: true, swipl: process.env.SWIPL},
  [exampleTransfer]: {
    knowledgeDir, evidence: true, swipl: process.env.SWIPL
  }
}
const selected = (process.env.STRATEGIES ?? Object.keys(strategies).join(','))
  .split(',').map(name => name.trim() === 'prolog' ? 'prolog-worlds' : name.trim())
if (new Set(selected).size !== selected.length || selected.some(name => !Object.hasOwn(strategies, name))) {
  throw Error('STRATEGIES must list unique strategy names.')
}
if (append && !process.env.STRATEGIES) throw Error('APPEND=1 requires an explicit STRATEGIES list.')

if (append) {
  const prior = JSON.parse(readFileSync(join(dir, 'environment.json'), 'utf8'))
  if (!readFileSync(join(dir, 'sample.json.gz')).equals(sample) || prior.revision !== sampleMetadata.revision) {
    throw Error('Append requires the same frozen evaluation sample and dataset revision.')
  }
  if (prior.workers !== workers) throw Error('Append requires the original worker count.')
} else {
  mkdirSync(dirname(dir), {recursive: true})
  mkdirSync(dir)
}
const lock = join(dir, '.port-run.lock')
mkdirSync(lock)
process.once('exit', () => rmdirSync(lock))
const save = (name, data) => writeFileSync(join(dir, name), JSON.stringify(data, null, 2) + '\n', {flag: 'wx'})
for (const name of selected) {
  const files = [name + '.json', name + '.jsonl.gz', name + '-environment.json']
  if (name === exampleTransfer) files.push(name + '-training.json')
  for (const file of files) {
    if (existsSync(join(dir, file))) throw Error('Benchmark artifact already exists: ' + join(dir, file))
  }
}
const activeWorkers = Math.min(workers, rows.length)
const environment = {
  ...sampleMetadata, sample: rows.length, source, sampleSha256: hash(sample),
  workers, activeWorkers, node: process.version, cpu: cpus()[0]?.model, platform: platform(), arch: arch(),
  libraryRevision: execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  knowledgeRevision: (() => {
    try { return execFileSync('git',['-C',knowledgeDir,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim() }
    catch { return null }
  })(),
  z3SolverVersion: selected.includes('z3')
    ? JSON.parse(readFileSync(join(root, 'strategies/z3/package.json'), 'utf8')).dependencies['z3-solver']
    : undefined,
  prologVersion: selected.some(name => name !== 'z3')
    ? execFileSync(strategies['prolog-worlds'].swipl || 'swipl', ['--version'], {encoding: 'utf8'}).trim()
    : undefined,
  strategies: Object.fromEntries(selected.map(name => [name, strategies[name]]))
}
if (!append) {
  save('environment.json', environment)
  writeFileSync(join(dir, 'sample.json.gz'), sample, {flag: 'wx'})
}

const partitions = Array.from({length: activeWorkers}, () => [])
for (const [index, {id, text}] of rows.entries()) partitions[index % activeWorkers].push({id, text})

for (const name of selected) {
  const options = {...strategies[name]}
  const label = strategyLabel(name)
  if (name === exampleTransfer) {
    const temporary = mkdtempSync(join(tmpdir(),'soplang-example-transfer-'))
    process.once('exit', () => rmSync(temporary,{recursive:true,force:true}))
    options.modelPath = join(temporary,'templates.json')
    await trainModel(sampleMetadata.revision, rows, options, save)
  }
  if (append) save(name + '-environment.json', {...environment, strategies: {[name]: strategies[name]}})
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
  writeFileSync(join(dir, name + '.jsonl.gz'), gzipSync(records.map(record => JSON.stringify(record)).join('\n')), {flag: 'wx'})
  console.log(label, JSON.stringify(summary))
  if (failures.length || summary.errors || records.length !== rows.length) {
    console.error(`${label} recorded ${summary.errors} reader errors and ${failures.length} worker failures.`)
    process.exitCode = 1
  }
}

const readyToGrade = Object.keys(strategies).every(name => {
  const summaryPath = join(dir,name+'.json')
  if (!existsSync(summaryPath) || !existsSync(join(dir,name+'.jsonl.gz'))) return false
  const summary = JSON.parse(readFileSync(summaryPath,'utf8'))
  return summary.requests === rows.length && summary.failures.length === 0
})
if (readyToGrade) {
  execFileSync(process.execPath,[fileURLToPath(new URL('./grade.mjs',import.meta.url)),dir],{stdio:'inherit'})
}
