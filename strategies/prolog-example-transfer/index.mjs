// Prolog example transfer, in the `syntax` schema.
// It has no grammar of its own. It matches a whole message against templates learned from
// examples (a message with its trusted `syntax` circuit) and writes the circuit of the
// template over the words of the new message. A message that no template takes is read by
// the grammar of the Prolog strategy. Without a model there are no templates, and every
// message is read by that grammar. No knowledge world is read.
import {readFile} from 'node:fs/promises'
import {writeCircuit} from '../../lib/syntax.mjs'
import {openGrammar, findSwipl} from '../prolog/index.mjs'
import {prologWorker} from '../prolog/src/prolog-worker.mjs'
import {slotWords, syntaxModelVersion, trainSyntaxTransfer} from './syntax-train.mjs'

export {trainSyntaxTransfer}

const name = 'prolog-example-transfer'

function compile(model) {
  if (model?.version !== syntaxModelVersion || model.schema !== 'syntax' || !Array.isArray(model.templates)) {
    throw new TypeError('Expected an example transfer model of the syntax schema')
  }
  // a template is found by its rarest literal word
  const frequency = new Map()
  for (const {pattern} of model.templates) for (const part of new Set(pattern.filter(part => typeof part === 'string'))) frequency.set(part, (frequency.get(part) ?? 0) + 1)
  const byAnchor = new Map()
  for (const [index, template] of model.templates.entries()) {
    const literals = template.pattern.filter(part => typeof part === 'string')
    if (!literals.length) throw new TypeError('A template needs a literal word')
    const anchor = literals.reduce((best, word) => frequency.get(word) < frequency.get(best) ? word : best)
    const min = template.pattern.reduce((sum, part) => sum + (part.min ?? 1), 0)
    const max = template.pattern.reduce((sum, part) => sum + (part.max ?? 1), 0)
    if (!byAnchor.has(anchor)) byAnchor.set(anchor, [])
    byAnchor.get(anchor).push({index, pattern: template.pattern, min, max, anchors: literals.length, support: template.support})
  }
  return {byAnchor, templates: model.templates}
}

// The circuit of a template over the words of a message: bounds[i] = [first, next) of pattern element i.
function render(text, template, bounds) {
  return writeCircuit(text, template.blueprint.map(({id, type, slots}) => ({id, type, slots: slots.map(slot =>
    slot.from === undefined ? slot : {key: slot.key, span: [bounds[slot.from][0], bounds[slot.to - 1][1] - 1]})})))
}

export const prologExampleTransfer = {
  name,
  schema: 'syntax',
  // The other options of the earlier strategy are accepted and not used.
  async open({modelPath, model, swipl} = {}) {
    const loaded = model ?? (modelPath ? JSON.parse(await readFile(modelPath, 'utf8')) : null)
    const compiled = loaded ? compile(loaded) : null
    const grammar = openGrammar({swipl})
    const matcher = compiled?.templates.length ? prologWorker(new URL('./syntax-match.pl', import.meta.url), findSwipl(swipl)) : null
    return {
      templates: compiled?.templates.length ?? 0,
      async analyse(text) {
        if (matcher && typeof text === 'string') {
          const words = slotWords(text)
          const lowers = new Set(words.map(word => word.lower))
          const possible = [...lowers].flatMap(word => compiled.byAnchor.get(word) ?? [])
            .filter(entry => entry.min <= words.length && entry.max >= words.length &&
              entry.pattern.every(part => typeof part !== 'string' || lowers.has(part)))
            .sort((a, b) => b.anchors - a.anchors || b.support - a.support || a.index - b.index).slice(0, 64)
          if (possible.length) {
            try {
              const matches = await matcher.request({words: words.map(word => [word.lower, word.kind ?? 'word', word.quote]),
                templates: possible.map(({index, pattern}) => ({index, pattern}))})
              for (const {index, bounds} of matches) {
                try { return {analyses: [{sop: render(text, compiled.templates[index], bounds), source: name, support: compiled.templates[index].support}]} }
                catch { /* the next template */ }
              }
            } catch { /* the matcher gave no answer: the grammar reads the message */ }
          }
        }
        const read = await grammar.analyse(text)
        return read.analyses.length ? {analyses: read.analyses.map(analysis => ({...analysis, source: 'prolog'}))} : read
      },
      async close() {
        const results = await Promise.allSettled([matcher?.close(), grammar.close()])
        for (const result of results) if (result.status === 'rejected') throw result.reason
      }
    }
  }
}
