// Write a reading in the `syntax` schema. The linker hands over wires whose quoted values
// carry the tokens they cover; this module gives every word its place in a clause, a nominal,
// a relation or a coordination and lets the shared writer serialise the circuit.
import {wordsOf, writeCircuit} from '../../../lib/syntax.mjs'

const HEADS = ['head', 'name', 'pronoun', 'literal']
const CLAUSE = {predicate: 'verb', auxiliary: 'auxiliary', negation: 'negation', particle: 'modifier', adverb: 'modifier',
  result_complement: 'modifier', degree: 'modifier', unresolved: 'modifier', connective: 'discourse', filler: 'discourse', expression: 'discourse'}
const THINGS = new Set(['direct_object', 'indirect_object', 'predicative_entity', 'topic', 'participant'])

/**
 * @param text the message
 * @param tokens the reader's tokens ({start, end, word})
 * @param wires the linker's wires: {id, type, slots: [[key, value, first?, last?]], shares?}
 * @param knows {nominalQuestion(word)}: does the question word stand for a thing?
 * @returns the circuit as text
 */
export function emitSyntax(text, tokens, wires, knows) {
  const words = wordsOf(text)
  // the words a run of tokens covers; null when it covers only punctuation
  const spanOf = (first, last) => {
    const from = tokens[first].start, to = tokens[last].end
    let a = -1, b = -1
    words.forEach((word, index) => { if (word.start >= from && word.end <= to) { if (a < 0) a = index; b = index } })
    return a < 0 ? null : [a, b]
  }
  const typeOf = {'nlu.clause': 'syntax.clause', 'nlu.entity': 'syntax.nominal', 'nlu.relation': 'syntax.relation', 'nlu.coordination': 'syntax.coordination'}
  const rename = id => id.replace(/^e(?=\d)/u, 'n')
  const out = new Map(wires.map(wire => [wire.id, {id: rename(wire.id), type: typeOf[wire.type], slots: [], source: wire}]))
  const ref = value => out.get(value.slice(1))
  const quoted = slot => slot.length >= 4 ? spanOf(slot[2], slot[3]) : null
  const add = (wire, key, span) => { if (span) wire.slots.push({key, span}) }
  let made = 0
  const relation = (from, to, marker) => {
    const wire = {id: 'x' + ++made, type: 'syntax.relation', slots: [{key: 'from', ref: from.id}, {key: 'to', ref: to.id}]}
    add(wire, 'marker', marker)
    out.set(wire.id, wire)
    return wire
  }
  const clauses = [...out.values()].filter(wire => wire.type === 'syntax.clause')
  const firstWord = wire => Math.min(...wire.slots.filter(slot => slot.span).map(slot => slot.span[0]), Infinity)
  const lastWord = wire => Math.max(...wire.slots.filter(slot => slot.span).map(slot => slot.span[1]), -1)
  const pendingMarkers = [], pendingQuestions = [], completes = [], relationAdverbs = [], strays = []

  for (const wire of out.values()) {
    const source = wire.source
    if (!source) continue
    if (wire.type === 'syntax.clause') {
      const form = source.slots.find(slot => slot[0] === 'form')[1]
      const acts = source.slots.some(slot => slot[0] === 'predicate')
      wire.slots.push({key: 'form', value: acts ? form : 'fragment'})
      for (const slot of source.slots) {
        const [key, value] = slot
        if (CLAUSE[key]) add(wire, CLAUSE[key], quoted(slot))
        else if (key === 'subject') wire.slots.push({key: 'subject', ref: ref(value).id})
        else if (THINGS.has(key)) wire.slots.push({key: 'complement', ref: ref(value).id})
        else if (key === 'clausal_complement') completes.push([wire, ref(value)])
        else if (key === 'marker') pendingMarkers.push([wire, quoted(slot)])
        else if (key === 'question') pendingQuestions.push([wire, quoted(slot)])
        // a separator or terminator that is a word ("&", "%") still needs a place
        else if (key === 'separator' || key === 'terminator') { const span = quoted(slot); if (span) strays.push([wire, span]) }
      }
      if (source.shares && !acts) wire.slots.push({key: 'ellipsis', ref: out.get(source.shares).id})
    } else if (wire.type === 'syntax.nominal') {
      const headKey = HEADS.find(key => source.slots.some(slot => slot[0] === key && quoted(slot)))
      let headed = false
      for (const slot of source.slots) {
        const [key, value] = slot
        if (key === 'possessor') {
          const marker = source.slots.find(other => other[0] === 'possessive_marker')
          relation(wire, ref(value), marker ? quoted(marker) : null)
        } else if (key === 'possessive_marker') {
          if (!source.slots.some(other => other[0] === 'possessor')) add(wire, 'dependent', quoted(slot))
        } else if (key === headKey && !headed) { add(wire, 'head', quoted(slot)); headed = true }
        else if (slot.length >= 4) add(wire, 'dependent', quoted(slot))
      }
      // a group with no naming word: its last word stands as the head
      if (!headed) { const last = wire.slots.filter(slot => slot.span).sort((a, b) => a.span[0] - b.span[0]).at(-1); if (last) last.key = 'head' }
    } else if (wire.type === 'syntax.relation') {
      for (const slot of source.slots) {
        const [key, value] = slot
        if (key === 'from' || key === 'to') wire.slots.push({key, ref: ref(value).id})
        else if (key === 'cue') add(wire, 'marker', quoted(slot))
        else if (key === 'negation') add(wire, 'negation', quoted(slot))
        else if (key === 'adverb') relationAdverbs.push([wire, quoted(slot)])
        else if (key === 'attachment') wire.slots.push({key: 'attachment', value: 'ambiguous'})
      }
    } else if (wire.type === 'syntax.coordination') {
      for (const slot of source.slots) {
        if (slot[0] === 'member') wire.slots.push({key: 'conjunct', ref: ref(slot[1]).id})
        else if (slot[0] === 'cue') add(wire, 'conjunction', quoted(slot))
      }
    }
  }
  const byId = new Map([...out.values()].map(wire => [wire.id, wire]))
  // the clause a wire belongs to: the one that takes it, or the one its relation starts at
  const clauseOf = (wire, depth = 0) => {
    if (!wire || depth > 6) return null
    if (wire.type === 'syntax.clause') return wire
    const holder = clauses.find(clause => clause.slots.some(slot => slot.ref === wire.id))
    if (holder) return holder
    for (const other of out.values()) {
      if (other.type === 'syntax.relation' && other.slots.some(slot => slot.key === 'to' && slot.ref === wire.id)) return clauseOf(byId.get(other.slots.find(slot => slot.key === 'from').ref), depth + 1)
      if (other.type === 'syntax.coordination' && other.slots.some(slot => slot.ref === wire.id)) return clauseOf(other, depth + 1)
    }
    return null
  }
  const nearestClause = span => clauses.filter(clause => firstWord(clause) <= span[0]).at(-1) ?? clauses[0]

  // a word that grades a relation ("right below") is written as a modifier of the relation's clause
  for (const [wire, span] of relationAdverbs) if (span) add(clauseOf(wire) ?? nearestClause(span), 'modifier', span)
  // a clause that completes another: a relation between the two, marked by "to" when the infinitive has it
  for (const [governor, clause] of completes) {
    const at = pendingMarkers.findIndex(([owner]) => owner === clause)
    relation(governor, clause, at >= 0 ? pendingMarkers.splice(at, 1)[0][1] : null)
  }
  // a marker introduces its clause: it marks the relation that ends at that clause
  for (const [clause, span] of pendingMarkers) {
    if (!span) continue
    const tie = [...out.values()].find(wire => wire.type === 'syntax.relation' && wire.slots.some(slot => slot.key === 'to' && slot.ref === clause.id) && !wire.slots.some(slot => slot.key === 'marker'))
    if (tie) { add(tie, 'marker', span); continue }
    const main = clauses.find(other => other !== clause && other.slots.some(slot => slot.key === 'verb') && firstWord(other) > firstWord(clause)) ??
      clauses.filter(other => other !== clause && firstWord(other) < firstWord(clause)).at(-1) ??
      clauses.find(other => other !== clause && firstWord(other) > firstWord(clause))
    if (main) relation(main, clause, span)
    // alone in its message ("where is the title?"), the word modifies its own clause
    else add(clause, 'modifier', span)
  }
  // a question word stands where its grammar puts it
  for (const [clause, span] of pendingQuestions) {
    if (!span) continue
    // ("what colour": the word asks about the noun after it; before a pronoun it stands alone: "what we said")
    const next = [...out.values()].find(wire => wire.type === 'syntax.nominal' && firstWord(wire) === span[1] + 1 && clause.slots.some(slot => slot.ref === wire.id) &&
      !wire.source?.slots.some(slot => slot[0] === 'pronoun'))
    if (next) { add(next, 'dependent', span); continue }
    const word = text.slice(words[span[0]].start, words[span[1]].end).toLowerCase()
    if (span[0] === span[1] && knows.nominalQuestion(word)) {
      const wire = {id: 'q' + ++made, type: 'syntax.nominal', slots: [{key: 'head', span}]}
      out.set(wire.id, wire)
      const verbed = clause.slots.some(slot => slot.key === 'verb')
      clause.slots.push({key: verbed && !clause.slots.some(slot => slot.key === 'subject') ? 'subject' : 'complement', ref: wire.id})
    } else add(clause, 'modifier', span)
  }
  // "a group called g2": a verb form is no linking word. It is the verb of a clause that describes the thing.
  for (const wire of [...out.values()]) {
    if (wire.type !== 'syntax.relation') continue
    const markers = wire.slots.filter(slot => slot.key === 'marker')
    const end = wire.slots.find(slot => slot.key === 'to')
    if (markers.length !== 1 || markers[0].span[0] !== markers[0].span[1] || out.get(end.ref)?.type !== 'syntax.nominal' && byId.get(end.ref)?.type !== 'syntax.nominal') continue
    if (!knows.verbForm(text.slice(words[markers[0].span[0]].start, words[markers[0].span[0]].end).toLowerCase())) continue
    const clause = {id: 'p' + ++made, type: 'syntax.clause', slots: [{key: 'form', value: 'nonfinite'}, {key: 'verb', span: markers[0].span}, {key: 'complement', ref: end.ref}]}
    out.set(clause.id, clause)
    clauses.push(clause)
    wire.slots = wire.slots.filter(slot => slot.key !== 'marker' && slot.key !== 'attachment')
    end.ref = clause.id
  }
  // a sign right after a number ("30%") belongs with that number; any other stray word is said to the listener
  for (const [wire, span] of strays) {
    const sign = !/[\p{L}\p{N}]/u.test(text.slice(words[span[0]].start, words[span[1]].end))
    const owner = sign && span[0] > 0 ? [...out.values()].find(other => other.type === 'syntax.nominal' && other.slots.some(slot => slot.span && slot.span[1] === span[0] - 1)) : null
    add(owner ?? wire, owner ? 'dependent' : 'discourse', span)
  }
  // a coordination needs two conjuncts of one type; otherwise its words go to a clause
  for (const wire of [...out.values()]) {
    if (wire.type !== 'syntax.coordination') continue
    const members = wire.slots.filter(slot => slot.key === 'conjunct')
    const kinds = new Set(members.map(slot => byId.get(slot.ref)?.type ?? out.get(slot.ref)?.type))
    if (members.length >= 2 && kinds.size === 1) continue
    const stand = members[0]?.ref
    for (const other of out.values()) for (const slot of other.slots) if (slot.ref === wire.id && stand) slot.ref = stand
    for (const slot of wire.slots) if (slot.span) add(nearestClause(slot.span), 'discourse', slot.span)
    out.delete(wire.id)
  }
  // a clause other than a fragment needs its verb; a fragment that kept nothing is dropped
  for (const wire of [...out.values()]) {
    if (wire.type !== 'syntax.clause') continue
    const used = [...out.values()].some(other => other !== wire && other.slots.some(slot => slot.ref === wire.id))
    if (wire.slots.length === 1 && !used) out.delete(wire.id)
  }
  // a fragment that holds only words said in passing ("next,", "hey,") joins the clause after it, or the one before
  for (const wire of [...out.values()]) {
    if (wire.type !== 'syntax.clause' || wire.slots[0].value !== 'fragment' || wire.slots.length < 2) continue
    if (!wire.slots.slice(1).every(slot => slot.key === 'modifier' || slot.key === 'discourse')) continue
    if ([...out.values()].some(other => other !== wire && other.slots.some(slot => slot.ref === wire.id))) continue
    const others = [...out.values()].filter(other => other.type === 'syntax.clause' && other !== wire)
    const home = others.filter(other => firstWord(other) > firstWord(wire)).sort((a, b) => firstWord(a) - firstWord(b))[0] ?? others.filter(other => firstWord(other) < firstWord(wire)).sort((a, b) => firstWord(b) - firstWord(a))[0]
    if (!home) continue
    // "Perfect. Now add a title": a quality that is a sentence of its own stays one; it says how something is
    const [left, right] = firstWord(home) > firstWord(wire) ? [wire, home] : [home, wire]
    const between = text.slice(words[lastWord(left)]?.end ?? 0, words[firstWord(right)]?.start ?? text.length)
    // a word that the text showed as saying how things are, and that the language does not list among its linking words
    const quality = slot => slot.key === 'modifier' && slot.span[0] === slot.span[1] && knows.quality?.(words[slot.span[0]].text.toLowerCase())
    if (wire.slots.some(quality) && /[.!?]/u.test(between)) continue
    // "Great, now move the box": set off from a clause that has its own verb, a quality describes nothing in it; it is said in passing
    home.slots.push(...wire.slots.slice(1).map(slot => quality(slot) ? {key: 'discourse', span: slot.span} : slot))
    out.delete(wire.id)
  }
  const kept = [...out.values()]
  // every word has a place: a word left over joins the clause it stands in
  const covered = new Set()
  for (const wire of kept) for (const slot of wire.slots) if (slot.span) for (let index = slot.span[0]; index <= slot.span[1]; index++) covered.add(index)
  const live = kept.filter(wire => wire.type === 'syntax.clause')
  for (let index = 0; index < words.length; index++) {
    if (covered.has(index)) continue
    let home = live.filter(clause => firstWord(clause) <= index).at(-1) ?? live[0]
    if (!home) { home = {id: 'c0', type: 'syntax.clause', slots: [{key: 'form', value: 'fragment'}]}; kept.push(home); live.push(home) }
    home.slots.push({key: 'discourse', span: [index, index]})
  }
  return writeCircuit(text, kept.map(({id, type, slots}) => ({id, type, slots})))
}
