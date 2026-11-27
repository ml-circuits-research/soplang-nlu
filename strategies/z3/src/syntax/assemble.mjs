// From the solved model to wires. The model has chosen the class of every word, the
// nominals with their heads, the construction of every verb and the attachment of every
// marker phrase. This module lays the words out as clauses, nominals, relations and
// coordinations following the rules of docs/syntax-schema.md, and decides nothing lexical.
import {createCircuit} from './circuit.mjs'
import * as en from './english.mjs'

const unitTypes = {V: 'verb', X: 'aux', G: 'neg', R: 'adv', J: 'adj', C: 'conj', I: 'disc', S: 'poss', M: 'mark', T: 'to'}
// Joining words that continue what stands before them; "so", "but", "yet" open a new main clause.
const continuing = new Set(['and', 'or', 'then', 'plus', 'nor', '&', '+'])

/** Words grouped as the model read them: nominals, marker runs, verbs and single words. */
function unitsOf(tokens, reading) {
  const units = []
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index], read = reading[index]
    const base = {first: index, last: index, brk: token.brk, com: token.com, sentence: token.sentence, lower: token.lower}
    if (read.dependent || read.head) {
      let last = index
      while (reading[last].dependent && last + 1 < tokens.length && !tokens[last + 1].brk &&
        (reading[last + 1].dependent || reading[last + 1].head)) last++
      units.push({...base, type: 'nom', last, pronoun: reading[last].tag === 'P', number: last === index && read.tag === 'Q',
        noun: reading[last].tag === 'N', wh: token.flags.wh, name: token.flags.capital || token.flags.quote, literal: tokens[last].flags.literal,
        common: reading[last].tag === 'N' && !tokens[last].flags.capital && !tokens[last].flags.quote})
      index = last
      continue
    }
    const type = unitTypes[read.tag] ?? 'other'
    const previous = units.at(-1)
    const joins = previous && !token.brk && !token.com
    if (joins && previous.type === type && ['mark', 'conj', 'disc'].includes(type)) { previous.last = index; previous.lower += ' ' + token.lower; continue }
    // "in order to": the marker run and the infinitival "to" are one marker
    if (joins && type === 'to' && previous.type === 'mark') { previous.type = 'to'; previous.last = index; continue }
    units.push({...base, type, context: read.context, attachment: read.attachment, wh: token.flags.wh,
      subordinator: token.flags.subordinator, rel: token.flags.rel, preposition: en.prepositions.has(token.lower),
      be: token.flags.be, doForm: token.flags.do || read.tag === 'G'})
  }
  return units
}

