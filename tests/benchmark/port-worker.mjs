import {createRecordWriter} from './record.mjs'
import {parentPort, workerData} from 'node:worker_threads'
import {createReader} from '../../lib/reader.mjs'
import {measureStrategy} from '../../lib/measure-strategy.mjs'

const {name, options, rows, progressEvery} = workerData
const strategies = {
  z3: ['../../strategies/z3/index.mjs', 'z3'],
  'prolog-worlds': ['../../strategies/prolog/index.mjs', 'prolog'],
  'prolog-example-transfer': ['../../strategies/prolog-example-transfer/index.mjs', 'prologExampleTransfer']
}
const [strategyEntry, exportedName] = strategies[name]
let modelLoadMs

const run = await measureStrategy(async () => {
  const strategy = (await import(strategyEntry))[exportedName]
  const recordResult = await createRecordWriter(options.knowledgeDir)
  const reader = await createReader({
    ...options,
    strategy: {
      name: strategy.name,
      async open(configuration) {
        const engine = await strategy.open(configuration)
        modelLoadMs = engine.modelLoadMs
        return engine
      }
    }
  })
  parentPort.postMessage({completed: 0, total: rows.length})
  let completed = 0
  return {
    async propose(text) {
      try {
        const result = await reader.propose(text)
        return recordResult(text,result)
      } catch (error) {
        return {candidates: [], candidateEvidence: [], unresolved: [],
          error: error instanceof Error ? error.message : String(error)}
      } finally {
        completed++
        if (completed % progressEvery === 0 || completed === rows.length) {
          parentPort.postMessage({completed, total: rows.length})
        }
      }
    },
    close: reader.close
  }
}, rows.map(row => row.text))

parentPort.postMessage({
  timing: {...run.timing, modelLoadMs},
  records: run.results.map((result, index) => ({
    id: rows[index].id,
    latencyMs: run.latencies[index],
    ...result
  }))
})
