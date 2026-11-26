import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'

export const z3 = {
  name: 'z3',
  async open({engineDirectory, knowledgeDir, timeout, topK, confidence}) {
    const entry = pathToFileURL(resolve(engineDirectory, 'src/reader.mjs'))
    const {createReader} = await import(entry)
    return createReader({knowledgeDir, timeout, topK, confidence})
  }
}
