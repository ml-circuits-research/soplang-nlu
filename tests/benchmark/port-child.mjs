import {createReader} from '../../lib/reader.mjs'

const strategies = {
  z3: ['../../strategies/z3/index.mjs', 'z3'],
  'prolog-worlds': ['../../strategies/prolog/index.mjs', 'prolog'],
  'prolog-example-transfer': ['../../strategies/prolog-example-transfer/index.mjs', 'prologExampleTransfer']
}
let reader

const send = message => new Promise((resolve, reject) => {
  process.send(message, error => error ? reject(error) : resolve())
})

process.on('message', async message => {
  const start = performance.now()
  if (message.type === 'open') {
    const [entry, exportName] = strategies[message.name]
    const strategy = (await import(entry))[exportName]
    let modelLoadMs
    reader = await createReader({
      ...message.options,
      strategy: {
        name: strategy.name,
        async open(configuration) {
          const engine = await strategy.open(configuration)
          modelLoadMs = engine.modelLoadMs
          return engine
        }
      }
    })
    await send({type: 'ready', startupMs: performance.now() - start, modelLoadMs})
  } else if (message.type === 'close') {
    await reader.close()
    await send({type: 'closed', shutdownMs: performance.now() - start})
    process.disconnect()
  } else if (message.type === 'propose') {
    const {id, text} = message.row
    let record
    try {
      const result = await reader.propose(text)
      record = {
        candidates: result.candidates.map(candidate => candidate.sop),
        candidateEvidence: result.candidates.map(({sourceEvidence, sourceEvidenceError, source, support, transfer}) => ({
          sourceEvidence, sourceEvidenceError, source, support, transfer
        })),
        syntax: result.syntax,
        unresolved: result.unresolved,
        status: result.status,
        error: result.error
      }
    } catch (error) {
      record = {candidates: [], candidateEvidence: [], unresolved: [],
        error: error instanceof Error ? error.message : String(error)}
    }
    await send({type: 'result', record: {id, latencyMs: performance.now() - start, ...record}})
  }
})
