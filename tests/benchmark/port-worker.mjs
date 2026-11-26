import {parentPort, workerData} from 'node:worker_threads'
import {createReader} from '../../lib/reader.mjs'
import {measureStrategy} from '../../lib/measure-strategy.mjs'

const {name, options, rows, progressEvery} = workerData
const strategyEntry = name === 'z3' ? '../../strategies/z3/index.mjs' : '../../strategies/prolog/index.mjs'

const run = await measureStrategy(async () => {
  const {z3, prolog} = await import(strategyEntry)
  const reader = await createReader({strategy: z3 ?? prolog, ...options})
  parentPort.postMessage({completed: 0, total: rows.length})
  let completed = 0
  return {
    async propose(text) {
      try {
        const result = await reader.propose(text)
        return {
          candidates: result.candidates.map(candidate => candidate.sop),
          candidateEvidence: result.candidates.map(({sourceEvidence, sourceEvidenceError}) => ({
            sourceEvidence, sourceEvidenceError
          })),
          syntax: result.syntax,
          unresolved: result.unresolved,
          status: result.status,
          error: result.error
        }
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
  timing: run.timing,
  records: run.results.map((result, index) => ({
    id: rows[index].id,
    latencyMs: run.latencies[index],
    ...result
  }))
})
