import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'

export const prolog = {
  name: 'prolog',
  async open(configuration) {
    const {engineDirectory, evidence = true, languageFrames = true, ...unknown} = configuration
    if (Object.keys(unknown).length) {
      throw new TypeError('Unsupported symbolic Prolog options: ' + Object.keys(unknown).join(', '))
    }
    const entry = pathToFileURL(resolve(engineDirectory, 'src/reader.mjs'))
    const {createReader} = await import(entry)
    return createReader({worldsOnly: true, evidence, languageFrames})
  }
}
