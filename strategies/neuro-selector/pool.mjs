import {createReader} from '../../lib/reader.mjs'
import {hasCompleteSource} from '../../lib/check-analysis.mjs'
import {spacyBeam} from '../spacy-beam/index.mjs'
import {spacyDirect} from '../spacy-direct/index.mjs'
import {neuroProlog} from '../neuro-prolog/index.mjs'
import {openDependencies, spacyDependencies} from '../neural-dependencies/index.mjs'

export async function openProposalPool({
  knowledgeDir = process.env.SOP_KNOWLEDGE_DIR,
  swipl = process.env.SWIPL,
  python = process.env.SOP_NLU_SYNTAX_PYTHON,
  model = process.env.SOP_NLU_SYNTAX_MODEL,
  adaptedModel = process.env.SOP_NLU_ADAPTED_TRF_MODEL,
  compactPython = process.env.SOP_NLU_COMPACT_PYTHON ?? python,
  compactModel = process.env.SOP_NLU_COMPACT_MODEL,
  baseSyntaxModel, adaptedSyntaxModel, compactSyntaxModel, onTiming
} = {}) {
  if (!knowledgeDir) throw Error('Set SOP_KNOWLEDGE_DIR or pass knowledgeDir.')
  if (!adaptedModel && !adaptedSyntaxModel) throw Error('Set SOP_NLU_ADAPTED_TRF_MODEL or pass adaptedModel.')
  if (!compactModel && !compactSyntaxModel) throw Error('Set SOP_NLU_COMPACT_MODEL or pass compactModel.')

  const base = await openDependencies({python, model, syntaxModel:baseSyntaxModel})
  const readers = []
  let active
  // One serialized request owns the cached graph. A reader cannot ask for
  // another source, retain state across requests, or open a second encoder.
  function current(text) {
    if (!active || active.text !== text) throw Error('Dependency request is outside the active proposal.')
    return active.graph
  }
  const sharedSyntaxModel = {async open() {
    return {
      metadata:base.metadata,
      async parse(text) { return current(text).tokens },
      async parseBeam(text) { return current(text) },
      async close() {}
    }
  }}
  function timedSyntaxModel(model, family) {
    return {async open(options) {
      const transport = await (model ?? spacyDependencies).open(options)
      async function time(method, text) {
        current(text)
        const start = performance.now()
        try {
          return await transport[method](text)
        } finally {
          active.timing.evidenceMs[family] = performance.now()-start
        }
      }
      return {metadata:transport.metadata, close:() => transport.close(),
        parse:text => time('parse',text),
        ...(typeof transport.parseBeam === 'function' ? {parseBeam:text => time('parseBeam',text)} : {})}
    }}
  }
  async function add(family, strategy, options) {
    readers.push([family,await createReader({strategy,knowledgeDir,...options})])
  }
  async function closeResources() {
    const results = await Promise.allSettled([...readers.map(([,reader]) => reader.close()),base.close()])
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
    if (errors.length) throw new AggregateError(errors,'Could not close proposal pool.')
  }
  try {
    if (!base.parseBeam) throw Error('The base dependency model must support parseBeam.')
    await add('base-beam',spacyBeam,{syntaxModel:sharedSyntaxModel})
    await add('adapted-beam',spacyBeam,{python,model:adaptedModel,syntaxModel:timedSyntaxModel(adaptedSyntaxModel,'adapted-beam')})
    await add('adapted-compact',spacyDirect,{python:compactPython,model:compactModel,syntaxModel:timedSyntaxModel(compactSyntaxModel,'adapted-compact')})
    await add('neuro-prolog',neuroProlog,{swipl,syntaxModel:sharedSyntaxModel})
  } catch (error) {
    await closeResources().catch(() => {})
    throw error
  }

  let pending = Promise.resolve()
  let closing
  async function collect(text) {
    if (typeof text !== 'string' || !text.trim()) throw TypeError('Expected a nonempty source string.')
    const baseStart = performance.now()
    const graph = await base.parseBeam(text)
    active = {text,graph,timing:{evidenceMs:{'base-beam':performance.now()-baseStart},familiesMs:{}}}
    try {
      const observations = []
      for (const [family,reader] of readers) {
        const start = performance.now()
        const result = await reader.propose(text)
        active.timing.familiesMs[family] = performance.now()-start
        const error = result.error
        if (error) throw Error(family + ': ' + error)
        for (const [rank,{sop,check}] of result.candidates.entries()) {
          observations.push({family,rank,sop,eligible:hasCompleteSource(check)})
        }
      }
      onTiming?.(active.timing)
      return observations
    } finally {
      active = undefined
    }
  }

  return {
    propose(text) {
      if (closing) return Promise.reject(Error('Proposal pool is closed.'))
      const result = pending.then(() => collect(text))
      pending = result.catch(() => {})
      return result
    },
    async close() {
      closing ??= pending.then(closeResources)
      await closing
    }
  }
}
