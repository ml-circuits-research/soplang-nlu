// Neuro-Z3 for the `syntax` schema. A dependency parser reads the message; what it saw (word
// classes, nominals, attachments) enters the constraint model of the Z3 strategy as weighted
// evidence; Z3 solves the model and the same assembler writes the one circuit. No knowledge
// repository is read. The parser is configured as in strategies/neural-dependencies: the
// options `python` and `model`, or SOP_NLU_SYNTAX_PYTHON and SOP_NLU_SYNTAX_MODEL.
import {openDependencies} from '../neural-dependencies/index.mjs'
import {loadLexicon, readTokens} from '../z3/src/syntax/lexicon.mjs'
import {encode} from '../z3/src/syntax/model.mjs'
import {assemble} from '../z3/src/syntax/assemble.mjs'
import {createSolver} from '../z3/src/syntax/solver.mjs'
import {evidenceOf} from './evidence.mjs'

async function open({z3Module, timeout = 4000, python, model, syntaxModel} = {}) {
  const lexicon = loadLexicon()
  const runner = await createSolver({module: z3Module, timeoutMs: timeout})
  let transport
  try {
    transport = await openDependencies({python, model, ...(syntaxModel ? {syntaxModel} : {})})
  } catch (error) {
    await runner.close()
    throw error
  }
  async function run(text) {
    if (typeof text !== 'string' || !text.trim()) return {analyses: [], error: 'Expected a nonempty text string.'}
    try {
      const read = readTokens(text, lexicon)
      if (!read.tokens.length) return {analyses: [], error: 'The message has no words.'}
      const evidence = evidenceOf(read.tokens, read.words, await transport.parse(text))
      const problem = encode(read, evidence)
      const solved = await runner.solve(problem.smt, problem.query, {timeout})
      if (!solved.ok) return {analyses: [], error: 'Z3: ' + (solved.error ?? solved.status)}
      const {sop, leftover} = assemble(text, read, problem.read(solved.values))
      return {analyses: [{sop, objective: solved.objective, leftover}]}
    } catch (error) {
      return {analyses: [], error: error.message}
    }
  }
  // one parser and one assertion stack: one message at a time
  let pending = Promise.resolve()
  let closing
  return {
    analyse(text) {
      if (closing) return Promise.resolve({analyses: [], error: 'Reader is closed.'})
      const result = pending.then(() => run(text))
      pending = result.then(() => {}, () => {})
      return result
    },
    close() {
      closing ??= pending.then(() => Promise.all([transport.close(), runner.close()]))
      return closing
    }
  }
}

export const neuroZ3 = {name: 'neuro-z3', schema: 'syntax', open}
