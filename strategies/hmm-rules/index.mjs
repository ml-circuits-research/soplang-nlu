// The hmm-rules strategy for soplang-nlu: a hidden Markov model learned from raw text, with no
// labels, tags each word with a class (a station); general rules over function words then build the
// circuit in the syntax schema. Experimental: measured on the benchmark, not being improved now.
// It was called `vss` until 2026-11-27, a name kept from the vector-symbolic reader it started as;
// the vector-symbolic reader of the project is now `rvss` (strategies/rvss).
import {readFile} from 'node:fs/promises'
import {createHmmRulesReader} from './src/reader.mjs'

const defaultModel = new URL('./model/model.json', import.meta.url)

export const hmmRules = {
  name: 'hmm-rules',
  // one circuit in the syntax schema, written from the text alone
  schema: 'syntax',
  /**
   * @param model the path of a model file, or a model object; the trained model of the repository when not given
   * @param vssModel the same, under its name before 2026-11-27 (deprecated)
   */
  async open({model: given, vssModel} = {}) {
    const start = performance.now()
    const source = given ?? vssModel
    const model = typeof source === 'object' && source ? source : JSON.parse(await readFile(source ?? defaultModel, 'utf8'))
    const reader = createHmmRulesReader(model, {schema: 'syntax'})
    return {
      modelLoadMs: performance.now() - start,
      async analyse(text) {
        try {
          const {analyses} = reader.analyse(text)
          return {analyses}
        } catch (error) {
          return {analyses: [], error: error instanceof Error ? error.message : String(error)}
        }
      },
      async close() {}
    }
  }
}

/** @deprecated the name of the strategy before 2026-11-27: use `hmmRules` */
export const vss = hmmRules

export {createHmmRulesReader}
/** @deprecated the name before 2026-11-27: use `createHmmRulesReader` */
export const createVssReader = createHmmRulesReader
