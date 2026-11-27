// The symbolic Prolog strategy, in the `syntax` schema.
// It reads one message and writes one circuit from its own grammar: src/english.mjs gives
// the classes of each word, prolog/syntax.pl composes clauses, nominals, relations and
// coordinations, and lib/syntax.mjs writes the circuit. No knowledge world is read.
import {existsSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {prologWorker} from './src/prolog-worker.mjs'
import {syntaxInput} from './src/syntax-input.mjs'
import {writeWires} from './src/write-wires.mjs'

const program = new URL('./prolog/syntax_worker.pl', import.meta.url)

/** The SWI-Prolog to run: the one asked for, the one on the path, or the workspace copy. */
export function findSwipl(asked = process.env.SWIPL) {
  if (asked) return asked
  if (spawnSync('swipl', ['--version']).status === 0) return 'swipl'
  const workspace = fileURLToPath(new URL('../../../prolog-formaliser/tools/swipl', import.meta.url))
  return existsSync(workspace) ? workspace : 'swipl'
}

/** One grammar worker: analyse(text) -> {analyses: [{sop}]} | {analyses: [], error}. */
export function openGrammar({swipl} = {}) {
  const worker = prologWorker(program, findSwipl(swipl))
  return {
    async analyse(text) {
      try {
        if (typeof text !== 'string') throw new TypeError('Expected a text string')
        const {tokens, packet} = syntaxInput(text)
        if (!tokens.some(token => token.word)) throw new Error('The message has no word.')
        const answer = await worker.request(packet)
        if (answer.error) throw new Error(answer.error)
        return {analyses: [{sop: writeWires(text, tokens, answer.wires)}]}
      } catch (error) {
        return {analyses: [], error: error instanceof Error ? error.message : String(error)}
      }
    },
    close: () => worker.close()
  }
}

export const prolog = {
  name: 'prolog',
  schema: 'syntax',
  // The options of the earlier strategy are accepted and not used: no knowledge repository is read.
  async open({swipl} = {}) {
    return openGrammar({swipl})
  }
}