export function assemble(text, {words, tokens}, reading) {
  const circuit = createCircuit(text, words)
  const units = unitsOf(tokens, reading)
  const span = (unit) => [tokens[unit.first].first, tokens[unit.last].last]
  const wordSpan = (index) => [tokens[index].first, tokens[index].last]
  const same = (a, b) => a >= 0 && b < units.length && units[a].sentence === units[b].sentence
  // unit `index` follows the unit before it in the same sentence with no comma between
  const tight = (index) => index > 0 && same(index - 1, index) && !units[index].com
  const light = (unit) => ['aux', 'neg', 'adv', 'disc'].includes(unit.type)
  const verbs = units.map((unit, index) => unit.type === 'verb' ? index : -1).filter((index) => index >= 0)

  // a marker before a subject introduces the clause when it is a subordinator; a word that is
  // also a preposition ("after", "before") does so once a clause stands before it or it opens the sentence
  const clauseMarker = (unit) => unit.last > unit.first ? en.complexSubordinators.has(unit.lower) : unit.rel || (unit.subordinator && !unit.preposition)
  const introduces = (index, verbBefore) => {
    const unit = units[index]
    if (unit.type !== 'mark') return false
    return clauseMarker(unit) || (unit.last === unit.first && unit.subordinator && (verbBefore || unit.brk || unit.com))
  }

  // what stands before each verb and belongs to its clause
  const fields = new Map()
  for (const verb of verbs) {
    const context = units[verb].context
    const verbBefore = verbs.some((other) => other < verb && same(other, verb))
    let at = verb - 1
    while (at >= 0 && same(at, verb) && light(units[at]) && !units[at + 1].com) at--
    const field = {start: at + 1, subject: null, introducer: null, host: null, conj: null, inverted: false, afterVerb: null}
    const here = () => at >= 0 && same(at, verb) && !units[at + 1].com
    if (['s', 'a'].includes(context) && here() && units[at].type === 'nom') {
      field.subject = at
      const auxiliaryBetween = units.slice(at + 1, verb).some((unit) => unit.type === 'aux')
      let front = at - 1
      while (front >= 0 && same(front, verb) && ['aux', 'neg', 'adv'].includes(units[front].type) && !units[front + 1].com) front--
      if (context === 'a' && !auxiliaryBetween && units.slice(front + 1, at).some((unit) => unit.type === 'aux')) {
        // "can you add", "what does it show": the auxiliary stands before the subject
        field.inverted = true
        at = front
        if (here() && units[at].wh && ['nom', 'adv'].includes(units[at].type)) at--
      } else {
        // the subject phrase: nominals tied by markers, "the floor of the value axis"
        while (at >= 2 && same(at - 2, verb) && units[at - 1].type === 'mark' && !introduces(at - 1, verbBefore) &&
          units[at - 2].type === 'nom' && !units[at].com && !units[at - 1].com) at -= 2
        field.subject = at
        at--
      }
      field.start = at + 1
    }
    if (here() && context === 't' && units[at].type === 'to') field.introducer = at--
    else if (here() && context === 'r' && units[at].type === 'mark') field.introducer = at--
    else if (here() && context === 'p' && units[at].type === 'mark') field.introducer = at--
    else if (here() && ['s', 'a'].includes(context) && field.subject !== null && !field.inverted && introduces(at, verbBefore)) field.introducer = at--
    else if (here() && context === 'p' && units[at].type === 'nom') field.host = at
    else if (here() && context === 'p' && units[at].type === 'adj' && at >= 1 && tight(at) && units[at - 1].type === 'nom') field.host = at - 1
    else if (here() && context === 'p' && units[at].type === 'verb') field.afterVerb = at
    if (field.introducer !== null) field.start = field.introducer
    if (at >= 0 && same(at, verb) && units[at].type === 'conj' && at === field.start - 1) { field.conj = at; field.start = at }
    field.kind = context === 't' ? 'INF' : context === 'b' ? 'BARE' : context === 'p' ? 'PART' : context === 'r' ? 'REL'
      : field.introducer !== null ? 'SUB' : 'MAIN'
    fields.set(verb, field)
  }
  const starts = new Map()
  for (const verb of verbs) if (!starts.has(fields.get(verb).start)) starts.set(fields.get(verb).start, verb)

  const consumed = new Set()
  const unitWire = new Map()
  const clauseOf = new Map()
  let stack = []
  let lastMain = null
  let orphans = []
  let period = 0
  const top = () => stack.at(-1)
  const newClause = (verb, kind) => {
    const clause = circuit.clause({kind, verbUnit: verb, context: verb === null ? null : units[verb].context, field: verb === null ? null : fields.get(verb)})
    if (verb !== null) clauseOf.set(verb, clause)
    return clause
  }
  const flushMarker = (clause) => {
    if (!clause?.pending) return
    clause.modifier.push(span(clause.pending.unit))
    for (const negation of clause.pending.negation) clause.negation.push(negation)
    clause.pending = null
  }
  const pop = () => { flushMarker(top()); stack.pop() }
  // the root clauses of one sentence stand side by side: each is joined to the one before it
  const root = (clause, conj = null) => {
    // "if it is not too much trouble, a hawk": the clause that opened the sentence starts here
    for (const {clause: waiting, marker} of orphans.splice(0)) circuit.relation(clause, waiting, span(marker))
    const previous = lastMain
    lastMain = clause
    if (!previous || previous === clause) return false
    if (conj !== null) { coordinate(previous, clause, conj); return true }
    if (previous.period === clause.period) coordinate(previous, clause, null)
    return false
  }
  const current = () => {
    if (!stack.length) {
      const fragment = newClause(null, 'FRAGMENT')
      fragment.period = period
      stack.push(fragment)
      root(fragment)
    }
    return top()
  }
  /** Join clause `next` to `previous` with the joining words of `conj`. */
  const coordinate = (previous, next, conj) => {
    const words = conj === null ? [] : [span(units[conj])]
    // one list, one coordination: "A, B and C". A second joining word opens a new one: "A, then B, and C"
    const existing = circuit.wires.find((wire) => wire.type === 'coordination' && wire.conjunct.at(-1) === previous && !wire.conjunction.length)
    if (existing) { existing.conjunct.push(next); existing.conjunction.push(...words); return existing }
    const wire = circuit.coordination([previous, next], words)
    if (conj !== null && !circuit.wires.some((other) => other !== wire && other.type === 'coordination' && other.conjunct.includes(previous))) {
      for (const relation of circuit.wires) if (relation.type === 'relation' && relation.to === previous) relation.to = wire
    }
    return wire
  }
  /** The start of a marker relation, as the model settled it. */
  const startOf = (marker, markerIndex, clause) => {
    if (marker.attachment === 'nominal') {
      let at = markerIndex - 1
      if (at >= 0 && ['adj', 'adv'].includes(units[at].type)) at--
      const wire = unitWire.get(at)
      if (wire) return {from: wire, ambiguous: false}
    }
    return {from: clause, ambiguous: marker.attachment === 'ambiguous'}
  }

  function open(verb) {
    const field = fields.get(verb)
    const context = units[verb].context
    if (clauseOf.has(verb)) {
      // opened early for the words that stand before it
      while (top() !== clauseOf.get(verb)) pop()
      if (root(top(), field.conj)) consumed.add(field.conj)
      return
    }
    const parent = top()
    const clause = newClause(verb, field.kind)
    const startUnit = units[field.start]
    if (field.kind === 'MAIN') {
      const cued = startUnit.com || startUnit.brk || field.conj !== null
      const joiner = field.conj === null ? null : units[field.conj]
      if (parent?.verb && !cued) {
        // a clause that completes the verb before it: "I think it fits"
        clause.kind = 'CONTENT'
        circuit.relation(parent, clause)
      } else if (joiner && parent && joiner.lower.split(' ').every((word) => continuing.has(word)) &&
          ((['INF', 'BARE'].includes(parent.kind) && context === 'i') ||
            (['SUB', 'REL', 'CONTENT'].includes(parent.kind) && ['s', 'a'].includes(context) && field.subject !== null))) {
        // like joins like: an infinitive goes on after the joining word ("to delete it and move
        // the box"), and so does a subordinate clause ("where y is spend and x is conversions")
        clause.kind = parent.kind
        clause.nonfinite = context === 'i'
        consumed.add(field.conj)
        pop()
        coordinate(parent, clause, field.conj)
      } else {
        while (stack.length) pop()
        clause.period = period
        if (root(clause, field.conj)) consumed.add(field.conj)
      }
    } else if (field.introducer !== null) {
      const marker = units[field.introducer]
      consumed.add(field.introducer)
      const hostIndex = field.introducer - 1
      const host = hostIndex >= 0 && tight(field.introducer) && units[hostIndex].type === 'nom' ? unitWire.get(hostIndex) : null
      if (field.kind === 'INF') {
        if (parent) circuit.relation(parent, clause, span(marker))
        else orphans.push({clause, marker})
      } else if (marker.rel && marker.last === marker.first && host) {
        // a relative clause describes the nominal before it
        circuit.relation(host, clause, span(marker))
      } else if (!parent) orphans.push({clause, marker})
      else if (clauseMarker(marker)) circuit.relation(parent, clause, span(marker))
      else {
        const {from, ambiguous} = startOf(marker, field.introducer, parent)
        circuit.relation(from, clause, span(marker), {ambiguous})
      }
    } else if (field.kind === 'PART') {
      const previous = field.afterVerb === null ? null : clauseOf.get(field.afterVerb)
      if (field.host !== null && unitWire.get(field.host)) circuit.relation(unitWire.get(field.host), clause)
      else if (previous?.kind === 'PART' && previous.hostWire) {
        // participles in a row describe the same nominal: "sitting facing right"
        circuit.relation(previous.hostWire, clause)
        clause.hostWire = previous.hostWire
        if (top() === previous) pop()
      } else if (parent) circuit.relation(parent, clause)
      if (field.host !== null) clause.hostWire = unitWire.get(field.host)
    } else if (parent) circuit.relation(parent, clause)
    clause.sentence = units[verb].sentence
    stack.push(clause)
  }

  /** The nominal of a unit: one dependent per word before the head. */
  const nominalOf = (index) => {
    const unit = units[index]
    const dependents = []
    for (let at = unit.first; at < unit.last; at++) dependents.push(wordSpan(at))
    const wire = circuit.nominal(wordSpan(unit.last), dependents)
    unitWire.set(index, wire)
    return wire
  }
  const relate = (clause, to, toIndex) => {
    const {unit, index, negation, join} = clause.pending
    clause.pending = null
    let {from, ambiguous} = startOf(unit, index, clause)
    if (join) ({from, ambiguous} = join.left)
    const relation = circuit.relation(from, to, span(unit), {negation, ambiguous})
    if (join) {
      // joined marker phrases start at the same wire: "near Ben but not behind Jo"
      const existing = circuit.wires.find((wire) => wire.type === 'coordination' && wire.conjunct.at(-1) === join.left)
      if (existing) { existing.conjunct.push(relation); existing.conjunction.push(span(units[join.conj])) }
      else circuit.coordination([join.left, relation], [span(units[join.conj])])
    }
    clause.lastRelation = relation
    return relation
  }

  function place(index) {
    const unit = units[index]
    const clause = current()
    const next = same(index, index + 1) ? units[index + 1] : null
    const stranded = () => { if (clause.pending && !['adv', 'neg', 'nom'].includes(unit.type)) flushMarker(clause) }
    stranded()
    switch (unit.type) {
      case 'verb': {
        const own = clauseOf.get(index) ?? clause
        own.verb = span(unit)
        own.verbPlaced = true
        break
      }
      case 'aux':
        if (clause.verbUnit !== null) clause.auxiliary.push(span(unit))
        else clause.modifier.push(span(unit))
        break
      case 'neg': {
        const before = index > 0 && same(index - 1, index) ? units[index - 1].type : null
        if (next?.type === 'mark' && !units[index + 1].com && before !== 'aux' && before !== 'verb' && !starts.has(index + 1)) clause.heldNegation = span(unit)
        else if (clause.pending) clause.pending.negation.push(span(unit))
        else clause.negation.push(span(unit))
        break
      }
      case 'adv':
      case 'adj': {
        const last = clause.lastNominal
        // a word that says how the nominal before it is: a dependent of the end of a relation
        if (unit.type === 'adj' && last && last.index === index - 1 && tight(index) && last.target && !units[last.index].pronoun) {
          last.wire.dependent.push(span(unit))
        } else if (unit.type === 'adv' && clause.pending) clause.modifier.push(span(unit))
        else { clause.modifier.push(span(unit)); clause.lastModifier = {index, at: clause.modifier.length - 1} }
        break
      }
      case 'disc':
        clause.discourse.push(span(unit))
        break
      case 'mark': {
        const join = clause.joinRelation
        clause.joinRelation = null
        clause.pending = {unit, index, negation: clause.heldNegation ? [clause.heldNegation] : [], join}
        clause.heldNegation = null
        break
      }
      case 'nom': {
        const wire = nominalOf(index)
        if (next?.type === 'poss' && same(index, index + 2) && units[index + 2].type === 'nom' && !units[index + 1].com && !units[index + 2].com) {
          // the owner: its role goes to the thing owned, tied to it by 's
          clause.owner = {wire, marker: index + 1}
          consumed.add(index + 1)
          break
        }
        const owner = clause.owner
        clause.owner = null
        if (owner) circuit.relation(wire, owner.wire, span(units[owner.marker]))
        const previous = clause.lastNominal
        let target = false
        if (clause.joinNominal) {
          const {left, conj} = clause.joinNominal
          clause.joinNominal = null
          const existing = circuit.wires.find((item) => item.type === 'coordination' && item.conjunct.at(-1) === left.at(-1))
          if (existing && left.length === 1) { existing.conjunct.push(wire); existing.conjunction.push(span(units[conj])) }
          else {
            const group = circuit.coordination([...left, wire], [span(units[conj])])
            circuit.replace(left[0], group)
            for (const extra of left.slice(1)) for (const other of circuit.wires) if (other.type === 'clause') other.complement = other.complement.filter((item) => item !== extra)
          }
          target = previous?.target ?? false
        } else if (clause.pending) { relate(clause, wire, index); target = true }
        else if (clause.field?.subject === index) clause.subject = wire
        else if (clause.context === 'q' && !clause.subject && clause.verbPlaced) clause.subject = wire
        else if (previous && previous.index === index - 1 && tight(index) && ((unit.number && units[previous.index].noun) ||
            (unit.name && (units[previous.index].common || units[previous.index].literal)))) {
          // a number or a name after a noun stands with it: "x 120", "level 3", "the node Intro"; so does the zone after a time: "11:00 UTC"
          circuit.relation(previous.wire, wire)
        } else clause.complement.push(wire)
        clause.lastNominal = {index, wire, target}
        break
      }
      case 'conj': {
        const after = next && !units[index + 1].brk ? index + 1 : null
        const afterType = after === null ? null : units[after].type
        const last = clause.lastNominal
        if (afterType === 'nom' && last) {
          // a shared verb: "make A blue and B green"
          const modifierBefore = clause.lastModifier?.index === index - 1 && last.index === index - 2
          const modifierAfter = same(index, index + 2) && ['adj', 'adv'].includes(units[index + 2].type) && !units[index + 2].com && !starts.has(index + 2)
          if (clause.verb && modifierBefore && modifierAfter && !last.target) {
            const fragment = circuit.clause({kind: 'ELLIPSIS', verbUnit: null, ellipsis: clause})
            fragment.complement.push(nominalOf(after))
            consumed.add(after)
            for (let at = index + 2; same(index, at) && ['adj', 'adv'].includes(units[at].type) && !units[at].com && !starts.has(at); at++) {
              fragment.modifier.push(span(units[at]))
              consumed.add(at)
            }
            coordinate(clause, fragment, index)
            break
          }
          clause.joinNominal = {left: leftConjuncts(clause, index), conj: index}
          break
        }
        if (afterType === 'disc' && clause.verb && (!same(index, index + 2) || units[index + 2].com)) {
          // "move the box, and thanks": the thanks are a fragment of their own
          const fragment = circuit.clause({kind: 'FRAGMENT', verbUnit: null})
          fragment.discourse.push(span(units[after]))
          consumed.add(after)
          coordinate(clause, fragment, index)
          break
        }
        if ((afterType === 'mark' || (afterType === 'neg' && same(index, index + 2) && units[index + 2].type === 'mark')) && clause.lastRelation && !starts.has(after)) {
          clause.joinRelation = {left: clause.lastRelation, conj: index}
          break
        }
        // a joining word between two modifiers has no wire of its own: "calm and tidy"
        clause.discourse.push(span(unit))
        break
      }
      default:
        clause.modifier.push(span(unit))
    }
  }

  /** The nominals a joining word continues: the nearest one, or the items of a comma list. */
  function leftConjuncts(clause, conj) {
    const last = clause.lastNominal
    const pieceStart = (index) => { let at = index; while (at > 0 && same(at - 1, at) && !units[at].com) at--; return at }
    // a list item: a nominal that opens a comma piece and is a complement of this clause
    const item = (index) => {
      const wire = units[index].type === 'nom' ? unitWire.get(index) : null
      return wire && clause.complement.includes(wire) ? wire : null
    }
    const list = []
    let at = pieceStart(last.index)
    while (item(at)) {
      list.unshift(item(at))
      if (at === 0 || !same(at - 1, at) || !units[at].com) { at = -1; break }
      at = pieceStart(at - 1)
    }
    // the first item may close the piece before the list: "draw A, B and C", "between A, B and C"
    if (list.length && at >= 0) {
      const first = units.findIndex((unit, index) => unitWire.get(index) === list[0])
      if (first > 0 && units[first - 1].type === 'nom' && unitWire.has(first - 1)) list.unshift(unitWire.get(first - 1))
    }
    return list.length && (units[conj].com || list.length > 1 || list.at(-1) === last.wire) ? list : [last.wire]
  }

  // one sentence at a time
  const sentences = Map.groupBy(units.keys(), (index) => units[index].sentence)
  for (const indexes of sentences.values()) {
    while (stack.length) pop()
    const first = indexes[0], end = indexes.at(-1)
    if (tokens[units[first].first].sentenceBreak) period++
    const inside = verbs.filter((verb) => verb >= first && verb <= end)
    const main = inside.find((verb) => fields.get(verb).kind === 'MAIN')
    const earliest = Math.min(...inside.map((verb) => fields.get(verb).start), Infinity)
    // words before the first clause belong to the main clause of the sentence, unless a bare
    // nominal stands there, which is a fragment of its own
    const bare = indexes.some((index) => index < earliest && units[index].type === 'nom' && !(index > first && ['mark', 'poss'].includes(units[index - 1].type)))
    if (main !== undefined && !bare && fields.get(main).start > first) {
      const early = newClause(main, 'MAIN')
      early.sentence = units[main].sentence
      early.period = period
      stack.push(early)
    }
    for (const index of indexes) {
      if (starts.has(index)) open(starts.get(index))
      if (consumed.has(index)) continue
      // a comma closes a participle clause and a subordinate clause
      if (units[index].com) while (stack.length > (orphans.length ? 0 : 1) && ['PART', 'SUB', 'REL'].includes(top().kind) && clauseOf.get(top().verbUnit) === top() && top().verbPlaced) pop()
      place(index)
    }
    while (stack.length) pop()
    // no clause came for it to belong to: the marker stays with its own clause
    for (const {clause, marker} of orphans.splice(0)) clause.modifier.push(span(marker))
  }

  // the form of each clause, from its build
  const clauses = circuit.wires.filter((wire) => wire.type === 'clause')
  for (const clause of clauses) {
    if (!clause.verb) { clause.form = 'fragment'; continue }
    const {context, field} = clause
    const auxiliaries = units.slice(field.start, clause.verbUnit).filter((unit) => unit.type === 'aux')
    const startUnit = units[field.introducer === null ? (field.conj === null ? field.start : field.conj + 1) : field.start]
    const whFirst = clause.kind === 'MAIN' && startUnit?.wh && ['nom', 'adv'].includes(startUnit.type)
    const bare = context === 'p' && field.host === null && field.introducer === null && field.afterVerb === null
    clause.form = bare && tokens[units[clause.verbUnit].first].form.past ? 'declarative'
      : clause.nonfinite || ['t', 'p', 'b'].includes(context) ? 'nonfinite'
      : context === 'q' || field.inverted || whFirst ? 'interrogative'
      : ['i', 'a'].includes(context) && !clause.subject && auxiliaries.every((unit) => unit.doForm) ? 'imperative' : 'declarative'
    // "what colour is the castle?": the nominal after "be" is the subject
    if (whFirst && clause.subject && units[clause.verbUnit].be && clause.complement.length && unitWire.get(field.subject) === clause.subject) {
      const asked = clause.subject
      clause.subject = clause.complement.shift()
      clause.complement.unshift(asked)
    }
  }
  // a question mark: the last finite clause of its sentence asks
  for (const indexes of sentences.values()) {
    if (!tokens[units[indexes.at(-1)].last].question) continue
    const asked = clauses.filter((clause) => clause.verb && clause.sentence === units[indexes[0]].sentence && clause.form === 'declarative' &&
      ['MAIN', 'CONTENT'].includes(clause.kind)).at(-1)
    if (asked) asked.form = 'interrogative'
  }
  return circuit.write()
}
