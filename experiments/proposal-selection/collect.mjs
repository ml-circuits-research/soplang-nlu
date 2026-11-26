import {open, readFile, unlink} from 'node:fs/promises'
import {finished} from 'node:stream/promises'
import {once} from 'node:events'
import {constants, createGzip, gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {openProposalPool} from '../../strategies/neuro-selector/pool.mjs'

const [samplePath, outputPath, ...extra] = process.argv.slice(2)
if (!samplePath || !outputPath || extra.length) {
  throw Error('Usage: node experiments/proposal-selection/collect.mjs sample.json.gz output.jsonl.gz')
}
const sampleBytes = await readFile(samplePath)
const sample = JSON.parse(gunzipSync(sampleBytes))
if (!Array.isArray(sample) || !sample.length || sample.some(row =>
  typeof row?.id !== 'string' || !row.id || typeof row.text !== 'string' || !row.text.trim()) ||
  new Set(sample.map(row => row.id)).size !== sample.length) {
  throw Error('Expected a nonempty sample array with unique IDs and nonempty source strings.')
}

const timingPath = outputPath + '.timing.json'
const ownedFiles = []
let output
let timing
let pool
let gzip
let fileStream
try {
  output = await open(outputPath,'wx')
  ownedFiles.push(outputPath)
  timing = await open(timingPath,'wx')
  ownedFiles.push(timingPath)
  const startup = performance.now()
  const processCpuStart = process.cpuUsage()
  let requestTiming
  pool = await openProposalPool({onTiming: timing => { requestTiming = timing }})
  const startupMs = performance.now()-startup
  gzip = createGzip({flush:constants.Z_SYNC_FLUSH})
  fileStream = output.createWriteStream()
  fileStream.on('error',error => gzip.destroy(error))
  gzip.on('error',error => fileStream.destroy(error))
  const drained = finished(fileStream)
  // Attach a handler immediately. A write error may arrive during inference.
  drained.catch(() => {})
  gzip.pipe(fileStream)
  const rows = []
  const collectionStart = performance.now()
  for (const {id,text} of sample) {
    const start = performance.now()
    const candidates = await pool.propose(text)
    rows.push({id,wallMs:performance.now()-start,candidates:candidates.length,...requestTiming})
    if (gzip.destroyed) await drained
    if (!gzip.write(JSON.stringify({id,text,candidates})+'\n')) await once(gzip,'drain')
  }
  gzip.end()
  await drained
  const collectionWallMs = performance.now()-collectionStart
  await pool.close()
  pool = undefined
  const cpu = process.cpuUsage(processCpuStart)
  const latencies = rows.map(r => r.wallMs).sort((a,b) => a-b)
  const quantile = fraction => latencies[Math.ceil(latencies.length*fraction)-1]
  await timing.writeFile(JSON.stringify({
    sampleSha256:createHash('sha256').update(sampleBytes).digest('hex'),
    rows:rows.length,startupMs,collectionWallMs,medianMs:quantile(.5),p95Ms:quantile(.95),
    processCpuMs:{user:cpu.user/1000,system:cpu.system/1000},
    timingScope:'CPU inference wall timings. Node CPU excludes Python and SWI-Prolog child processes.',
    transformerEncodingsPerSource:2,sharedBaseEncoder:true,
    models:{base:process.env.SOP_NLU_SYNTAX_MODEL ?? 'en_core_web_sm',
      adapted:process.env.SOP_NLU_ADAPTED_TRF_MODEL,compact:process.env.SOP_NLU_COMPACT_MODEL},
    requests:rows
  },null,2)+'\n')
  await timing.close()
} catch (error) {
  gzip?.destroy()
  fileStream?.destroy()
  await Promise.allSettled([pool?.close(),output?.close(),timing?.close()])
  await Promise.allSettled(ownedFiles.map(path => unlink(path)))
  throw error
}
