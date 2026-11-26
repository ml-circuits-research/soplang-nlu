import {execFileSync, fork} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, rmdirSync, writeFileSync} from 'node:fs'
import {arch, cpus, platform, tmpdir} from 'node:os'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {gunzipSync, gzipSync} from 'node:zlib'
import {compareAlternatives} from '../../lib/compare-alternatives.mjs'
import {readNativeReferences,nativeReferenceDigest} from './native-references.mjs'
import {datasetRevision, readCommittedRows, splitTrainingRows} from './train-split.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const workspace = resolve(process.env.SOP_WORKSPACE ?? join(root, '..'))
const dataset = join(workspace, 'webmeet-dataset')
const exampleTransfer = 'prolog-example-transfer'
const [sourceArg, destinationArg, ...extraArgs] = process.argv.slice(2)
if (extraArgs.length || sourceArg === '--help') {
  console.log('Usage: node tests/benchmark/port-run.mjs [prior-run-directory|-] [new-output-directory]')
  console.log('Defaults to a fresh 1% sample at dataset HEAD and eight workers per strategy.')
  console.log('Environment: SOP_WORKSPACE, KNOWLEDGE_DIR, DATASET_REVISION, WORKERS, PROGRESS_EVERY, SAMPLE_PERCENT, SAMPLE_SEED, Z3_MODULE, SWIPL')
  console.log('Select strategy names with STRATEGIES=z3,prolog,prolog-example-transfer,spacy-direct,spacy-beam,neuro-z3,neuro-prolog,neuro-selector.')
  console.log('Use APPEND=1 with an existing output directory and select only new strategies.')
  console.log('WORKER_TIMEOUT_MS sets the wall limit per startup, request or shutdown (default 300000).')
  process.exit(extraArgs.length ? 1 : 0)
}

const evaluatedSchema = process.env.EVAL_SCHEMA ?? 'nlu'
if (!['nlu','w.request'].includes(evaluatedSchema)) throw Error('Expected EVAL_SCHEMA=nlu or w.request.')
const workers = Number(process.env.WORKERS ?? 8)
const progressEvery = Number(process.env.PROGRESS_EVERY ?? 25)
const workerTimeoutMs = Number(process.env.WORKER_TIMEOUT_MS ?? 300000)
if (![workers, progressEvery].every(value => Number.isSafeInteger(value) && value > 0)) {
  throw Error('WORKERS and PROGRESS_EVERY must be positive integers.')
}
if (!Number.isSafeInteger(workerTimeoutMs) || workerTimeoutMs < 1 || workerTimeoutMs > 2147483647) {
  throw Error('WORKER_TIMEOUT_MS must be an integer between 1 and 2147483647.')
}

