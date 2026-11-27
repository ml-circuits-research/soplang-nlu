// The output stage of the DistilBERT strategy: from what the model predicts for a message to
// one circuit of the `syntax` schema, written with the shared writer.
//
// The model names the wires, the key of every word and the ties itself (see targets.mjs). What
// is left to do here is to keep the circuit within the schema where the model's first choices
// do not fit together, always by taking the model's next choice:
//   - every word takes the first of its ranked places whose wire still stands;
//   - a nominal with no word, a relation without two different ends and a coordination without
//     two conjuncts of one type do not stand;
//   - a clause has one verb and a nominal one head, each a run of neighbouring words;
//   - the form of a clause agrees with whether it has a verb;
//   - two wires that hold the same wires are one wire;
//   - a nominal that nothing holds takes the tie the model ranks highest for it, else it
//     belongs to the clause in which it stands.
// No rule names a word of a message.
import {writeCircuit, schema} from '../../lib/syntax.mjs'
import {alignWords, modelSchema} from './targets.mjs'

const TYPES = modelSchema()
const LETTER = {clause: 'c', nominal: 'n', relation: 'r', coordination: 'k'}
const ORDER = Object.keys(TYPES)
// keys that hold one run of neighbouring words, by the schema; the other keys hold one word per
// value, except these two, where neighbouring words are one value ("next to", "and then")
const single = (kind, key) => !schema['syntax.' + kind][key].many
const JOINED = new Set(['marker', 'conjunction'])

/** Write the circuit of a message from the prediction of the model. */
export function writeSyntaxCircuit(text, tokens, prediction, options) {
  return writeCircuit(text, circuitWires(text, tokens, prediction, options))
}

/**
 * The wires of a message, as the shared writer takes them.
 * @param tokens the tokens given to the model (`modelTokens(text)`)
 * @param prediction {nodes: [{type, anchor, p, atoms: {key: {value: p}}, edges: {key: [[node, p]]}}],
 *   owners: for every token [[node, key, p]]}, each list ranked, the best first
 * @param tie the probability from which an optional tie (subject, complement, ellipsis,
 *   conjunct, attachment=ambiguous) is written
 * @returns [{id, type, slots}]. Throws when the prediction cannot be read.
 */
