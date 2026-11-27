// spacy-direct: one dependency parse, corrected where the tagger misreads a word class
// (word-repairs.mjs) and where the parser misreads a run of clauses (clause-repairs.mjs),
// written as one circuit of the `syntax` schema. No knowledge repository is read.
import {openDependencies} from '../neural-dependencies/index.mjs'
import {circuitOf} from '../neural-dependencies/syntax-circuit.mjs'
import {repairClauses} from './clause-repairs.mjs'
import {repairWords} from './word-repairs.mjs'

/** The corrections made to the parse before it is written: the word classes first, then the clause boundaries. */
export function repairParse(units) {
  return repairWords(units) + repairClauses(units)
}

/** The circuit of a message from its dependency tokens: {sop, loose, relations, wires}. */
export function directCircuit(text, tokens) {
  return circuitOf(text, tokens, repairParse)
}

async function open({python, model, syntaxModel} = {}) {
  const parser = await openDependencies({python, model, syntaxModel})
  async function analyse(text) {
    if (typeof text !== 'string' || !text.trim()) return {analyses: [], error: 'Expected a nonempty text string.'}
    try {
      const {sop, loose} = directCircuit(text, await parser.parse(text))
      return {analyses: [{sop, loose}]}
    } catch (error) {
      return {analyses: [], error: error instanceof Error ? error.message : String(error)}
    }
  }
  return {analyse, metadata: parser.metadata, close: () => parser.close()}
}

export const spacyDirect = {name: 'spacy-direct', schema: 'syntax', open}