const hash = value => createHash('sha256').update(value).digest('hex')
async function freshSample() {
  const percent = Number(process.env.SAMPLE_PERCENT ?? 1)
  if (!(percent > 0 && percent <= 100)) throw Error('SAMPLE_PERCENT must be greater than 0 and at most 100.')
  const seed = process.env.SAMPLE_SEED ?? '42'
  const revision = datasetRevision(dataset, process.env.DATASET_REVISION ?? 'HEAD')
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
const workerEntry = fileURLToPath(new URL('./port-child.mjs', import.meta.url))
const useProcessGroup = platform() !== 'win32'
const errorRecord = (row, error, latencyMs = null) => ({
  id: row.id, evaluatedSchema, latencyMs, error, candidates: [], checks: [], candidateEvidence: [], unresolved: []
})

function runAttempt(name, options, rows, records, label) {
  return new Promise(resolveAttempt => {
    const start = performance.now()
    const worker = fork(workerEntry, [], {detached: useProcessGroup, stdio: 'inherit'})
    const timing = {requests: 0, proposalMs: 0}
    let stage = 'startup'
    let stageStart = start
    let ready = false
    let closed = false
    let failure
    let timer

    function killWorker() {
      if (!worker.pid) return
      try {
        if (useProcessGroup) process.kill(-worker.pid, 'SIGKILL')
        else worker.kill('SIGKILL')
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }

    function fail(reason) {
      if (failure) return
      failure = `${label} ${stage}: ${reason}`
      clearTimeout(timer)
      killWorker()
    }

    function send(nextStage, message) {
      clearTimeout(timer)
      stage = nextStage
      stageStart = performance.now()
      timer = setTimeout(() => fail(`exceeded ${workerTimeoutMs} ms wall timeout`), workerTimeoutMs)
      worker.send(message, error => {
        if (error) fail(error.message)
      })
    }

    function advance(previousError) {
      if (previousError || records.length === rows.length) {
        send('shutdown', {type: 'close'})
      } else {
        const row = rows[records.length]
        send('request ' + row.id, {type: 'propose', row})
      }
    }

    worker.on('message', message => {
      if (failure) return
      if (message.type === 'ready') {
        ready = true
        timing.startupMs = message.startupMs
        timing.modelLoadMs = message.modelLoadMs
        console.log(`${label} ${records.length}/${rows.length} ready`)
        advance(false)
      } else if (message.type === 'result') {
        const {record} = message
        records.push(record)
        timing.requests++
        timing.proposalMs += record.latencyMs
        if (record.error || records.length % progressEvery === 0 || records.length === rows.length) {
          console.log(`${label} ${records.length}/${rows.length}${record.error ? ' ' + record.id + ': ' + record.error : ''}`)
        }
        advance(record.error)
      } else if (message.type === 'closed') {
        closed = true
        timing.shutdownMs = message.shutdownMs
      }
    })
    worker.on('error', error => fail(error.message))
    worker.on('close', (code, signal) => {
      clearTimeout(timer)
      if (!failure && (!closed || code !== 0)) {
        failure = `${label} ${stage}: exited with ${signal ?? 'code ' + code}`
        killWorker()
      }
      const elapsed = performance.now() - stageStart
      if (failure && stage.startsWith('request ')) {
        records.push(errorRecord(rows[records.length], failure, elapsed))
        timing.requests++
        timing.proposalMs += elapsed
      }
      if (!ready) timing.startupMs = elapsed
      if (stage === 'shutdown' && !closed) timing.shutdownMs = elapsed
      resolveAttempt({...timing, ready, failure, totalMs: performance.now() - start})
    })
    send('startup', {type: 'open', name, options})
  })
}

const percentile = (sorted, fraction) => sorted[Math.ceil(sorted.length * fraction) - 1] ?? null

async function runWorker(name, options, rows, index) {
  const start = performance.now()
  const records = []
  const attempts = []
  const failures = []
  const worker = index + 1
  const label = `${strategyLabel(name)} worker ${worker}`
  while (records.length < rows.length) {
    console.log(`${label} opening for ${rows.length - records.length} requests (attempt ${attempts.length + 1})`)
    const attempt = await runAttempt(name, options, rows, records, label)
    attempts.push(attempt)
    if (attempt.failure) {
      failures.push(attempt.failure)
      console.error(attempt.failure)
    }
    if (!attempt.ready) {
      for (const row of rows.slice(records.length)) records.push(errorRecord(row, attempt.failure))
      break
    }
  }
  const total = key => attempts.reduce((sum, attempt) => sum + (attempt[key] ?? 0), 0)
  const latencies = records.map(record => record.latencyMs).filter(Number.isFinite).sort((a, b) => a - b)
  const proposalMs = total('proposalMs')
  return {records, failures, timing: {
    worker, workers: 1, requests: total('requests'), startupMs: total('startupMs'),
    proposalMs, shutdownMs: total('shutdownMs'), totalMs: performance.now() - start,
    requestsPerSecond: proposalMs > 0 ? 1000 * total('requests') / proposalMs : null,
    medianMs: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95),
    modelLoadMs: attempts.some(attempt => attempt.modelLoadMs !== undefined) ? total('modelLoadMs') : undefined,
    attempts
  }}
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
if (evaluatedSchema === 'nlu') {
  const neural = {python:process.env.SOP_NLU_SYNTAX_PYTHON, model:process.env.SOP_NLU_SYNTAX_MODEL}
  strategies['spacy-beam'] = {knowledgeDir, ...neural}
  strategies['spacy-direct'] = {knowledgeDir, ...neural}
  strategies['neuro-prolog'] = {knowledgeDir, swipl:process.env.SWIPL, ...neural}
  strategies['neuro-selector'] = {knowledgeDir, swipl:process.env.SWIPL, ...neural}
  strategies['neuro-z3'] = {knowledgeDir, z3Module:strategies.z3.z3Module, ...neural}
}
const nativeReferenceRevision = evaluatedSchema === 'nlu'
  ? datasetRevision(dataset, process.env.NATIVE_REFERENCE_REVISION ?? sampleMetadata.revision) : undefined
const nativeReferences = nativeReferenceRevision ? readNativeReferences(dataset, nativeReferenceRevision, rows.map(row=>row.text)) : []
const selected = (process.env.STRATEGIES ?? Object.keys(strategies).filter(name => name !== 'neuro-selector').filter(name => (!name.startsWith('neuro-') && !name.startsWith('spacy-')) || process.env.SOP_NLU_SYNTAX_PYTHON || process.env.SOP_NLU_SYNTAX_MODEL).join(','))
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
  if ((prior.evaluatedSchema ?? 'w.request') !== evaluatedSchema) throw Error('Append requires the original output schema.')
  if ((prior.nativeReferenceRevision ?? prior.revision) !== (nativeReferenceRevision ?? prior.revision)) {
    throw Error('Append requires the original native annotation revision.')
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
  evaluatedSchema, nativeReferenceRevision,
  ...(nativeReferenceRevision ? {nativeReferenceTexts:nativeReferences.length, nativeReferenceSha256:nativeReferenceDigest(nativeReferences)} : {}),
  ...sampleMetadata, sample: rows.length, source, sampleSha256: hash(sample),
  workers, activeWorkers, workerTimeoutMs, node: process.version, cpu: cpus()[0]?.model, platform: platform(), arch: arch(),
  libraryRevision: execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  knowledgeRevision: (() => {
    try { return execFileSync('git',['-C',knowledgeDir,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim() }
    catch { return null }
  })(),
  z3SolverVersion: selected.some(name => name.endsWith('z3'))
    ? JSON.parse(readFileSync(join(root, 'strategies/z3/package.json'), 'utf8')).dependencies['z3-solver']
    : undefined,
  prologVersion: selected.some(name => name.includes('prolog'))
    ? execFileSync(strategies['prolog-worlds'].swipl || 'swipl', ['--version'], {encoding: 'utf8'}).trim()
    : undefined,
  strategies: Object.fromEntries(selected.map(name => [name, strategies[name]]))
}
if (!append) {
  save('environment.json', environment)
  if (nativeReferences.length) writeFileSync(join(dir,'native-references.json.gz'),gzipSync(JSON.stringify(nativeReferences)),{flag:'wx'})
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
  const failures = batches.flatMap(batch => batch.status === 'rejected' ? [batch.reason.message] : batch.value.failures)
  const completed = batches.flatMap(batch => batch.status === 'fulfilled' ? [batch.value] : [])
  const predictions = new Map(completed.flatMap(batch => batch.records).map(record => [record.id, record]))
  const records = rows.flatMap(({id, references}) => {
    const record = predictions.get(id)
    if (!record) return []
    return [evaluatedSchema === 'nlu' ? record : {...record, comparison: compareAlternatives(references, record.candidates)}]
  })
  const latencies = records.map(record => record.latencyMs).filter(Number.isFinite).sort((a, b) => a - b)
  const summary = {
    wallMs, requests: records.length, expectedRequests: rows.length, attemptedRequests: latencies.length,
    requestsPerSecond: latencies.length * 1000 / wallMs,
    medianMs: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    errors: records.filter(record => record.error).length,
    ...(evaluatedSchema === 'nlu' ? {
      withSchemaValidReading: records.filter(r=>r.checks?.some(c=>c.schemaValid)).length,
      withFullyAccountedReading: records.filter(r=>r.checks?.some(c=>c.valid && c.coverage.allAccountedFor)).length,
      withAllWordsAssignedRoles: records.filter(r=>r.checks?.some(c=>c.valid && c.coverage.allAccountedFor && !c.coverage.unresolved)).length
    } : {withExactMatch: records.filter(record => record.comparison.matched).length}),
    workerTiming: completed.map(batch => batch.timing),
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
  return summary.requests === rows.length && (summary.attemptedRequests ?? summary.requests) > 0
})
if (readyToGrade && evaluatedSchema === 'w.request') {
  execFileSync(process.execPath,[fileURLToPath(new URL('./grade.mjs',import.meta.url)),dir],{stdio:'inherit'})
}
