// Wires of the `syntax` schema while a strategy builds them, and their serialisation.
// Every quoted value is a span of words of `wordsOf(text)`: [first, last].
import {writeCircuit} from '../../../../lib/syntax.mjs'

export function createCircuit(text, words) {
  const wires = []
  const counters = {c: 0, n: 0, r: 0, k: 0}
  const make = (prefix, fields) => {
    const wire = {id: prefix + ++counters[prefix], ...fields}
    wires.push(wire)
    return wire
  }
  const circuit = {
    wires,
    clause: (fields = {}) => make('c', {type: 'clause', form: null, verb: null, auxiliary: [], negation: [], modifier: [],
      discourse: [], subject: null, complement: [], ellipsis: null, ...fields}),
    nominal: (head, dependent = []) => make('n', {type: 'nominal', head, dependent}),
    relation: (from, to, marker = null, fields = {}) => make('r', {type: 'relation', from, to, marker, negation: [], ambiguous: false, ...fields}),
    coordination: (conjunct, conjunction = []) => make('k', {type: 'coordination', conjunct, conjunction}),
    /** Put `next` wherever a clause or a relation refers to `old` as subject, complement or end. */
    replace(old, next) {
      for (const wire of wires) {
        if (wire.type === 'clause') {
          if (wire.subject === old) wire.subject = next
          wire.complement = wire.complement.map((item) => item === old ? next : item)
        } else if (wire.type === 'relation' && wire.to === old) wire.to = next
      }
    },
    remove(wire) { wires.splice(wires.indexOf(wire), 1) },
    /**
     * The circuit as text. A word that no wire holds goes, as a modifier, to the clause it
     * stands in: the rule for a word that is neither a nominal nor a marker.
     * @returns {sop, leftover: [word]}
     */
    write() {
      const live = new Set(wires)
      // the conjuncts of a coordination are wires of one type, never coordinations
      for (const wire of wires) {
        if (wire.type !== 'coordination') continue
        wire.conjunct = [...new Set(wire.conjunct.flatMap((item) => item.type === 'coordination' ? item.conjunct : [item]))]
        if (new Set(wire.conjunct.map((item) => item.type)).size > 1) { circuit.replace(wire, wire.conjunct[0]); wire.conjunct = [] }
      }
      // a relation or a coordination whose wires are gone, and a fragment that holds nothing
      for (let changed = true; changed;) {
        changed = false
        for (const wire of [...live]) {
          const refs = wire.type === 'relation' ? [wire.from, wire.to] : wire.type === 'coordination' ? wire.conjunct : []
          const used = () => [...live].some((other) => other !== wire && (other.from === wire || other.to === wire ||
            other.conjunct?.includes(wire) || other.subject === wire || other.complement?.includes(wire) || other.ellipsis === wire))
          const empty = wire.type === 'clause' && !wire.verb && !wire.subject && !wire.complement.length &&
            !wire.modifier.length && !wire.discourse.length && !wire.auxiliary.length && !wire.negation.length
          if (refs.some((ref) => !ref || !live.has(ref)) || (wire.type === 'coordination' && new Set(wire.conjunct).size < 2) || (empty && !used())) {
            live.delete(wire)
            changed = true
          }
        }
      }
      const kept = wires.filter((wire) => live.has(wire))
      for (const wire of kept) {
        if (wire.type !== 'clause') continue
        if (wire.subject && !live.has(wire.subject)) wire.subject = null
        wire.complement = wire.complement.filter((item) => live.has(item))
        if (wire.ellipsis && !(live.has(wire.ellipsis) && wire.ellipsis.verb)) wire.ellipsis = null
      }
      const spans = (wire) => wire.type === 'clause' ? [wire.verb, ...wire.auxiliary, ...wire.negation, ...wire.modifier, ...wire.discourse]
        : wire.type === 'nominal' ? [wire.head, ...wire.dependent] : wire.type === 'relation' ? [wire.marker, ...wire.negation] : wire.conjunction
      const owner = new Array(words.length).fill(null)
      for (const wire of kept) for (const span of spans(wire)) if (span) for (let index = span[0]; index <= span[1]; index++) owner[index] ??= wire
      let clauses = kept.filter((wire) => wire.type === 'clause')
      const firstWord = (wire) => Math.min(...spans(wire).filter(Boolean).map((span) => span[0]), Infinity)
      const leftover = []
      for (let index = 0; index < words.length; index++) {
        if (owner[index]) continue
        leftover.push(words[index].text)
        let home = clauses.filter((clause) => firstWord(clause) <= index).sort((a, b) => firstWord(b) - firstWord(a))[0] ?? clauses[0]
        if (!home) { home = circuit.clause({form: 'fragment'}); kept.push(home); clauses = [home] }
        home.modifier.push([index, index])
        owner[index] = home
      }
      const serial = kept.map((wire) => {
        const slots = []
        const quoted = (key, list) => { for (const span of list) if (span) slots.push({key, span}) }
        const ref = (key, target) => { if (target) slots.push({key, ref: target.id}) }
        if (wire.type === 'clause') {
          const form = wire.verb ? wire.form ?? 'declarative' : 'fragment'
          slots.push({key: 'form', value: form})
          quoted('verb', [wire.verb]); quoted('auxiliary', wire.auxiliary); quoted('negation', wire.negation)
          quoted('modifier', wire.modifier); quoted('discourse', wire.discourse)
          ref('subject', wire.subject)
          for (const item of wire.complement) ref('complement', item)
          if (form === 'fragment') ref('ellipsis', wire.ellipsis)
        } else if (wire.type === 'nominal') {
          quoted('head', [wire.head]); quoted('dependent', wire.dependent)
        } else if (wire.type === 'relation') {
          if (wire.ambiguous) slots.push({key: 'attachment', value: 'ambiguous'})
          quoted('marker', [wire.marker]); quoted('negation', wire.negation)
          ref('from', wire.from); ref('to', wire.to)
        } else {
          quoted('conjunction', wire.conjunction)
          for (const item of wire.conjunct) ref('conjunct', item)
        }
        return {id: wire.id, type: 'syntax.' + wire.type, slots}
      })
      return {sop: writeCircuit(text, serial), leftover}
    }
  }
  return circuit
}
