import {createAnalysisValidator} from './check-analysis.mjs'

// The strategy owns every reading. The adapter does not infer a missing one.
async function openReader({strategy, schemaPaths, ...configuration}, budget) {
  const knowledgeDir = configuration.knowledgeDir ?? process.env.SOP_KNOWLEDGE_DIR
  const validate = knowledgeDir ? await createAnalysisValidator({knowledgeDir, schemaPaths}) : undefined
  const engine = await strategy.open(configuration)
  return {
    async propose(text) {
      if (typeof text !== 'string' || !text.trim()) {
        return {engine: strategy.name, text: typeof text === 'string' ? text : null,
          candidates: [], unresolved: [], error: 'Expected a nonempty text string.'}
      }
      const result = engine.analyse ? await engine.analyse(text) : await engine.propose(text)
      if (!Array.isArray(result.analyses)) return result
      const {analyses, analysisDiagnostics, engine: name, ...prior} = result
      const checked = analyses.map(candidate => validate
        ? {...candidate, check: validate(text, candidate.sop)}
        : candidate)
      const candidates = checked.filter(candidate => candidate.check?.valid !== false).slice(0,budget)
      const rejected = checked.filter(candidate => candidate.check?.valid === false)
      return {engine: name ?? strategy.name, text, candidates, candidateCount: candidates.length,
        multipleInterpretations: candidates.length > 1,
        rejected, analysisDiagnostics, error: candidates.length ? null : analysisDiagnostics?.error ?? prior.error ?? null,
        ...(prior.candidates ? {legacy: prior} : {})}
    },
    close: () => engine.close()
  }
}


export async function createReader({maxReadings = 2,...options}) {
  if (maxReadings !== 1 && maxReadings !== 2) throw RangeError('maxReadings must be 1 or 2.')
  return openReader(options,maxReadings)
}

// Selector providers retain the candidate domain used when fitting the ranker.
// This internal entry point is not exposed by the package.
export async function createProviderReader(options,budget) {
  if (!Number.isSafeInteger(budget) || budget < 1) throw RangeError('Expected a positive provider reading budget.')
  return openReader(options,budget)
}
