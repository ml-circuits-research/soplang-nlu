// The pool of the selector: the circuits that four other strategies write for the same message.
// Each of them is a strategy of the `syntax` schema and is opened through the common reader, so
// each gives at most one circuit, already checked. No knowledge repository is read.
//
// | Family | Strategy | What it reads |
// | base-beam | spacy-beam | the base transformer dependency parser |
// | adapted-beam | spacy-beam | the adapted transformer dependency parser |
// | adapted-compact | spacy-direct | the adapted compact dependency parser |
// | neuro-prolog | neuro-prolog | the parse of the base transformer, shared with base-beam |
import {createReader} from '../../lib/reader.mjs'
import {families} from './syntax-features.mjs'

// The four strategies and the dependency transport are loaded when the pool opens, so that a
// pool with other providers (see `providers`) needs none of them.
async function defaultProviders({swipl, python, model, adaptedModel, compactPython, compactModel,
  baseSyntaxModel, adaptedSyntaxModel, compactSyntaxModel, wanted}, share) {
  const want = family => wanted.includes(family)
  if (want('adapted-beam') && !adaptedModel && !adaptedSyntaxModel) throw Error('Set SOP_NLU_ADAPTED_TRF_MODEL or pass adaptedModel.')
  if (want('adapted-compact') && !compactModel && !compactSyntaxModel) throw Error('Set SOP_NLU_COMPACT_MODEL or pass compactModel.')
  const [{spacyBeam}, {spacyDirect}, {neuroProlog}, {openDependencies}] = await Promise.all([
    import('../spacy-beam/index.mjs'), import('../spacy-direct/index.mjs'), import('../neuro-prolog/index.mjs'), import('../neural-dependencies/index.mjs')])
  const list = [
    {family: 'base-beam', strategy: spacyBeam, shared: true, options: {}},
    {family: 'adapted-beam', strategy: spacyBeam, options: {python, model: adaptedModel, ...(adaptedSyntaxModel ? {syntaxModel: adaptedSyntaxModel} : {})}},
    {family: 'adapted-compact', strategy: spacyDirect, options: {python: compactPython, model: compactModel, ...(compactSyntaxModel ? {syntaxModel: compactSyntaxModel} : {})}},
    {family: 'neuro-prolog', strategy: neuroProlog, shared: true, options: {swipl}}
  ].filter(provider => want(provider.family))
  // a strategy that is not ported is refused before any model is loaded
  refuseUnported(list)
  if (list.some(provider => provider.shared)) {
    const shared = await share(() => openDependencies({python, model, syntaxModel: baseSyntaxModel}))
    for (const provider of list) if (provider.shared) provider.options.syntaxModel = shared
  }
  return list
}

function refuseUnported(list) {
  const unported = list.filter(({strategy}) => strategy?.schema !== 'syntax').map(({family, strategy}) => `${strategy?.name ?? '?'} (${family})`)
  if (unported.length) throw Error('These strategies of the pool do not write the syntax schema: ' + unported.join(', ') + '.')
}

/**
 * @param families the families to open, all four by default (or SOP_NLU_SELECTOR_FAMILIES, a list
 *   with commas). The ranker was fitted with the four; a family left out counts for it as a
 *   family that proposed nothing.
 * @param providers [{family, strategy, options}] to use other strategies than the four above;
 *   every family is one the ranker knows and every strategy writes the syntax schema
 * @param familyTimeoutMs how long one strategy may take for one message (60 s by default); a
 *   strategy that takes longer proposes nothing for that message
 * @returns {propose(text) → {observations: [{family, sop}], failures: [{family, error}]}, close()}
 */
