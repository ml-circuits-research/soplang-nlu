// The VSS strategy for soplang-nlu: an unsupervised reader of syntactic structure.
import {readFile} from 'node:fs/promises'
import {createVssReader} from './src/reader.mjs'

const defaultModel = new URL('./model/model.json', import.meta.url)

export const vss = {
  name: 'vss',
  async open({vssModel} = {}) {
    const start = performance.now()
    const model = typeof vssModel === 'object' && vssModel ? vssModel : JSON.parse(await readFile(vssModel ?? defaultModel, 'utf8'))
    const reader = createVssReader(model)
    return {
      modelLoadMs: performance.now() - start,
      async analyse(text) {
        try {
          const {analyses} = reader.analyse(text)
          return {analyses}
        } catch (error) {
          return {analyses: [], analysisDiagnostics: {error: error instanceof Error ? error.message : String(error)}}
        }
      },
      async close() {}
    }
  }
}

export {createVssReader}
