// Symptoms of a doubtful reading, read off the circuit itself. None needs a reference: each
// one names a place where the reader fell back on a default instead of on evidence. A reading
// with no symptom is one the reader stands behind.
import {parseWires} from './legend.mjs'

/**
 * @param sop the circuit
 * @param lexicon the reader's lexicon (habits and legend lookups)
 * @param context {confidence: number[] posterior of each token's station, alternative: boolean}
 * @returns names of the symptoms found
 */
export function symptomsOf(sop, lexicon, {confidence = [], alternative = false, fold = word => word.toLowerCase()} = {}) {
  const wires = parseWires(sop)
  const byId = new Map(wires.map(wire => ['$' + wire.id, wire]))
  const found = new Set()
  const word = value => fold(String(value))
  for (const wire of wires) {
    const {attrs} = wire
    if (attrs.unresolved) found.add('unresolved text')
    if (wire.type === 'nlu.clause') {
      const predicate = attrs.predicate?.[0]
      const form = attrs.form?.[0]
      // a second bare thing that the verb is not known to take
      if (attrs.predicative_entity && predicate && !lexicon.canBe(word(predicate), 'auxiliary') &&
          !lexicon.takesQuality(word(predicate)) && !lexicon.names(word(predicate))) found.add('second thing the verb is not known to take')
      // a word in an adverb slot that is neither listed as one nor built like one
      for (const adverb of attrs.adverb ?? []) {
        if (!String(adverb).includes(' ') && !lexicon.canBe(word(adverb), 'adverb') && !lexicon.grades(word(adverb)) && !lexicon.canBe(word(adverb), 'cue')) found.add('open word as adverb')
      }
      if (form === 'fragment' && !attrs.topic && !attrs.expression && !attrs.direct_object && !attrs.result_complement && !attrs.filler) found.add('fragment with nothing in it')
      if (form === 'imperative' && predicate && !lexicon.anchoredVerb(word(predicate))) found.add('verb never seen as a verb beyond doubt')
      if (predicate && (attrs.connective || attrs.marker) && form === 'imperative' && attrs.marker) found.add('marked clause read as a command')
      if ((attrs.particle?.length ?? 0) > 1) found.add('two particles')
    }
    if (wire.type === 'nlu.relation' && attrs.kind?.[0] === 'apposition') found.add('thing with no role')
    if (wire.type === 'nlu.entity' && attrs.head && lexicon.formOf(word(attrs.head[0])) && !attrs.determiner && !attrs.modifier) found.add('verb form as a bare thing')
  }
  // a clause that hangs on nothing in a sentence that has other clauses and no break before it
  const clauses = wires.filter(wire => wire.type === 'nlu.clause')
  const linked = new Set()
  for (const wire of wires) for (const values of Object.values(wire.attrs)) for (const value of values) if (byId.get(value)?.type === 'nlu.clause' && wire !== byId.get(value)) { linked.add(value); if (wire.type === 'nlu.coordination' || wire.type === 'nlu.relation') for (const other of Object.values(wire.attrs).flat()) if (byId.get(other)?.type === 'nlu.clause') linked.add(other) }
  const loose = clauses.filter(wire => wire.attrs.form?.[0] === 'nonfinite' && !linked.has('$' + wire.id))
  if (loose.length) found.add('clause attached to nothing')
  if (confidence.length && Math.min(...confidence) < 0.6) found.add('a word whose place was a near tie')
  if (alternative) found.add('attachment taken either way')
  return [...found]
}
