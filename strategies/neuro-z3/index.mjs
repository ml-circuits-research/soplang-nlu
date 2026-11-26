import {openDependencies} from '../neural-dependencies/index.mjs'
import {createFormaliser} from '../z3/src/index.mjs'
import {loadAnalysisLexicon} from '../z3/src/analysis-lexicon.mjs'
import {analyseDependencies} from './syntax.mjs'

async function open(options = {}) {
  const {knowledgeDir, worldPaths, z3Module, timeout, topK, python, model, syntaxModel} = options
  const formaliser = await createFormaliser({knowledgeDir, worldPaths, z3Module, includeLegacy: false})
  let transport
  let lexicon
  try {
    transport = await openDependencies({python, model, syntaxModel})
    lexicon = await loadAnalysisLexicon(formaliser.kb, worldPaths)
  } catch (error) {
    await Promise.allSettled([transport?.close(), formaliser.close()])
    throw error
  }
  let pending = Promise.resolve()
  let closing
  const failure = (status, error) => ({analyses: [], analysisDiagnostics: {
    solver: 'z3', status, error, transport: transport.metadata
  }})
  async function run(text) {
    if (typeof text !== 'string' || !text.trim()) return failure('invalid-input', 'Expected a nonempty text string.')
    try {
      const dependencies = await transport.parse(text)
      const result = await analyseDependencies(text, dependencies, {
        kb: formaliser.kb, lexicon, runner: formaliser.runner, timeout, topK
      })
      return {...result, analysisDiagnostics: {...result.analysisDiagnostics, transport: transport.metadata}}
    } catch (error) {
      return failure('error', error.message)
    }
  }
  function analyse(text) {
    if (closing) return Promise.resolve(failure('closed', 'Reader is closed.'))
    const next = pending.then(() => run(text))
    pending = next.then(() => {}, () => {})
    return next
  }
  return {
    analyse,
    propose: analyse,
    async close() {
      closing ??= pending.then(async () => {
        await Promise.all([transport.close(), formaliser.close()])
      })
      await closing
    }
  }
}

export const neuroZ3 = {name: 'neuro-z3', open}