export async function openSyntaxPool({
  swipl = process.env.SWIPL,
  python = process.env.SOP_NLU_SYNTAX_PYTHON,
  model = process.env.SOP_NLU_SYNTAX_MODEL,
  adaptedModel = process.env.SOP_NLU_ADAPTED_TRF_MODEL,
  compactPython = process.env.SOP_NLU_COMPACT_PYTHON ?? python,
  compactModel = process.env.SOP_NLU_COMPACT_MODEL,
  families: wanted = process.env.SOP_NLU_SELECTOR_FAMILIES?.split(',').map(name => name.trim()).filter(Boolean) ?? families,
  familyTimeoutMs = 60000,
  baseSyntaxModel, adaptedSyntaxModel, compactSyntaxModel, onTiming, providers
} = {}) {
  if (!Number.isSafeInteger(familyTimeoutMs) || familyTimeoutMs < 1) throw RangeError('Expected a positive time limit for a family, in milliseconds.')
  let base = null, active = null
  // One request owns the parse of the base model: base-beam and neuro-prolog read the same
  // parse of the same message and cannot ask for another text.
  const current = text => {
    if (!active || active.text !== text) throw Error('Dependency request is outside the active proposal.')
    return active
  }
  const share = async open => {
    base = await open()
    return {async open() {
      return {
        metadata: base.metadata,
        async parse(text) { return (await current(text).graph()).tokens },
        ...(base.parseBeam ? {async parseBeam(text) { return current(text).graph() }} : {}),
        async close() {}
      }
    }}
  }
  const readers = []
  const closeAll = async () => {
    const results = await Promise.allSettled([...readers.map(([, reader]) => reader.close()), base?.close()])
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
    if (errors.length) throw new AggregateError(errors, 'Could not close the pool.')
  }
  try {
    const unknown = [...wanted, ...(providers ?? []).map(({family}) => family)].filter(family => !families.includes(family))
    if (unknown.length) throw Error('The ranker knows no family named ' + unknown.join(', ') + '.')
    if (!providers && !wanted.length) throw Error('The pool needs at least one family.')
    const list = providers ?? await defaultProviders({swipl, python, model, adaptedModel, compactPython, compactModel,
      baseSyntaxModel, adaptedSyntaxModel, compactSyntaxModel, wanted}, share)
    refuseUnported(list)
    for (const {family, strategy, options} of list) readers.push([family, await createReader({strategy, ...options})])
  } catch (error) {
    await closeAll().catch(() => {})
    throw error
  }

  let pending = Promise.resolve(), closing
  const late = new Set()
  async function collect(text) {
    if (typeof text !== 'string' || !text.trim()) throw TypeError('Expected a nonempty source string.')
    let graph
    active = {text, graph: () => graph ??= base.parseBeam ? base.parseBeam(text) : base.parse(text).then(tokens => ({tokens, alternatives: []}))}
    const observations = [], failures = [], familiesMs = {}
    try {
      for (const [family, reader] of readers) {
        const start = performance.now()
        // a strategy that did not answer an earlier message in time is left out until it has
        if (late.has(family)) { failures.push({family, error: 'The strategy is still working on an earlier message.'}); continue }
        const request = Promise.resolve().then(() => reader.propose(text))
        let timer
        try {
          const result = await Promise.race([request, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new RangeError(`The strategy gave no answer within ${familyTimeoutMs} ms.`)), familyTimeoutMs)
          })])
          const circuit = result.candidates?.[0]?.sop
          if (typeof circuit === 'string') observations.push({family, sop: circuit})
          else failures.push({family, error: result.error ?? 'The strategy returned no circuit.'})
        } catch (error) {
          if (error instanceof RangeError) { late.add(family); request.catch(() => {}).finally(() => late.delete(family)) }
          failures.push({family, error: error instanceof Error ? error.message : String(error)})
        } finally {
          clearTimeout(timer)
        }
        familiesMs[family] = performance.now() - start
      }
      onTiming?.({familiesMs})
      return {observations, failures}
    } finally {
      active = null
    }
  }

  return {
    propose(text) {
      if (closing) return Promise.reject(Error('The pool is closed.'))
      const result = pending.then(() => collect(text))
      pending = result.catch(() => {})
      return result
    },
    async close() {
      closing ??= pending.then(closeAll)
      await closing
    }
  }
}
