import {createAnalysisValidator, hasCompleteSource} from '../../lib/check-analysis.mjs'
import {openDependencies} from '../neural-dependencies/index.mjs'
import {projectDependencies} from '../spacy-direct/project.mjs'

async function open({knowledgeDir = process.env.SOP_KNOWLEDGE_DIR, schemaPaths, python, model, syntaxModel} = {}) {
  const validate = await createAnalysisValidator({knowledgeDir, schemaPaths})
  const parser = await openDependencies({python, model, syntaxModel})
  if (!parser.parseBeam) {
    await parser.close()
    throw Error('spacy-beam requires a dependency backend with parseBeam')
  }
  const diagnostics = {projector: 'spacy-beam', transport: parser.metadata}
  async function analyse(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return {analyses: [], analysisDiagnostics: {...diagnostics, status: 'invalid-input'}}
    }
    try {
      const {tokens, alternatives} = await parser.parseBeam(text)
      const greedy = projectDependencies(text, tokens)
      const complete = hasCompleteSource(validate(text, greedy.sop))
      const analyses = complete ? [greedy] : []
      const seen = new Set([greedy.sop])
      let acceptedAlternatives = 0
      for (const {score, tokens: graph} of alternatives.toSorted((a, b) => b.score - a.score)) {
        const reading = projectDependencies(text, graph)
        if (seen.has(reading.sop)) continue
        seen.add(reading.sop)
        if (!hasCompleteSource(validate(text, reading.sop))) continue
        analyses.push({...reading, beamScore: score})
        if (++acceptedAlternatives === 2) break
      }
      return {analyses: analyses.length ? analyses : [greedy],
        analysisDiagnostics: {...diagnostics, status: 'ok', greedyComplete: complete,
          dependencyAlternatives: alternatives.length, acceptedAlternatives}}
    } catch (error) {
      return {analyses: [], analysisDiagnostics: {...diagnostics, status: 'error', error: error.message}}
    }
  }
  return {analyse, propose: analyse, close: () => parser.close()}
}

export const spacyBeam = {name: 'spacy-beam', open}
