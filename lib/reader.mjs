import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {checkSyntax} from './check-syntax.mjs'
import {alignCircuit} from './semantic-evidence.mjs'
import {loadSyntaxReader} from './syntax-worlds.mjs'

// Strategies return their native candidates and diagnostics. Syntax is shared
// evidence about the utterance, independently of which candidate is selected.
export async function createReader({strategy, analyseSyntax, ...configuration}) {
  const syntax = analyseSyntax ?? (configuration.knowledgeDir
    ? await loadSyntaxReader(configuration)
    : undefined)
  const runtime = configuration.knowledgeDir && await import(pathToFileURL(
    join(configuration.knowledgeDir, 'tools/sopworld/sopworld.mjs')))
  const engine = await strategy.open(configuration)
  return {
    async propose(text) {
      if (typeof text !== 'string' || !text.trim()) {
        return {engine: strategy.name, text: typeof text === 'string' ? text : null,
          candidates: [], unresolved: [], error: 'Expected a nonempty text string.'}
      }
      const result = await engine.propose(text)
      if (!syntax) return result
      const candidates = runtime ? result.candidates.map(candidate => {
        try {
          return {...candidate, sourceEvidence: alignCircuit(text,runtime.parse(candidate.sop))}
        } catch (error) {
          return {...candidate, sourceEvidence: [], sourceEvidenceError: error.message}
        }
      }) : result.candidates
      const analysis = syntax(text)
      if (!runtime) return {...result,candidates,syntax:analysis}
      const check = checkSyntax(text,runtime.parse(analysis.sop))
      return {...result,candidates,syntax:{...analysis,check}}
    },
    close: () => engine.close()
  }
}
