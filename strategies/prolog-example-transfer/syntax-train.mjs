// Learning templates from examples in the `syntax` schema.
// An example is a message with one circuit that is valid for it: {text, sop}. No knowledge
// world is read. The words of the message that can change without changing its build become
// slots: a number, the words of a quotation, a name written with a capital letter. All other
// words are literal. The circuit is kept as wires whose values point into the pattern.
import {validateSyntax, parseCircuit, wordsOf} from '../../lib/syntax.mjs'

export const syntaxModelVersion = 1
const QUOTATION = /"(?:\\.|[^"\\\n])*"|“[^”\n]*”|«[^»\n]*»|(?<![\p{L}\p{N}])‘[^’\n]*’(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])'[^'\n]*'(?![\p{L}\p{N}])/gu
const NUMBER = /^[+-]?(?:\p{N}+(?:[.,:-]\p{N}+)*|\.\p{N}+)$/u
const widthLimits = {number: 1, quoted: 24, name: 6}

/** The words of a message with what a slot needs: [{text, lower, kind, quote}]. */
export function slotWords(text) {
  const words = wordsOf(text)
  const quotes = [...text.matchAll(QUOTATION)].map(match => [match.index, match.index + match[0].length])
  let opens = true
  return words.map((word, index) => {
    const quote = quotes.findIndex(range => word.start >= range[0] && word.end <= range[1]) + 1
    const between = text.slice(index ? words[index - 1].end : 0, word.start)
    if (index && /[.!?;]/u.test(between)) opens = true
    const capital = /^\p{Lu}/u.test(word.text) && word.text !== 'I'
    const kind = quote ? 'quoted' : NUMBER.test(word.text) ? 'number' : capital && !opens ? 'name' : null
    opens = false
    return {text: word.text, lower: word.text.toLowerCase(), kind, quote}
  })
}

/** The template of one example, or null when the circuit cannot be laid over its slots. */
function induce(text, sop) {
  const check = validateSyntax(text, sop)
  if (!check.valid) return null
  const words = slotWords(text)
  const wires = parseCircuit(sop)
  // which value covers each word: the placements are in the order of the quoted slots
  const cover = new Array(words.length).fill(null)
  for (const [index, place] of check.placements.entries()) for (let at = place.first; at <= place.last; at++) cover[at] = index
  const pattern = [], elementOf = new Array(words.length).fill(-1), payloads = []
  for (let at = 0; at < words.length;) {
    const {kind, quote} = words[at]
    if (!kind) { elementOf[at] = pattern.length; pattern.push(words[at].lower); at++; continue }
    // a run of the same kind is one slot when one value of the circuit covers exactly that run
    let end = at + 1
    while (end < words.length && words[end].kind === kind && words[end].quote === quote && kind !== 'number') end++
    const place = check.placements[cover[at]]
    const whole = place.first === at && place.last === end - 1
    if (!whole) end = at + 1
    for (let inside = at; inside < end; inside++) elementOf[inside] = pattern.length
    payloads.push(words.slice(at, end).map(word => word.text).join(' '))
    pattern.push({kind, width: end - at})
    at = end
  }
  if (!pattern.some(part => typeof part === 'string')) return null
  // every value must start and end on the edge of a pattern element
  let next = 0
  const blueprint = []
  for (const wire of wires) {
    const slots = []
    for (const [key, raw] of wire.slots) {
      if (raw.startsWith('$')) { slots.push({key, ref: raw.slice(1)}); continue }
      if (!raw.startsWith('"')) { slots.push({key, value: raw}); continue }
      const place = check.placements[next++]
      const from = elementOf[place.first], to = elementOf[place.last] + 1
      if ((place.first > 0 && elementOf[place.first - 1] === from) || (place.last < words.length - 1 && elementOf[place.last + 1] === to - 1)) return null
      slots.push({key, from, to})
    }
    blueprint.push({id: wire.id, type: wire.type, slots})
  }
  return {pattern, blueprint, payloads, anchors: pattern.filter(part => typeof part === 'string').length}
}

/**
 * @param rows [{text, sop}] examples whose circuit is trusted.
 * @returns the model: {version, schema, training, templates: [{pattern, blueprint, support}]}
 * A template is kept when a slot was seen with two different fillers, or when it has at
 * least three literal words.
 */
export function trainSyntaxTransfer(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Expected an array of {text, sop} examples')
  const training = {examples: rows.length, invalidCircuit: 0, unaligned: 0, weakGroups: 0, templates: 0}
  const groups = new Map()
  for (const row of rows) {
    if (typeof row?.text !== 'string' || typeof row.sop !== 'string') throw new TypeError('Expected examples with text and sop')
    if (!validateSyntax(row.text, row.sop).valid) { training.invalidCircuit++; continue }
    const template = induce(row.text, row.sop)
    if (!template) { training.unaligned++; continue }
    const id = JSON.stringify([template.pattern.map(part => typeof part === 'string' ? part : part.kind), template.blueprint])
    let group = groups.get(id)
    if (!group) groups.set(id, group = {...template, texts: new Set(), first: template.payloads, varies: false, widths: template.pattern.map(part => part.width ?? 1)})
    if (group.texts.has(row.text)) continue
    group.texts.add(row.text)
    group.varies ||= template.payloads.some((payload, index) => payload !== group.first[index])
    template.pattern.forEach((part, index) => { if (typeof part !== 'string') group.widths[index] = Math.max(group.widths[index], part.width) })
  }
  const templates = []
  for (const group of groups.values()) {
    if (!group.varies && group.anchors < 3) { training.weakGroups++; continue }
    templates.push({
      pattern: group.pattern.map((part, index) => typeof part === 'string' ? part
        : {kind: part.kind, min: 1, max: Math.max(group.widths[index], widthLimits[part.kind])}),
      blueprint: group.blueprint, support: group.texts.size
    })
  }
  training.templates = templates.length
  return {version: syntaxModelVersion, schema: 'syntax', training, templates}
}
