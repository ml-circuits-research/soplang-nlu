import {createAnalysisValidator} from './check-analysis.mjs'

// The strategy owns every reading. The adapter does not infer a missing one.
export async function createReader({strategy, schemaPaths, ...configuration}) {
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
      const candidates = checked.filter(candidate => candidate.check?.valid !== false)
      const rejected = checked.filter(candidate => candidate.check?.valid === false)
      return {engine: name ?? strategy.name, text, candidates, candidateCount: candidates.length,
        multipleInterpretations: candidates.length > 1,
        rejected, analysisDiagnostics, error: candidates.length ? null : analysisDiagnostics?.error ?? prior.error ?? null,
        ...(prior.candidates ? {legacy: prior} : {})}
    },
    close: () => engine.close()
  }
}
