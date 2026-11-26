import {literalField} from '../prolog/src/evidence.mjs'
import {openKnowledge, withKnowledge} from '../prolog/src/knowledge.mjs'
import {tokens} from '../prolog/src/lexicon.mjs'
import {loadWorlds} from '../prolog/src/worlds.mjs'

export const modelVersion = 2

const numbers = /^[+-]?\d+(?:\.\d+)?$/u
const dates = /^\d{4}-\d{2}-\d{2}$/u
const times = /^\d{1,2}:\d{2}(?::\d{2})?$/u
const word = /[\p{L}\p{N}]/u
const quotes = new Map([['"', '"'], ['“', '”'], ["'", "'"], ['‘', '’']])
const contextTypes = new Set(['clock', 'context', 'previous', 'unread'].map(type => 'w.request.' + type))
const decode = raw => raw?.startsWith('"') ? JSON.parse(raw) : raw
const field = (wire, key) => decode(wire.attrs[key]?.[0])

function uniqueRange(input, value, [start, end]) {
  const keys = tokens(value).map(([, raw]) => raw)
  if (!keys.length) return
  let range
  for (let i = start; i + keys.length <= end; i++) {
    if (!keys.every((key, j) => input[i + j][1] === key)) continue
    if (range) return
    range = [i, i + keys.length]
  }
  return range
}

function slotKind(input, range, wire, key, value, openAttributes) {
  if (key === 'value' || key === 'measure') {
    if (numbers.test(value)) return 'number'
    if (dates.test(value)) return 'date'
    if (times.test(value)) return 'time'
  }
  const [start, end] = range
  const quote = input[start - 1]?.[1]
  const quoted = quotes.has(quote) && input[end]?.[1] === quotes.get(quote)
  if (key === 'name' || key === 'description' || key === 'ids' && quoted ||
      key === 'value' && (quoted || field(wire, 'open_value') === 'true' ||
        openAttributes.has(field(wire, 'attribute')) || wire.type === 'w.request.intent')) {
    return quoted ? 'quoted' : 'phrase'
  }
}

function induce(input, text, wires, openAttributes) {
  const span = ([a, b]) => text.slice(input[a][2], input[b - 1][3])
  const scopes = new Map()
  const all = [0, input.length]
  for (const wire of wires.filter(wire => wire.type === 'w.request.request')) {
    const written = field(wire, 'words')
    scopes.set(wire.id, written ? uniqueRange(input, written, all) : all)
  }
  const scopeOf = wire => scopes.get(field(wire, 'request')?.slice(1) ?? wire.id) ?? all
  const fields = wires.map(wire => Object.fromEntries(Object.entries(wire.attrs).map(([key, values]) => [
    key, values.map(raw => {
      const value = decode(raw)
      const evidence = literalField(key) || key === 'name'
      const mayCopy = evidence || ['value', 'measure'].includes(key)
      if (!mayCopy || !value || value.startsWith('$') && !raw.startsWith('"')) return {raw}
      const scope = wire.type === 'w.request.request' && key === 'words' ? all : scopeOf(wire)
      const range = uniqueRange(input, value, scope)
      if (!range) return {raw}
      const kind = slotKind(input, range, wire, key, value, openAttributes)
      return {raw, range, kind, evidence}
    })
  ])))
  const entries = fields.flatMap(attrs => Object.values(attrs).flat())
  const predicates = fields.flatMap(attrs => attrs.predicate ?? []).flatMap(({range}) => range ? [range] : [])
  const slots = new Map()
  for (const {range, kind} of entries) {
    if (!kind || predicates.some(([a, b]) => a < range[1] && b > range[0])) continue
    const id = range.join(':')
    const prior = slots.get(id)
    if (prior && prior.kind !== kind) return
    slots.set(id, {range, kind})
  }
  if (!slots.size) return
  const ordered = [...slots.values()].sort((a, b) => a.range[0] - b.range[0])
  if (ordered.some(({range}, i) => i && ordered[i - 1].range[1] > range[0])) return
  const boundaries = new Map([[0, 0]])
  const pattern = []
  const payloads = []
  let i = 0
  for (const {range, kind} of ordered) {
    const [start, end] = range
    for (; i < start; i++) {
      pattern.push(input[i][1])
      boundaries.set(i + 1, pattern.length)
    }
    const slot = payloads.length
    payloads.push(span(range))
    pattern.push(kind === 'quoted' ? {slot, kind, delimiter: input[end][1]} : {slot, kind})
    boundaries.set(end, pattern.length)
    i = end
  }
  for (; i < input.length; i++) {
    pattern.push(input[i][1])
    boundaries.set(i + 1, pattern.length)
  }
  const lexicalAnchors = pattern.filter(part => typeof part === 'string' && word.test(part))
  if (!lexicalAnchors.length) return
  const blueprint = wires.map(({id, type}, index) => ({
    id, type,
    attrs: Object.fromEntries(Object.entries(fields[index]).map(([key, values]) => [
      key, values.map(({raw, range, kind, evidence}) => {
        if (!range || !boundaries.has(range[0]) || !boundaries.has(range[1]) ||
            !evidence && (!kind || !slots.has(range.join(':')))) return raw
        return {from: boundaries.get(range[0]), to: boundaries.get(range[1]), quoted: raw.startsWith('"')}
      })
    ]))
  }))
  return {pattern, blueprint, payloads, lexicalAnchors: lexicalAnchors.length,
    widths: ordered.map(({range}) => range[1] - range[0])}
}

