import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'

export const prolog = {
  name: 'prolog',
  async open({engineDirectory, modelPath, worldsOnly = modelPath === undefined, evidence = true, languageFrames}) {
    const entry = pathToFileURL(resolve(engineDirectory, 'src/reader.mjs'))
    const {createReader} = await import(entry)
    return createReader({modelPath, worldsOnly, evidence, languageFrames})
  }
}
