// Neuro-Prolog, in the `syntax` schema.
// A dependency parser (spaCy by default) gives every word a head, a relation, a part of
// speech and a tag. Prolog (prolog/syntax_projection.pl) turns that parse into clauses,
// nominals, relations and coordinations. This file maps the tokens of the parser to the
// words of `wordsOf(text)` and writes the circuit. No knowledge world is read, and the
// symbolic Prolog strategy takes no part.
import {wordsOf, writeCircuit} from '../../lib/syntax.mjs'
import {openDependencies} from '../neural-dependencies/index.mjs'
import {findSwipl} from '../prolog/index.mjs'
import {prologWorker} from '../prolog/src/prolog-worker.mjs'

const program = new URL('./prolog/syntax_worker.pl', import.meta.url)
// When the parser cuts one word of the message into two tokens ("cannot"), the word goes
// to the value that says more about the build of the sentence.
const weight = {negation: 9, verb: 8, head: 7, auxiliary: 6, marker: 5, conjunction: 4, dependent: 3, modifier: 2, discourse: 1}

/** The circuit of a projection: token ranges become spans of words. */
export function circuitOf(text, tokens, wires) {
  const words = wordsOf(text)
  const wordsIn = (from, to) => {
    const start = tokens[from].start, end = tokens[to - 1].end
    return words.map((_, index) => index).filter(index => words[index].start < end && words[index].end > start)
  }
  const claims = []
  for (const [wire, [, , fields]] of wires.entries()) for (const [field, [key, kind, from, to]] of fields.entries()) {
    if (kind === 'quote') claims.push({wire, field, key, words: wordsIn(from, to)})
  }
  const owner = new Array(words.length).fill(null)
  for (const claim of claims) for (const index of claim.words) {
    if (!owner[index] || weight[claim.key] > weight[owner[index].key]) owner[index] = claim
  }
  const slotsOf = wires.map(([, , fields]) => fields.map(([key, kind, value]) => kind === 'ref' ? [{key, ref: value}] : kind === 'atom' ? [{key, value}] : []))
  for (const claim of claims) {
    const kept = claim.words.filter(index => owner[index] === claim)
    // the words a value keeps, as runs of neighbours
    for (let at = 0; at < kept.length;) {
      let end = at
      while (end + 1 < kept.length && kept[end + 1] === kept[end] + 1) end++
      slotsOf[claim.wire][claim.field].push({key: claim.key, span: [kept[at], kept[end]]})
      at = end + 1
    }
  }
  let written = wires.map(([id, type], index) => ({id, type: 'syntax.' + type, slots: slotsOf[index].flat()}))
  // a nominal whose head went to another value keeps its first dependent as head; a wire
  // left with nothing is taken out, with whatever pointed to it
  for (const wire of written) {
    if (wire.type !== 'syntax.nominal' || wire.slots.some(slot => slot.key === 'head')) continue
    const first = wire.slots.find(slot => slot.span)
    if (first) first.key = 'head'
  }
  for (let changed = true; changed;) {
    changed = false
    const alive = new Set(written.map(wire => wire.id))
    for (const wire of written) {
      const before = wire.slots.length
      wire.slots = wire.slots.filter(slot => slot.ref === undefined || alive.has(slot.ref))
      if (wire.slots.length !== before) changed = true
    }
    const keep = written.filter(wire => {
      const refs = wire.slots.filter(slot => slot.ref !== undefined)
      if (wire.type === 'syntax.nominal') return wire.slots.some(slot => slot.key === 'head')
      if (wire.type === 'syntax.relation') return refs.length === 2
      if (wire.type === 'syntax.coordination') return refs.length >= 2 || !refs.length && false
      return true
    })
    if (keep.length !== written.length) { written = keep; changed = true }
  }
  // a clause has one subject: a second nominal that the parser calls a subject is a complement
  for (const wire of written) {
    let subjects = 0
    for (const slot of wire.slots) if (slot.key === 'subject' && subjects++) slot.key = 'complement'
  }
  // a clause that holds a verb in a fragment, or none in another form, is written as the words show
  for (const wire of written) {
    if (wire.type !== 'syntax.clause') continue
    const form = wire.slots.find(slot => slot.key === 'form')
    if (form.value !== 'fragment' && !wire.slots.some(slot => slot.key === 'verb')) form.value = 'fragment'
  }
  return writeCircuit(text, written)
}

export const neuroProlog = {
  name: 'neuro-prolog',
  schema: 'syntax',
  // The other options of the earlier strategy are accepted and not used.
  async open({swipl, python, model, syntaxModel} = {}) {
    const dependencies = await openDependencies({python, model, syntaxModel})
    const solver = prologWorker(program, findSwipl(swipl))
    return {
      model: dependencies.metadata,
      async analyse(text) {
        try {
          if (typeof text !== 'string') throw new TypeError('Expected a text string')
          const tokens = await dependencies.parse(text)
          const answer = await solver.request({tokens})
          if (answer.error) throw new Error(answer.error)
          return {analyses: [{sop: circuitOf(text, tokens, answer.wires)}]}
        } catch (error) {
          return {analyses: [], error: error instanceof Error ? error.message : String(error)}
        }
      },
      async close() {
        const closed = await Promise.allSettled([dependencies.close(), solver.close()])
        const failure = closed.find(result => result.status === 'rejected')
        if (failure) throw failure.reason
      }
    }
  }
}
