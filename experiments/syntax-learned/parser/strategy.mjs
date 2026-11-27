// The parser as a soplang-nlu strategy: text in, one syntax circuit out. Plain JavaScript, no
// dependencies: VSS's reader (for its stations and word habits), the parser's weights, the word
// clusters, lib/syntax.mjs. Everything is passed in as objects, so it runs in a browser as well
// (the file reading in open() is the only Node part, and it is optional).
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {Parser} from './parser.mjs'
import {treeToCircuit} from './tree.mjs'
import {observeWords} from './observe.mjs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {createVssReader} = await import(root + 'strategies/vss/src/reader.mjs')

export function createParserReader({vssModel, parserModel, clusters}) {
  const vss = createVssReader(vssModel, {schema: 'syntax'})
  const parser = Parser.fromJSON(parserModel)
  return {
    analyse(text) {
      const obs = observeWords(text, vss, clusters)
      if (!obs.atoms.length) return {analyses: []}
      const {heads, labels} = parser.parse({atoms: obs.atoms, endsQ: obs.endsQ})
      return {analyses: [{sop: treeToCircuit(text, heads, labels)}], heads, labels}
    }
  }
}

export const vssParser = {
  name: 'vss-parser',
  schema: 'syntax',
  async open({model = new URL('./model.json.gz', import.meta.url)} = {}) {
    const start = performance.now()
    const reader = createParserReader({
      vssModel: JSON.parse(readFileSync(root + 'strategies/vss/model/model.json', 'utf8')),
      parserModel: JSON.parse(gunzipSync(readFileSync(model))),
      clusters: JSON.parse(readFileSync(new URL('./clusters.json', import.meta.url), 'utf8'))
    })
    return {
      modelLoadMs: performance.now() - start,
      async analyse(text) { try { return {analyses: reader.analyse(text).analyses} } catch (error) { return {analyses: [], error: String(error?.message ?? error)} } },
      async close() {}
    }
  }
}
