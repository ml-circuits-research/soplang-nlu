// The Z3 strategy for the `syntax` schema. It reads one message and writes one circuit:
// the lexicon proposes what each word may be, Z3 solves the constraint model, and the
// assembler lays the solution out as wires. No knowledge repository is read.
import {loadLexicon, readTokens} from './lexicon.mjs'
import {encode} from './model.mjs'
import {assemble} from './assemble.mjs'
import {createSolver} from './solver.mjs'

export async function open({z3Module, timeout = 4000} = {}) {
  const lexicon = loadLexicon()
  const runner = await createSolver({module: z3Module, timeoutMs: timeout})
  async function run(text) {
    if (typeof text !== 'string' || !text.trim()) return {analyses: [], error: 'Expected a nonempty text string.'}
    try {
      const read = readTokens(text, lexicon)
      if (!read.tokens.length) return {analyses: [], error: 'The message has no words.'}
      const model = encode(read)
      const solved = await runner.solve(model.smt, model.query, {timeout})
      if (!solved.ok) return {analyses: [], error: 'Z3: ' + (solved.error ?? solved.status)}
      const {sop, leftover} = assemble(text, read, model.read(solved.values))
      return {analyses: [{sop, objective: solved.objective, leftover}]}
    } catch (error) {
      return {analyses: [], error: error.message}
    }
  }
  // one assertion stack: one message at a time
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
      closing ??= pending.then(() => runner.close())
      return closing
    }
  }
}
