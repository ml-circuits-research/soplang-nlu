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
      const result = await engine.propose(text)
      if (!Array.isArray(result.analyses)) return result
      const {analyses, candidates: legacyCandidates, unresolved = [], ...details} = result
      const candidates = analyses.map(candidate => validate
        ? {...candidate, check: validate(text, candidate.sop)}
        : candidate)
      return {...details, candidates, candidateCount: candidates.length,
        multipleInterpretations: candidates.length > 1,
        legacy: {candidates: legacyCandidates, unresolved}}
    },
    close: () => engine.close()
  }
}
