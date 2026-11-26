import {parentPort, workerData} from 'node:worker_threads'
import {pathToFileURL} from 'node:url'
import {measureStrategy} from '../../lib/measure-strategy.mjs'
import {basename,dirname} from 'node:path'
const {entry, rows, options} = workerData
if (basename(dirname(dirname(entry))) === 'prolog-formaliser' && options.worldsOnly !== true) {
  throw Error('Evaluation requires the Prolog worlds-only reader.')
}
const {createReader} = await import(pathToFileURL(entry))
const run = await measureStrategy(() => createReader(options), rows.map(r => r.text))
parentPort.postMessage({
  timing:run.timing,
  records:run.results.map((result,i) => ({
    id:rows[i].id, latencyMs:run.latencies[i], error:result.error,
    candidates:result.candidates.map(c => c.sop), unresolved:result.unresolved
  }))
})