const widthLimits = {number: 6, date: 5, time: 5, quoted: 24, phrase: 12}

export async function trainExampleTransfer(rows, {
  knowledgeDir = process.env.SOP_KNOWLEDGE_DIR,
  worldPaths
} = {}) {
  if (!knowledgeDir) throw new TypeError('Expected a SOP knowledge directory for example transfer training')
  if (!Array.isArray(rows)) throw new TypeError('Expected example transfer training rows')
  const installation = await openKnowledge(knowledgeDir)
  return withKnowledge(installation, () => {
    const worlds = loadWorlds({paths: worldPaths})
    const openAttributes = new Set(worlds.requestKeys.filter(key =>
      key.head.split('+').includes('span') && !key.values.length).map(key => key.name))
    const groups = new Map()
    const training = {inputTexts: rows.length, distinctTexts: 0, inputCircuits: 0, duplicateReferences: 0,
      skippedTextCircuits: 0, parseRejected: 0, unsupportedCircuit: 0, unalignedCircuit: 0,
      eligibleCircuits: 0, weakGroups: 0, templates: 0}
    const texts = new Set()
    for (const row of rows) {
      if (typeof row?.text !== 'string' || !Array.isArray(row.references) ||
          row.references.some(sop => typeof sop !== 'string')) {
        throw new TypeError('Expected training rows with text and an array of SOP reference strings')
      }
      const textKey = row.text
      texts.add(textKey)
      const distinctReferences = new Set(row.references)
      training.inputCircuits += row.references.length
      training.duplicateReferences += row.references.length - distinctReferences.size
      // Match token spans in code units while preserving the exact source text.
      const input = []
      const text = row.text
      const charToUnit = [0]
      for (const char of text) charToUnit.push(charToUnit.at(-1) + char.length)
      for (const [key, raw, start, end] of tokens(text)) input.push([key, raw, charToUnit[start], charToUnit[end]])
      if (!input.length || input.length > 160) {
        training.skippedTextCircuits += distinctReferences.size
        continue
      }
      for (const sop of distinctReferences) {
        let wires
        try { wires = installation.api.parse(sop) }
        catch (error) {
          if (error.name !== 'SopError') throw error
          training.parseRejected++
          continue
        }
        if (!wires.some(wire => wire.type === 'w.request.request') ||
            wires.some(wire => contextTypes.has(wire.type) ||
              wire.type === 'w.request.lookup' && field(wire, 'from') === 'previous')) {
          training.unsupportedCircuit++
          continue
        }
        const template = induce(input, text, wires, openAttributes)
        if (!template) {
          training.unalignedCircuit++
          continue
        }
        training.eligibleCircuits++
        const {blueprint, pattern, lexicalAnchors, payloads, widths} = template
        const id = JSON.stringify([pattern, blueprint])
        let group = groups.get(id)
        if (!group) {
          group = {pattern, blueprint, lexicalAnchors, widths, observations: new Set(), first: payloads}
          groups.set(id, group)
        }
        if (group.observations.has(textKey)) continue
        group.observations.add(textKey)
        group.varies ||= payloads.some((payload, index) => payload !== group.first[index])
        widths.forEach((width, index) => { group.widths[index] = Math.max(group.widths[index], width) })
      }
    }
    const templates = []
    for (const {pattern, blueprint, widths, observations, lexicalAnchors, varies} of groups.values()) {
      if (!varies && lexicalAnchors < 3) {
        training.weakGroups++
        continue
      }
      templates.push({
        pattern: pattern.map(part => typeof part === 'string' ? part : {
          ...part, min: 1, max: Math.max(widths[part.slot], widthLimits[part.kind])
        }),
        blueprint,
        support: observations.size
      })
    }
    training.distinctTexts = texts.size
    training.templates = templates.length
    return {version: modelVersion, trainingRows: rows.length, training, templates}
  })
}
