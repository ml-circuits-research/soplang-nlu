import {loadSyntaxReader} from './syntax-worlds.mjs'

// Strategies return their native candidates and diagnostics. Syntax is shared
// evidence about the utterance, independently of which candidate is selected.
export async function createReader({strategy, analyseSyntax, ...configuration}) {
  const syntax = analyseSyntax ?? (configuration.knowledgeDir
    ? await loadSyntaxReader(configuration)
    : undefined)
  const engine = await strategy.open(configuration)
  return {
    async propose(text) {
      if (typeof text !== 'string' || !text.trim()) {
        return {engine: strategy.name, text: typeof text === 'string' ? text : null,
          candidates: [], unresolved: [], error: 'Expected a nonempty text string.'}
      }
      const result = await engine.propose(text)
      if (!syntax) return result
      return {...result, syntax: syntax(text)}
    },
    close: () => engine.close()
  }
}
