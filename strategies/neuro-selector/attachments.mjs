// Rule 2 of the syntax schema for a strategy that chooses among the circuits of others.
//
// Several circuits of one message often agree on everything except where a phrase with a marker
// starts: at the verb, or at a nominal of the same clause. The words do not settle that, and a
// selector has no ground of its own to settle it. So when the start written in the chosen circuit
// is not the start of most of the circuits that hold the same phrase, the chosen circuit is
// returned with that relation started at its clause and marked `attachment=ambiguous`.
// Nothing else of the chosen circuit changes.
import {parseCircuit, validateSyntax} from '../../lib/syntax.mjs'

/** A circuit with what is needed to compare its relations with those of another circuit. */
function read(text, sop) {
  const check = validateSyntax(text, sop)
  if (!check.valid) return null
  const wires = parseCircuit(sop), byId = new Map(wires.map(wire => [wire.id, wire]))
  const placed = new Map()
  for (const place of check.placements) placed.set(place.wire, [...(placed.get(place.wire) ?? []), place])
  const quoted = (wire, key) => (placed.get(wire.id) ?? []).filter(place => place.key === key)
  const targets = (wire, key) => wire.slots.filter(slot => slot[1].startsWith('$') && (!key || slot[0] === key)).map(slot => byId.get(slot[1].slice(1)))
  // A name that two circuits share for wires that hold the same place in the message: a clause by
  // its verb, a nominal by its head, a wire without such a word by what it holds.
  const name = (wire, depth = 0) => {
    if (!wire || depth > 6) return '?'
    const held = () => '[' + targets(wire).map(other => name(other, depth + 1)).sort().join('+') + ']'
    if (wire.type === 'syntax.nominal') return 'n' + quoted(wire, 'head')[0].first
    if (wire.type === 'syntax.clause') {
      const verb = quoted(wire, 'verb')[0], first = Math.min(...(placed.get(wire.id) ?? []).map(place => place.first))
      return 'c' + (verb ? verb.first : Number.isFinite(first) ? 'w' + first : held())
    }
    return (wire.type === 'syntax.coordination' ? 'k' : 'r') + held()
  }
  // the clause a wire belongs to: itself, the clause that takes it, or the clause of what leads to it
  const clauseOf = (wire, seen = new Set()) => {
    if (!wire || seen.has(wire)) return null
    seen.add(wire)
    if (wire.type === 'syntax.clause') return wire
    const taker = wires.find(other => other.type === 'syntax.clause' && [...targets(other, 'subject'), ...targets(other, 'complement')].includes(wire))
    if (taker) return taker
    for (const other of wires) {
      const leads = (other.type === 'syntax.coordination' && targets(other, 'conjunct').includes(wire)) ? clauseOf(other, seen)
        : (other.type === 'syntax.relation' && targets(other, 'to')[0] === wire) ? clauseOf(targets(other, 'from')[0], seen) : null
      if (leads) return leads
    }
    return wire.type === 'syntax.relation' ? clauseOf(targets(wire, 'from')[0], seen) : null
  }
  const relations = wires.filter(wire => wire.type === 'syntax.relation' && quoted(wire, 'marker').length).map(wire => {
    const from = targets(wire, 'from')[0], home = clauseOf(from)
    return {wire, phrase: quoted(wire, 'marker').map(place => place.first + '-' + place.last).join(',') + '>' + name(targets(wire, 'to')[0]),
      from: name(from), ambiguous: wire.slots.some(slot => slot[0] === 'attachment'),
      home, homeName: home ? name(home) : null, verbal: Boolean(home && quoted(home, 'verb').length)}
  })
  return {wires, relations, names: new Set(wires.map(wire => name(wire)))}
}

/**
 * @param sop the chosen circuit
 * @param voters the circuits that take part, the chosen one among them, one for each strategy that wrote it
 * @returns the chosen circuit, with the relations whose start the voters do not settle marked ambiguous
 */
export function settleAttachments(text, sop, voters) {
  const chosen = read(text, sop)
  if (!chosen) return sop
  const others = voters.map(voter => read(text, voter)).filter(Boolean)
  const unsettled = new Map()
  for (const relation of chosen.relations) {
    if (relation.ambiguous || !relation.verbal) continue
    // the same phrase in the other circuits: the same marker words before the same end
    const same = others.map(other => other.relations.find(candidate => candidate.phrase === relation.phrase)).filter(Boolean)
    const agree = same.filter(candidate => !candidate.ambiguous && candidate.from === relation.from)
    if (same.length < 2 || agree.length * 2 > same.length) continue
    // only a doubt within one clause is what the mark says: another circuit starts the phrase at
    // another wire of the same clause, a wire that the chosen circuit has too
    if (!same.some(candidate => !agree.includes(candidate) && candidate.homeName === relation.homeName &&
      (candidate.ambiguous || chosen.names.has(candidate.from)))) continue
    unsettled.set(relation.wire.id, relation.home.id)
  }
  if (!unsettled.size) return sop
  const written = chosen.wires.map(wire => {
    const home = unsettled.get(wire.id)
    const slots = home ? [...wire.slots.map(([key, raw]) => [key, key === 'from' ? '$' + home : raw]), ['attachment', 'ambiguous']] : wire.slots
    return [`@${wire.id} ${wire.type}`, ...slots.map(([key, raw]) => `${key}=${raw}`)].join(' ')
  }).join('\n')
  return validateSyntax(text, written).valid ? written : sop
}
