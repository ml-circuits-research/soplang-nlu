import {parentPort, workerData} from 'node:worker_threads'
import {pathToFileURL} from 'node:url'
import {measureStrategy} from '../../lib/measure-strategy.mjs'
import {compareAlternatives} from '../../lib/compare-alternatives.mjs'
const {entry, rows, options} = workerData
const {createReader} = await import(pathToFileURL(entry))
const run = await measureStrategy(() => createReader(options), rows.map(r => r.text))
parentPort.postMessage({
  timing:run.timing,
  records:run.results.map((result,i) => ({
    id:rows[i].id, latencyMs:run.latencies[i], error:result.error,
    comparison:compareAlternatives(rows[i].references,result.candidates.map(c => c.sop)),
    candidates:result.candidates.map(c => c.sop), unresolved:result.unresolved
  }))
})