export function circuitWires(text, tokens, prediction, {tie = 0.5} = {}) {
  const {words, tokenOfWord, wordOfToken} = alignWords(text, tokens)
  if (!words.length) throw Error('The message has no words.')
  const predicted = prediction?.nodes
  if (!Array.isArray(predicted) || !predicted.length) throw Error('The model found no wire in the message.')
  const inRange = (value, size) => Number.isInteger(value) && value >= 0 && value < size
  const wires = predicted.map(node => {
    if (!TYPES[node?.type] || !inRange(node.anchor, tokens.length)) throw Error('The model returned a wire that cannot be read.')
    return {kind: node.type, anchor: wordOfToken[node.anchor], node, held: [], subject: null, complements: [], conjuncts: [], ends: null, ellipsis: null}
  })
  const standing = new Set(wires)
  const fits = (wire, key, other) => other && other !== wire && standing.has(other) && TYPES[wire.kind].edges[key].targets.includes(other.kind)
  // the model's choices for a reference of a wire, the best first, among the wires that stand
  const ranked = (wire, key) => (wire.node?.edges?.[key] ?? []).map(([target, p]) => ({wire: wires[target], p})).filter(choice => fits(wire, key, choice.wire))
  const places = word => (prediction.owners?.[tokenOfWord[word]] ?? []).filter(([node, key]) => wires[node] && TYPES[wires[node].kind].words.includes(key))

  // ---- 1. which wires stand, and which wire holds every word
  let homeless = []
  for (let changed = true; changed;) {
    changed = false
    for (const wire of standing) { wire.held = []; wire.conjuncts = []; wire.ends = null }
    homeless = []
    words.forEach((_, word) => {
      const place = places(word).find(([node]) => standing.has(wires[node]))
      if (place) wires[place[0]].held.push({key: place[1], word})
      else homeless.push(word)
    })
    for (const wire of [...standing]) {
      if (wire.kind === 'nominal' && !wire.held.length) { standing.delete(wire); changed = true }
      if (wire.kind !== 'relation' || !standing.has(wire)) continue
      // the two ends of a relation: the pair of different wires the model ranks highest
      let best = null
      for (const from of ranked(wire, 'from').slice(0, 4)) for (const to of ranked(wire, 'to').slice(0, 4)) {
        if (from.wire !== to.wire && (!best || from.p * to.p > best.p)) best = {from: from.wire, to: to.wire, p: from.p * to.p, fromP: from.p}
      }
      if (best) wire.ends = best
      else { standing.delete(wire); changed = true }
    }
    // the conjuncts of a coordination: those the model is sure of, at least its best two, of one type
    for (const wire of [...standing]) {
      if (wire.kind !== 'coordination') continue
      const all = ranked(wire, 'conjunct')
      const kind = all[0]?.wire.kind
      wire.conjuncts = all.filter(choice => choice.wire.kind === kind).filter((choice, index) => choice.p >= tie || index < 2).map(choice => choice.wire)
      if (wire.conjuncts.length < 2) { standing.delete(wire); changed = true }
    }
  }

  const first = wire => Math.min(...wire.held.map(held => held.word), Infinity)
  const last = wire => Math.max(...wire.held.map(held => held.word), -1)
  const holds = wire => wire.kind === 'clause' ? [wire.subject, ...wire.complements].filter(Boolean)
    : wire.kind === 'relation' ? [wire.ends.to] : wire.kind === 'coordination' ? wire.conjuncts : []
  // where a wire begins: at its first word, else where what it holds begins
  const start = (wire, seen = new Set()) => {
    if (seen.has(wire)) return Infinity
    seen.add(wire)
    const own = first(wire)
    return own < Infinity ? own : Math.min(...holds(wire).map(other => start(other, seen)), wire.anchor ?? Infinity)
  }
  const ofKind = kind => [...standing].filter(wire => wire.kind === kind)
  const fragment = anchor => { const wire = {kind: 'clause', anchor, node: null, held: [], subject: null, complements: [], conjuncts: [], ends: null, ellipsis: null}; wires.push(wire); standing.add(wire); return wire }
  // the clause in which a word stands: the last clause that begins at or before it, else the first clause
  const clauseAt = (word, except = new Set()) => {
    const clauses = ofKind('clause').filter(clause => !except.has(clause)).sort((a, b) => start(a) - start(b))
    return clauses.filter(clause => start(clause) <= word).at(-1) ?? clauses[0] ?? null
  }

  // ---- 2. one verb in a clause and one head in a nominal, each a run of neighbouring words
  const other = {clause: 'modifier', nominal: 'dependent'}
  for (const wire of standing) {
    const key = TYPES[wire.kind].words.find(name => single(wire.kind, name))
    if (!key || !other[wire.kind]) continue
    const named = wire.held.filter(held => held.key === key).sort((a, b) => a.word - b.word)
    const runs = []
    for (const held of named) { if (runs.at(-1)?.at(-1).word === held.word - 1) runs.at(-1).push(held); else runs.push([held]) }
    if (runs.length > 1) {
      // the run where the wire stands, else the first one, keeps the key
      const kept = runs.find(run => run.some(held => held.word === wire.anchor)) ?? runs[0]
      for (const run of runs) if (run !== kept) for (const held of run) held.key = other[wire.kind]
    }
    if (wire.kind === 'nominal' && !runs.length) {
      // no word was named the head: the word the model ranks highest as the head of this nominal, else its last word
      const asHead = held => places(held.word).find(([node, name]) => wires[node] === wire && name === key)?.[2] ?? 0
      const chosen = wire.held.reduce((best, held) => asHead(held) > asHead(best) || (asHead(held) === asHead(best) && held.word > best.word) ? held : best)
      chosen.key = key
    }
  }

  // ---- 3. what a clause takes
  for (const wire of ofKind('clause')) {
    const subject = ranked(wire, 'subject')[0]
    const complements = ranked(wire, 'complement').filter(choice => choice.p >= tie)
    const twice = subject && complements.find(choice => choice.wire === subject.wire)
    wire.subject = subject && subject.p >= tie && !(twice && twice.p > subject.p) ? subject.wire : null
    wire.complements = complements.filter(choice => choice.wire !== wire.subject).map(choice => choice.wire)
  }

  // ---- two wires that hold the same wires say one thing: they are one wire
  const replace = (gone, kept) => {
    const swap = list => [...new Set(list.map(wire => wire === gone ? kept : wire))]
    for (const by of standing) {
      if (by.subject === gone) by.subject = kept
      by.complements = swap(by.complements).filter(wire => wire !== by.subject)
      by.conjuncts = swap(by.conjuncts)
      if (by.ends) by.ends = {...by.ends, from: by.ends.from === gone ? kept : by.ends.from, to: by.ends.to === gone ? kept : by.ends.to}
    }
    kept.held.push(...gone.held)
    standing.delete(gone)
  }
  const sure = wire => wire.node?.p ?? 0
  const twins = (kind, key, usable = () => true) => {
    const groups = new Map()
    for (const wire of ofKind(kind)) if (usable(wire)) groups.set(key(wire), [...(groups.get(key(wire)) ?? []), wire])
    return [...groups.values()].filter(group => group.length > 1).map(group => group.sort((a, b) => (b.held.length > 0) - (a.held.length > 0) || sure(b) - sure(a)))
  }
  const names = list => list.map(wire => wires.indexOf(wire)).sort((a, b) => a - b).join()
  // coordinations of the same conjuncts
  for (const [kept, ...rest] of twins('coordination', wire => names(wire.conjuncts))) for (const gone of rest) replace(gone, kept)
  // relations between the same two wires: one that has no word says nothing more than the other
  for (const [kept, ...rest] of twins('relation', wire => names([wire.ends.from]) + '>' + names([wire.ends.to]))) for (const gone of rest) if (!gone.held.length) standing.delete(gone)
  // clauses with no word that take the same wires
  for (const [kept, ...rest] of twins('clause', wire => names([wire.subject].filter(Boolean)) + '|' + names(wire.complements), wire => !wire.held.length && holds(wire).length)) for (const gone of rest) replace(gone, kept)
  // a relation whose two ends have become one wire does not stand; its words look for another place
  for (const wire of ofKind('relation')) if (wire.ends.from === wire.ends.to) { homeless.push(...wire.held.map(held => held.word)); standing.delete(wire) }

  // ---- 4. every nominal, and every coordination of nominals, has a place
  const nominalLike = wire => wire.kind === 'nominal' || (wire.kind === 'coordination' && wire.conjuncts.every(conjunct => conjunct.kind === 'nominal'))
  const held = wire => [...standing].some(by => by !== wire && (by.subject === wire || by.complements.includes(wire) || by.conjuncts.includes(wire) || by.ends?.to === wire))
  const reach = wire => {
    const found = new Set([wire]), queue = [wire]
    while (queue.length) {
      const at = queue.shift()
      for (const next of [...holds(at), ...ofKind('relation').filter(relation => relation.ends.from === at).map(relation => relation.ends.to)]) if (!found.has(next)) { found.add(next); queue.push(next) }
    }
    return found
  }
  for (const wire of [...standing].filter(nominalLike).sort((a, b) => start(a) - start(b))) {
    if (held(wire)) continue
    // the tie the model ranks highest for it, among the clauses that can still take it
    const below = reach(wire)
    let best = null
    for (const clause of ofKind('clause')) {
      if (below.has(clause)) continue
      for (const key of ['subject', 'complement']) {
        if (key === 'subject' && (clause.subject || !clause.held.some(word => word.key === 'verb'))) continue
        const choice = ranked(clause, key).find(candidate => candidate.wire === wire)
        if (choice && (!best || choice.p > best.p)) best = {clause, key, p: choice.p}
      }
    }
    const home = best?.clause ?? clauseAt(start(wire), below) ?? fragment(start(wire))
    if (best?.key === 'subject') home.subject = wire
    else home.complements.push(wire)
  }
  if (!ofKind('clause').length) fragment(0)

  // ---- 5. a word with no place left: inside a nominal it is a dependent, elsewhere a word of its clause
  for (const word of homeless) {
    const around = ofKind('nominal').find(nominal => first(nominal) < word && word < last(nominal))
    if (around) around.held.push({key: 'dependent', word})
    else clauseAt(word).held.push({key: 'discourse', word})
  }

  // ---- 6. the form of a clause; a fragment that shares a verb; an attachment left unsettled
  const verbal = wire => wire.held.some(word => word.key === 'verb')
  for (const wire of ofKind('clause')) {
    const scores = Object.entries(wire.node?.atoms?.form ?? {}).sort((a, b) => b[1] - a[1])
    if (!verbal(wire)) wire.form = 'fragment'
    else wire.form = scores.find(([form]) => form !== 'fragment')?.[0] ?? (wire.subject ? 'declarative' : 'imperative')
  }
  for (const wire of ofKind('clause')) {
    if (verbal(wire)) continue
    const shared = ranked(wire, 'ellipsis').find(choice => verbal(choice.wire))
    if (shared && shared.p >= tie) wire.ellipsis = shared.wire
  }
  for (const wire of ofKind('relation')) {
    // the mark says that the relation belongs to the clause it starts at
    wire.ambiguous = (wire.node?.atoms?.attachment?.ambiguous ?? 0) >= tie && wire.ends.from.kind === 'clause'
  }
  // a clause that holds nothing and that no wire refers to is no clause
  for (const wire of ofKind('clause')) {
    if (wire.held.length || holds(wire).length || ofKind('clause').length < 2) continue
    const used = [...standing].some(by => by.ellipsis === wire || by.conjuncts.includes(wire) || by.ends?.from === wire || by.ends?.to === wire)
    if (!used) standing.delete(wire)
  }

  // ---- 7. names in the order of the message
  const order = [...standing].sort((a, b) => start(a) - start(b) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
  const counts = {}
  for (const wire of order) wire.id = LETTER[wire.kind] + (counts[wire.kind] = (counts[wire.kind] ?? 0) + 1)
  const byStart = list => [...list].sort((a, b) => start(a) - start(b))
  const values = wire => {
    const slots = []
    for (const {key, word} of [...wire.held].sort((a, b) => a.word - b.word)) {
      const before = slots.findLast(slot => slot.key === key)
      if ((JOINED.has(key) || single(wire.kind, key)) && before?.span[1] === word - 1) before.span[1] = word
      else slots.push({key, span: [word, word]})
    }
    return slots
  }
  return order.map(wire => ({id: wire.id, type: 'syntax.' + wire.kind, slots: [
    ...(wire.kind === 'clause' ? [{key: 'form', value: wire.form}] : []),
    ...(wire.ambiguous ? [{key: 'attachment', value: 'ambiguous'}] : []),
    ...values(wire),
    ...(wire.subject ? [{key: 'subject', ref: wire.subject.id}] : []),
    ...byStart(wire.complements).map(to => ({key: 'complement', ref: to.id})),
    ...(wire.ends ? [{key: 'from', ref: wire.ends.from.id}, {key: 'to', ref: wire.ends.to.id}] : []),
    ...byStart(wire.conjuncts).map(to => ({key: 'conjunct', ref: to.id})),
    ...(wire.ellipsis ? [{key: 'ellipsis', ref: wire.ellipsis.id}] : [])
  ]}))
}
