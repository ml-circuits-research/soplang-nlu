// The output stage of the DistilBERT strategy.
//
// The model reads the words of one message and predicts nodes anchored at words: clauses,
// things, ties between two nodes, and groups of nodes put side by side. Every node has slots
// that hold spans of words or point to other nodes. This module writes that analysis as one
// circuit of the `syntax` schema with the shared writer. It reads the message and the
// prediction, nothing else: no knowledge repository and no circuit of another schema.
//
// The slot names of the model are those of the annotations it was trained on. They are read
// here as labels of the model, and each is given its place in the syntax schema. Every rule
// below is about a kind of slot, a kind of wire or a position in the message. None is about a
// particular message or object. Two closed classes of English words are named, because the
// schema itself tells them apart: coordinating conjunctions and interrogative pronouns.
import {wordsOf, writeCircuit} from '../../lib/syntax.mjs'

// The tokens the model was trained on: the words of `wordsOf` and, between them, every
// punctuation mark as a token of its own. `writeSyntax` checks that the two agree.
const TOKEN = /[0-9]{4}-[0-9]{2}-[0-9]{2}(?![\p{L}\p{M}\p{N}_])|[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?![\p{L}\p{M}\p{N}_])|[+-]?(?:[0-9]+\.[0-9]+|\.[0-9]+)(?![\p{L}\p{M}\p{N}_])|[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu
const CLITIC = /(?:n[’']t|[’'](?:s|d|m|re|ve|ll))$/iu

/** The tokens given to the model: [{text, start, end}], punctuation marks included. */
export function modelTokens(text) {
  const tokens = []
  for (const match of text.matchAll(TOKEN)) {
    const surface = match[0], cut = CLITIC.exec(surface)
    if (cut?.index > 0) {
      tokens.push({text: surface.slice(0, cut.index), start: match.index, end: match.index + cut.index},
        {text: surface.slice(cut.index), start: match.index + cut.index, end: match.index + surface.length})
    } else tokens.push({text: surface, start: match.index, end: match.index + surface.length})
  }
  return tokens
}

const KIND = {'nlu.clause': 'clause', 'nlu.entity': 'nominal', 'nlu.relation': 'relation', 'nlu.coordination': 'coordination'}
const TYPE = {clause: 'syntax.clause', nominal: 'syntax.nominal', relation: 'syntax.relation', coordination: 'syntax.coordination'}
const LETTER = {clause: 'c', nominal: 'n', relation: 'r', coordination: 'k'}
// wires that begin at the same word are named in this order
const ORDER = ['clause', 'coordination', 'nominal', 'relation']
// Labels of the model on a clause that hold words, and the key each is written under.
const CLAUSE_WORDS = {predicate: 'verb', auxiliary: 'auxiliary', negation: 'negation', adverb: 'modifier', particle: 'modifier',
  degree: 'modifier', result_complement: 'modifier', unresolved: 'modifier', filler: 'discourse', expression: 'discourse'}
// Labels of the model on a clause that point to a thing.
const CLAUSE_TIES = {subject: 'subject', direct_object: 'complement', indirect_object: 'complement', predicative_entity: 'complement', topic: 'complement'}
// Labels of the model for the word that names a thing, in the order in which one is taken as the head.
const NAMING = ['head', 'name', 'pronoun', 'literal']
// These keys hold one word per value; `marker` and `conjunction` hold neighbouring words as one value.
const PER_WORD = new Set(['dependent', 'modifier', 'auxiliary', 'negation', 'discourse'])
const JOINED = new Set(['marker', 'conjunction'])
// The keys under which a wire holds a nominal: such a nominal has its place in the circuit.
const HOLDING = new Set(['subject', 'complement', 'conjunct', 'to'])
// Coordinating conjunctions: a tie that such a word marks between two clauses or two nominals is a coordination.
const COORDINATORS = new Set(['and', 'or', 'nor', 'but'])
// Interrogative pronouns: alone, such a word stands where a nominal could.
const INTERROGATIVE_PRONOUNS = new Set(['what', 'which', 'who', 'whom', 'whose'])

/** Write the circuit of a message from the prediction of the model: `syntaxWires`, then the shared writer. */
export function writeSyntax(text, tokens, prediction, options) {
  return writeCircuit(text, syntaxWires(text, tokens, prediction, options))
}

/**
 * The wires of a message, from the prediction of the model, as the shared writer takes them.
 * @param text the message
 * @param tokens the tokens given to the model (`modelTokens(text)`)
 * @param prediction {nodes, owners}: nodes [{anchor, type, attrs}] with an attribute being
 *   {key, start, end} (a span of tokens), {key, target, ranked?} (another node, with the ranked
 *   choices of the model) or {key, atom, scores?}; owners, for every token, the node slots the
 *   model ranks first for it [{node, key, inside, p}]
 * @param attachmentMargin a relation with a marker is left unsettled when the model gives its
 *   second choice of a start at least this share of the probability of its first choice
 * @returns [{id, type, slots}] with every quoted value as a span of the words of `wordsOf(text)`.
 *   Throws when the prediction cannot be read.
 */
export function syntaxWires(text, tokens, {nodes, owners = []}, {attachmentMargin = 0.5} = {}) {
  const words = wordsOf(text)
  if (!words.length) throw Error('The message has no words.')
  if (!Array.isArray(nodes) || !nodes.length) throw Error('The model found no node in the message.')
  const wordAtStart = new Map(words.map((word, index) => [word.start, index]))
  const wordOfToken = tokens.map(token => { const index = wordAtStart.get(token.start); return index !== undefined && words[index].end === token.end ? index : null })
  if (wordOfToken.filter(index => index !== null).length !== words.length) throw Error('The tokens given to the model do not hold every word of the message.')
  const tokenOfWord = []
  wordOfToken.forEach((word, token) => { if (word !== null) tokenOfWord[word] = token })
  const inRange = (value, size) => Number.isInteger(value) && value >= 0 && value < size
  // the words a span of tokens covers; null when it covers punctuation only or words already given a place
  const taken = new Array(words.length).fill(false)
  const spanOf = attr => {
    if (!inRange(attr.start, tokens.length) || !Number.isInteger(attr.end) || attr.end <= attr.start || attr.end > tokens.length) throw Error('The model returned a span outside the message.')
    let first = null, last = null
    for (let token = attr.start; token < attr.end; token++) { const word = wordOfToken[token]; if (word === null) continue; first ??= word; last = word }
    if (first === null) return null
    for (let word = first; word <= last; word++) if (taken[word]) return null
    for (let word = first; word <= last; word++) taken[word] = true
    return [first, last]
  }
  const lower = span => words.slice(span[0], span[1] + 1).map(word => word.text.toLowerCase()).join(' ')

  // ---- wires: {kind, anchor, slots: [{key, span} | {key, ref, ranked, moved}], pending}
  let wires = []
  const make = (kind, anchor = null) => { const wire = {kind, anchor, slots: [], pending: {}}; wires.push(wire); return wire }
  const values = (wire, key) => wire.slots.filter(slot => slot.span && (!key || slot.key === key))
  const ties = (wire, key) => wire.slots.filter(slot => 'ref' in slot && (!key || slot.key === key))
  const tied = (wire, key) => ties(wire, key)[0]?.ref ?? null
  const has = (wire, key) => wire.slots.some(slot => slot.key === key)
  const put = (wire, key, span) => {
    if (!span) return
    if (PER_WORD.has(key)) { for (let word = span[0]; word <= span[1]; word++) wire.slots.push({key, span: [word, word]}); return }
    if (JOINED.has(key)) {
      const before = values(wire, key).find(slot => slot.span[1] === span[0] - 1), after = values(wire, key).find(slot => slot.span[0] === span[1] + 1)
      if (before) { before.span[1] = span[1]; return }
      if (after) { after.span[0] = span[0]; return }
    }
    wire.slots.push({key, span: [...span]})
  }
  const tie = (wire, key, ref, ranked = []) => { const slot = {key, ref, ranked}; wire.slots.push(slot); return slot }
  const alive = wire => wires.includes(wire)
  const ofKind = kind => wires.filter(wire => wire.kind === kind)
  const first = wire => Math.min(...values(wire).map(slot => slot.span[0]), Infinity)
  const last = wire => Math.max(...values(wire).map(slot => slot.span[1]), -1)
  // where a wire begins in the message: at its own first word, or at the first word of what it holds
  const start = (wire, seen = new Set()) => {
    if (!wire || seen.has(wire)) return Infinity
    seen.add(wire)
    let at = first(wire)
    if (wire.kind === 'relation') return at < Infinity ? at : Math.min(start(tied(wire, 'to'), seen), wire.anchor ?? Infinity)
    for (const slot of ties(wire)) at = Math.min(at, start(slot.ref, seen))
    return at < Infinity ? at : wire.anchor ?? Infinity
  }
  const byStart = list => [...list].sort((a, b) => start(a) - start(b) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
  const inside = (group, wire) => ties(group, 'conjunct').some(slot => slot.ref === wire)
  const conjunctKinds = group => new Set(ties(group, 'conjunct').map(slot => slot.ref.kind))
  const nominalLike = wire => wire.kind === 'nominal' || (wire.kind === 'coordination' && [...conjunctKinds(wire)].every(kind => kind === 'nominal'))
  const held = wire => wires.some(other => other !== wire && other.slots.some(slot => slot.ref === wire && HOLDING.has(slot.key)))
  // the clause a wire belongs to: itself, the clause that takes it, or the clause of what leads to it
  const clauseOf = (wire, seen = new Set()) => {
    if (!wire || seen.has(wire)) return null
    seen.add(wire)
    if (wire.kind === 'clause') return wire
    const taker = wires.find(other => other.kind === 'clause' && other.slots.some(slot => slot.ref === wire && (slot.key === 'subject' || slot.key === 'complement')))
    if (taker) return taker
    for (const other of wires) {
      const leads = (other.kind === 'coordination' && inside(other, wire)) ? clauseOf(other, seen)
        : (other.kind === 'relation' && tied(other, 'to') === wire) ? clauseOf(tied(other, 'from'), seen) : null
      if (leads) return leads
    }
    return wire.kind === 'relation' ? clauseOf(tied(wire, 'from'), seen) : null
  }
  // everything a wire leads to: through its relations, its conjuncts, its subject and complements
  const reach = wire => {
    const found = new Set([wire]), queue = [wire]
    while (queue.length) {
      const at = queue.shift()
      const next = [...(at.kind === 'relation' ? [] : ties(at).map(slot => slot.ref)),
        ...ofKind('relation').filter(relation => tied(relation, 'from') === at).map(relation => tied(relation, 'to'))]
      for (const other of next) if (other && !found.has(other)) { found.add(other); queue.push(other) }
    }
    return found
  }
  // the clause in which a word stands: the last clause that begins at or before it, else the first clause
  const clauseAt = (word, except = new Set()) => {
    const clauses = byStart(ofKind('clause').filter(clause => !except.has(clause)))
    return clauses.filter(clause => start(clause) <= word).at(-1) ?? clauses[0] ?? null
  }
  const fragment = anchor => { const clause = make('clause', anchor); clause.form = 'fragment'; clause.scores = {}; return clause }
  const remove = wire => {
    wires = wires.filter(other => other !== wire)
    for (const other of wires) {
      // a relation keeps the place of a lost end, so that the next choice of the model can fill it
      other.slots = other.slots.filter(slot => slot.ref !== wire || (other.kind === 'relation' && (slot.key === 'from' || slot.key === 'to')))
      for (const slot of other.slots) {
        if (slot.ref === wire) slot.ref = null
        if (slot.ranked) slot.ranked = slot.ranked.filter(choice => choice.wire !== wire)
      }
      if (other.ellipsis === wire) other.ellipsis = null
    }
  }
  const certainty = slot => slot.ranked?.[0]?.wire === slot.ref ? slot.ranked[0].p : 0
  const nextChoice = (slot, allowed) => (slot.ranked ?? []).find(choice => alive(choice.wire) && choice.wire !== slot.ref && allowed(choice.wire))?.wire ?? null

  // ---- 1. one wire for every node, with the words and the references the model gives it
  const byNode = nodes.map(node => {
    if (!KIND[node.type] || !inRange(node.anchor, tokens.length) || !Array.isArray(node.attrs)) throw Error('The model returned a node that cannot be read.')
    return make(KIND[node.type], wordOfToken[node.anchor])
  })
  const rankedOf = attr => (attr.ranked ?? [{target: attr.target, p: 1}]).filter(choice => inRange(choice.target, nodes.length)).map(({target, p}) => ({wire: byNode[target], p}))
  const completes = []
  nodes.forEach((node, index) => {
    const wire = byNode[index]
    const pointers = node.attrs.filter(attr => attr.target !== undefined), spans = node.attrs.filter(attr => attr.start !== undefined)
    if (pointers.some(attr => !inRange(attr.target, nodes.length))) throw Error('The model returned a reference to a node that does not exist.')
    const target = attr => byNode[attr.target]
    if (wire.kind === 'clause') {
      const form = node.attrs.find(attr => attr.key === 'form')
      wire.form = form?.atom ?? 'fragment'
      wire.scores = form?.scores ?? {}
      for (const attr of spans) {
        // a separator or a terminator is punctuation; a word under such a label is placed with the words left over
        if (attr.key === 'separator' || attr.key === 'terminator') continue
        const span = spanOf(attr)
        if (!span) continue
        if (attr.key === 'predicate' && has(wire, 'verb')) put(wire, 'modifier', span)
        else if (CLAUSE_WORDS[attr.key]) put(wire, CLAUSE_WORDS[attr.key], span)
        else (wire.pending[attr.key] ??= []).push(span)          // marker, question, connective: placed below
      }
      for (const attr of pointers) {
        if (CLAUSE_TIES[attr.key]) tie(wire, CLAUSE_TIES[attr.key], target(attr), rankedOf(attr))
        else if (attr.key === 'clausal_complement') completes.push([wire, target(attr)])
      }
    } else if (wire.kind === 'nominal') {
      const read = spans.map(attr => [attr, spanOf(attr)]).filter(([, span]) => span)
      const naming = NAMING.map(key => read.find(([attr]) => attr.key === key)).find(Boolean)?.[0]
      const owner = pointers.find(attr => attr.key === 'possessor'), mark = read.find(([attr]) => attr.key === 'possessive_marker')
      wire.determined = read.some(([attr]) => attr.key === 'determiner')
      for (const [attr, span] of read) {
        if (attr === naming) put(wire, 'head', span)
        else if (mark && attr === mark[0] && owner) continue
        else put(wire, 'dependent', span)
      }
      // a group with no naming word: its last word stands as the head
      if (!naming) { const end = values(wire).sort((a, b) => a.span[0] - b.span[0]).at(-1); if (end) end.key = 'head' }
      // a possessor is written where the words show it, by the possessive marker; without the
      // marker the model only says what a possessive word refers to, which is left to the next layer
      if (owner && mark) {
        const relation = make('relation', mark[1][0])
        tie(relation, 'from', wire); tie(relation, 'to', target(owner), rankedOf(owner)); put(relation, 'marker', mark[1])
      }
      // a measure that stands with the thing ("two metres wide"): the two nominals stand together
      for (const attr of pointers) if (attr.key === 'measure') { const relation = make('relation', wire.anchor); tie(relation, 'from', wire); tie(relation, 'to', target(attr), rankedOf(attr)) }
    } else if (wire.kind === 'relation') {
      for (const attr of pointers) {
        if (attr.key === 'from' || attr.key === 'to') { if (!has(wire, attr.key)) tie(wire, attr.key, target(attr), rankedOf(attr)) }
        else if (attr.key === 'measure') wire.pending.measure = target(attr)
      }
      for (const key of ['from', 'to']) if (!has(wire, key)) tie(wire, key, null)
      for (const attr of spans) {
        const span = spanOf(attr)
        if (!span) continue
        if (attr.key === 'cue') put(wire, 'marker', span)
        else if (attr.key === 'negation') put(wire, 'negation', span)
        else (wire.pending.adverb ??= []).push(span)
      }
    } else {
      for (const attr of pointers) if (attr.key === 'member') tie(wire, 'conjunct', target(attr), rankedOf(attr))
      for (const attr of spans) if (attr.key === 'cue') put(wire, 'conjunction', spanOf(attr))
    }
  })

  // ---- 2. what cannot stand: a nominal without words, a relation with a lost end or with one wire at both ends
  for (const wire of ofKind('nominal')) if (!values(wire).length) remove(wire)
  // The words of a nominal stand together. Where the model gives a nominal a far occurrence of a
  // word while the same word stands right beside the nominal, the nominal takes the near one;
  // a nominal that held the near one away from its own words takes the far one in exchange.
  const blockOf = nominal => {
    const own = new Set(), head = values(nominal, 'head')[0]
    for (const slot of values(nominal)) for (let word = slot.span[0]; word <= slot.span[1]; word++) own.add(word)
    let from = head.span[0], to = head.span[1]
    while (own.has(from - 1)) from--
    while (own.has(to + 1)) to++
    return [from, to]
  }
  const holderAt = word => { for (const wire of wires) for (const slot of values(wire)) if (slot.span[0] <= word && word <= slot.span[1]) return {wire, slot}; return null }
  for (let rounds = 0, changed = true; changed && rounds < 4 * words.length; rounds++) {
    changed = false
    for (const nominal of ofKind('nominal')) {
      if (!has(nominal, 'head')) continue
      const [from, to] = blockOf(nominal)
      for (const slot of values(nominal, 'dependent')) {
        const at = slot.span[0]
        if (at >= from && at <= to) continue
        const near = [from - 1, to + 1].find(word => word >= 0 && word < words.length && words[word].text === words[at].text)
        if (near === undefined) continue
        const other = holderAt(near)
        if (other) {
          if (other.wire.kind !== 'nominal' || other.slot.key !== 'dependent' || !has(other.wire, 'head')) continue
          const [a, b] = blockOf(other.wire)
          if (near >= a && near <= b) continue                // it stands with its own nominal
          other.slot.span = [at, at]
        } else if (taken[near]) continue                      // a word still waiting for its place holds it
        else taken[at] = false
        slot.span = [near, near]
        taken[near] = true
        changed = true
        break
      }
      if (changed) break
    }
  }
  const settleRelations = () => {
    for (const relation of ofKind('relation')) {
      const from = ties(relation, 'from')[0], to = ties(relation, 'to')[0]
      const endKinds = wire => wire.kind !== 'relation' && wire !== relation
      const refill = (slot, other) => { const choice = nextChoice(slot, wire => endKinds(wire) && wire !== other.ref); if (choice) { slot.ref = choice; slot.moved = true } return Boolean(choice) }
      if (!from.ref && !refill(from, to)) { remove(relation); continue }
      if (!to.ref && !refill(to, from)) { remove(relation); continue }
      if (from.ref !== to.ref) continue
      // one wire at both ends: the less certain end takes the next choice of the model
      const [weak, strong] = certainty(from) <= certainty(to) ? [from, to] : [to, from]
      if (!refill(weak, strong) && !refill(strong, weak)) remove(relation)
    }
  }
  settleRelations()
  // a clause takes a nominal once: as its subject or as one complement
  for (const clause of ofKind('clause')) {
    const seen = new Map()
    for (const slot of [...ties(clause)]) {
      const earlier = seen.get(slot.ref)
      if (!earlier) { seen.set(slot.ref, slot); continue }
      const weak = certainty(slot) <= certainty(earlier) ? slot : earlier
      const choice = nextChoice(weak, wire => nominalLike(wire) && !seen.has(wire))
      if (weak === earlier) seen.set(slot.ref, slot)
      if (choice) { weak.ref = choice; seen.set(choice, weak) } else clause.slots = clause.slots.filter(other => other !== weak)
    }
  }
  // two clauses without a verb that hold the same nominals are one clause
  const verbless = new Map()
  for (const clause of ofKind('clause')) {
    if (has(clause, 'verb') || !ties(clause).length) continue
    const key = ties(clause).map(slot => slot.key + wires.indexOf(slot.ref)).sort().join()
    const twin = verbless.get(key)
    if (!twin) { verbless.set(key, clause); continue }
    twin.slots.push(...values(clause))
    for (const [label, spans] of Object.entries(clause.pending)) twin.pending[label] = [...(twin.pending[label] ?? []), ...spans]
    for (const other of wires) for (const slot of other.slots) if (slot.ref === clause) slot.ref = twin
    for (const pair of completes) for (const index of [0, 1]) if (pair[index] === clause) pair[index] = twin
    remove(clause)
  }
  // two relations between the same two wires: the one without a marker says nothing more
  const dropRepeatedRelations = () => {
    const groups = new Map()
    for (const relation of ofKind('relation')) {
      const key = wires.indexOf(tied(relation, 'from')) + '>' + wires.indexOf(tied(relation, 'to'))
      groups.set(key, [...(groups.get(key) ?? []), relation])
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const marked = group.filter(relation => values(relation, 'marker').length)
      const keep = marked.length ? marked : [group[0]]
      for (const relation of group) if (!keep.includes(relation)) { keep[0].pending.adverb = [...(keep[0].pending.adverb ?? []), ...(relation.pending.adverb ?? [])]; remove(relation) }
    }
  }
  dropRepeatedRelations()

  // ---- 3. Rule 4: a measure before a marker is a nominal, and the relation starts at it
  for (const relation of ofKind('relation')) {
    const measure = relation.pending.measure, from = ties(relation, 'from')[0]
    if (!measure || !alive(measure) || !nominalLike(measure) || measure === from.ref || measure === tied(relation, 'to')) continue
    const origin = from.ref
    from.ref = measure; from.moved = true
    for (const other of ofKind('relation')) if (other !== relation && tied(other, 'from') === origin && tied(other, 'to') === measure && !values(other).length) remove(other)
    if (held(measure)) continue
    if (origin.kind === 'clause') tie(origin, 'complement', measure)
    else { const beside = make('relation', start(measure)); tie(beside, 'from', origin); tie(beside, 'to', measure) }
  }
  // a nominal tied to a clause by no word is one of the nominals the clause takes
  for (const relation of ofKind('relation')) {
    const from = tied(relation, 'from'), to = tied(relation, 'to')
    if (values(relation).length || from.kind !== 'clause' || !nominalLike(to)) continue
    if (!ties(from).some(slot => slot.ref === to)) tie(from, 'complement', to)
    for (const span of relation.pending.adverb ?? []) put(from, 'modifier', span)
    remove(relation)
  }

  // ---- 4. coordinations: one for one group, conjuncts of one type, at least two of them
  // a slot holds what the schema lets it hold: a relation ends at no relation, a clause takes nominals
  const fits = (slot, wire) => slot.key === 'from' || slot.key === 'to' ? wire.kind !== 'relation'
    : slot.key === 'subject' || slot.key === 'complement' ? nominalLike(wire) : wire.kind !== 'coordination'
  const dissolve = group => {
    // what held the group holds its one conjunct, where that can stand
    const only = tied(group, 'conjunct')
    for (const other of wires) for (const slot of other.slots) if (slot.ref === group && only && other !== only && fits(slot, only)) { slot.ref = only; slot.moved = true }
    remove(group)
  }
  const mergeGroups = () => { for (let merged = true; merged;) {
    merged = false
    for (const small of ofKind('coordination')) {
      // A conjunct stands in one coordination (the schema has no coordination inside another):
      // two coordinations of one type that share a conjunct are one group.
      const same = other => [...conjunctKinds(other)].sort().join() === [...conjunctKinds(small)].sort().join()
      const large = ofKind('coordination').find(other => other !== small && same(other) && ties(small, 'conjunct').some(slot => inside(other, slot.ref)))
      if (!large) continue
      for (const slot of ties(small, 'conjunct')) if (!inside(large, slot.ref)) tie(large, 'conjunct', slot.ref, slot.ranked)
      for (const slot of values(small, 'conjunction')) put(large, 'conjunction', slot.span)
      for (const other of wires) for (const slot of other.slots) if (slot.ref === small && other !== large) slot.ref = large
      remove(small)
      merged = true
      break
    }
  } }
  const tidyGroup = group => {
    if (!alive(group)) return
    const unique = () => { const seen = new Set(); group.slots = group.slots.filter(slot => slot.key !== 'conjunct' || (slot.ref && slot.ref !== group && !seen.has(slot.ref) && seen.add(slot.ref))) }
    unique()
    // a wire tied by a relation to another conjunct depends on it: where two conjuncts remain
    // without it, it is no conjunct beside them
    const depends = wire => ofKind('relation').some(relation => tied(relation, 'to') === wire && tied(relation, 'from') !== wire &&
      ties(group, 'conjunct').some(slot => slot.ref !== wire && (slot.ref === tied(relation, 'from') || (slot.ref.kind === 'clause' && clauseOf(tied(relation, 'from')) === slot.ref))))
    const dependent = ties(group, 'conjunct').filter(slot => depends(slot.ref))
    if (ties(group, 'conjunct').length - dependent.length >= 2) group.slots = group.slots.filter(slot => !dependent.includes(slot))
    const kinds = conjunctKinds(group)
    const argument = ofKind('clause').some(clause => ties(clause).some(slot => slot.ref === group))
    if (kinds.size > 1 && kinds.has('nominal') && argument) {
      // a coordination that a clause takes as its subject or complement joins nominals
      group.slots = group.slots.filter(slot => slot.key !== 'conjunct' || slot.ref.kind === 'nominal')
    } else if (kinds.has('clause') && kinds.size > 1) {
      for (const slot of ties(group, 'conjunct').sort((a, b) => start(a.ref) - start(b.ref))) {
        if (slot.ref.kind === 'nominal') {
          const nominal = slot.ref, home = clauseOf(nominal)
          // a nominal that belongs to one of the coordinated clauses is no conjunct of its own
          if (home && inside(group, home)) { slot.ref = null; continue }
          // a nominal put beside a clause stands as a clause without a verb
          const holder = home && !has(home, 'verb') ? home : fragment(start(nominal))
          if (!ties(holder).some(other => other.ref === nominal)) tie(holder, 'complement', nominal)
          slot.ref = holder
        } else if (slot.ref.kind === 'relation') slot.ref = clauseOf(slot.ref)      // a relation put beside a clause stands for the clause it starts at
      }
    } else if (kinds.size > 1) {
      // other mixtures: the conjuncts of the most frequent type stay
      const count = kind => ties(group, 'conjunct').filter(slot => slot.ref.kind === kind).length
      const kept = [...kinds].sort((a, b) => count(b) - count(a))[0]
      group.slots = group.slots.filter(slot => slot.key !== 'conjunct' || slot.ref.kind === kept)
    }
    unique()
    if (ties(group, 'conjunct').length < 2) dissolve(group)
  }
  const tidyGroups = () => {
    // twice: giving the conjuncts one type can show that two coordinations are one group
    for (let pass = 0; pass < 2; pass++) { mergeGroups(); for (const group of ofKind('coordination')) tidyGroup(group) }
    settleRelations()
    dropRepeatedRelations()
  }
  tidyGroups()

  // ---- 5. clauses tied to clauses
  // a clause that completes another: a relation between the two
  for (const [governor, clause] of completes) {
    if (!alive(governor) || !alive(clause) || governor === clause) continue
    if (ofKind('relation').some(relation => tied(relation, 'from') === governor && tied(relation, 'to') === clause)) continue
    const relation = make('relation', start(clause))
    tie(relation, 'from', governor); tie(relation, 'to', clause)
  }
  // a marker introduces its clause ("to", "as", "that"): it marks the relation that ends at that clause
  for (const clause of ofKind('clause')) for (const span of clause.pending.marker ?? []) {
    const unmarked = relation => !values(relation, 'marker').length
    let relation = ofKind('relation').find(other => tied(other, 'to') === clause && unmarked(other))
    if (!relation) {
      // "to fix and to test": the relation ends at the coordination this clause opens
      const group = ofKind('coordination').find(other => inside(other, clause) && byStart(ties(other, 'conjunct').map(slot => slot.ref))[0] === clause)
      if (group) relation = ofKind('relation').find(other => tied(other, 'to') === group && unmarked(other))
    }
    if (!relation) {
      // Rule 5.4: the relation starts at the clause before the marker; when nothing stands before it, at the main clause
      const below = reach(clause)
      const others = byStart(ofKind('clause').filter(other => !below.has(other)))
      const before = other => (first(other) < Infinity ? first(other) : start(other)) < span[0]
      const origin = others.filter(before).at(-1) ?? others.find(other => has(other, 'verb')) ?? others[0]
      if (origin) { relation = make('relation', span[0]); tie(relation, 'from', origin); tie(relation, 'to', clause) }
    }
    if (relation) put(relation, 'marker', span)
    else put(clause, 'discourse', span)              // a marked clause that stands alone: the schema has no place for its marker
  }
  // a connective joins its clause to what stands before it: the conjunction of a coordination
  const join = (a, b, span) => {
    let group = ofKind('coordination').find(other => inside(other, a) && inside(other, b)) ??
      ofKind('coordination').find(other => inside(other, a) && [...conjunctKinds(other)].every(kind => kind === b.kind))
    if (group && !inside(group, b)) tie(group, 'conjunct', b)
    if (!group) {
      group = make('coordination', span?.[0] ?? start(b))
      // what held the first nominal now holds the two together
      if (a.kind === 'nominal') for (const other of wires) for (const slot of other.slots) if (slot.ref === a && HOLDING.has(slot.key)) slot.ref = group
      tie(group, 'conjunct', a); tie(group, 'conjunct', b)
    }
    put(group, 'conjunction', span)
  }
  for (const clause of ofKind('clause')) for (const span of clause.pending.connective ?? []) {
    const group = ofKind('coordination').find(other => inside(other, clause) && conjunctKinds(other).size === 1)
    if (group) { put(group, 'conjunction', span); continue }
    // the two clauses were tied with no word: the connective is that word
    const loose = ofKind('relation').find(other => tied(other, 'to') === clause && tied(other, 'from').kind === 'clause' && !values(other).length)
    const below = reach(clause)
    const before = byStart(ofKind('clause').filter(other => !below.has(other) && start(other) < span[0]))
    const previous = loose ? tied(loose, 'from') : before.filter(other => !ofKind('relation').some(relation => tied(relation, 'to') === other)).at(-1) ?? before.at(-1)
    if (loose) remove(loose)
    if (previous) join(previous, clause, span)
    else put(clause, 'discourse', span)              // nothing stands before it in this message
  }
  // a relation that a coordinating conjunction marks between two clauses or two nominals is a coordination
  for (const relation of ofKind('relation')) {
    const [marker, ...more] = values(relation, 'marker'), from = tied(relation, 'from'), to = tied(relation, 'to')
    if (!marker || more.length || values(relation, 'negation').length || !COORDINATORS.has(lower(marker.span))) continue
    if (from.kind !== to.kind || (from.kind !== 'clause' && from.kind !== 'nominal')) continue
    const adverbs = relation.pending.adverb ?? [], home = clauseOf(from)
    remove(relation)
    join(from, to, marker.span)
    for (const span of adverbs) put(home ?? clauseAt(span[0]) ?? fragment(span[0]), 'modifier', span)
  }

  // ---- 6. a question word stands where its grammar puts it
  for (const clause of ofKind('clause')) for (const span of clause.pending.question ?? []) {
    // before a nominal that has no determiner of its own, it is a dependent of that nominal: "what colour", "how many rows"
    const next = ofKind('nominal').find(nominal => first(nominal) === span[1] + 1 && !nominal.determined)
    if (next) { put(next, 'dependent', span); continue }
    if (span[0] === span[1] && INTERROGATIVE_PRONOUNS.has(lower(span))) {
      const nominal = make('nominal', span[0])
      put(nominal, 'head', span)
      tie(clause, has(clause, 'verb') && !has(clause, 'subject') ? 'subject' : 'complement', nominal)
    } else put(clause, 'modifier', span)
  }

  tidyGroups()

  // ---- 7. every nominal has its place
  const beside = (a, b) => !/\S/u.test(text.slice(words[a].end, words[b].start))
  for (const wire of byStart(wires.filter(wire => nominalLike(wire)))) {
    if (!alive(wire) || held(wire)) continue
    const at = start(wire)
    // a bare name or number right after a nominal stands with that nominal: "page 3", "x 120"
    if (wire.kind === 'nominal' && !has(wire, 'dependent')) {
      const before = ofKind('nominal').find(other => other !== wire && last(other) === at - 1 && beside(at - 1, at) && !reach(wire).has(other))
      if (before) { const relation = make('relation', at); tie(relation, 'from', before); tie(relation, 'to', wire); continue }
    }
    // a noun right before a bare name or number is the head of the pair ("chapter Two"): what
    // held the name holds the noun, and the name stands with it
    if (wire.kind === 'nominal') {
      const end = last(wire)
      const after = ofKind('nominal').find(other => other !== wire && first(other) === end + 1 && beside(end, end + 1) && !has(other, 'dependent') && held(other) && !reach(other).has(wire))
      if (after) {
        for (const other of wires) for (const slot of other.slots) if (slot.ref === after && HOLDING.has(slot.key)) { slot.ref = wire; slot.moved = true }
        const relation = make('relation', end + 1); tie(relation, 'from', wire); tie(relation, 'to', after)
        continue
      }
    }
    // otherwise it belongs to the clause in which it stands
    tie(clauseAt(at, reach(wire)) ?? fragment(at), 'complement', wire)
  }
  if (!ofKind('clause').length) fragment(0)
  settleRelations()
  dropRepeatedRelations()

  // ---- 8. a word that grades a relation ("right below") is a modifier of the relation's clause
  for (const relation of ofKind('relation')) for (const span of relation.pending.adverb ?? []) put(clauseOf(relation) ?? clauseAt(span[0]), 'modifier', span)

  // ---- 9. the words left over. The model ranks, for every word, the node slots it may belong to;
  // a word takes the first of these that can hold it, else a place by its position.
  const placeOwned = (wire, label, word, within) => {
    const one = [word, word]
    const grow = slot => { if (slot.span[1] === word - 1) slot.span[1] = word; else if (slot.span[0] === word + 1) slot.span[0] = word; else return false; return true }
    const marked = relation => { const markers = values(relation, 'marker'); if (markers.length) return markers.some(grow); put(relation, 'marker', one); return true }
    if (wire.kind === 'clause') {
      const key = CLAUSE_WORDS[label] ?? (label === 'question' ? 'modifier' : null)
      if (key === 'verb') { const verb = values(wire, 'verb')[0]; if (verb) return grow(verb); put(wire, 'verb', one); return true }
      if (key) { put(wire, key, one); return true }
      if (label === 'marker') { const relation = ofKind('relation').find(other => tied(other, 'to') === wire); return relation ? marked(relation) : false }
      if (label === 'connective') { const group = ofKind('coordination').find(other => inside(other, wire)); if (group) put(group, 'conjunction', one); return Boolean(group) }
      return false
    }
    if (wire.kind === 'nominal') {
      // the words of a nominal stand together: the word joins the nominal it touches, if there
      // is one, rather than a far nominal the model names
      const touches = nominal => { const [a, b] = blockOf(nominal); return (word === a - 1 && beside(word, a)) || (word === b + 1 && beside(b, word)) || (word > a && word < b) }
      const nominal = touches(wire) ? wire : ofKind('nominal').find(touches) ?? wire
      const head = values(nominal, 'head')[0]
      if (!(nominal === wire && NAMING.includes(label) && within && grow(head))) put(nominal, 'dependent', one)
      return true
    }
    if (wire.kind === 'relation') {
      if (label === 'cue') return marked(wire)
      if (label === 'negation') { put(wire, 'negation', one); return true }
      const clause = label === 'adverb' ? clauseOf(wire) : null
      if (clause) put(clause, 'modifier', one)
      return Boolean(clause)
    }
    if (label === 'cue') put(wire, 'conjunction', one)
    return label === 'cue'
  }
  const covered = new Array(words.length).fill(false)
  for (const wire of wires) for (const slot of values(wire)) for (let word = slot.span[0]; word <= slot.span[1]; word++) covered[word] = true
  for (let word = 0; word < words.length; word++) {
    if (covered[word]) continue
    const ranked = (owners[tokenOfWord[word]] ?? []).filter(owner => inRange(owner.node, nodes.length) && alive(byNode[owner.node]))
    if (ranked.some(owner => placeOwned(byNode[owner.node], owner.key, word, owner.inside === true))) continue
    // no slot of the model can hold it: inside a nominal it is a dependent, elsewhere a word of its clause
    const around = ofKind('nominal').find(nominal => first(nominal) < word && word < last(nominal))
    if (around) put(around, 'dependent', [word, word])
    else put(clauseAt(word), 'discourse', [word, word])
  }

  // ---- 10. the form of a clause and its verb agree; Rule 3: a fragment that shares a verb names its clause
  for (const clause of ofKind('clause')) {
    if (!has(clause, 'verb')) { clause.form = 'fragment'; continue }
    if (clause.form !== 'fragment') continue
    const finite = Object.entries(clause.scores).filter(([form]) => form !== 'fragment').sort((a, b) => b[1] - a[1])[0]
    clause.form = finite?.[0] ?? (has(clause, 'subject') ? 'declarative' : 'imperative')
  }
  for (const group of ofKind('coordination')) {
    if ([...conjunctKinds(group)].some(kind => kind !== 'clause')) continue
    let verbal = null
    for (const clause of byStart(ties(group, 'conjunct').map(slot => slot.ref))) {
      if (has(clause, 'verb')) { verbal = clause; continue }
      // a conjunct with no verb that still holds a part of a clause (a nominal, a modifier, a relation) borrows the verb before it
      const part = clause.slots.some(slot => ['subject', 'complement', 'modifier', 'negation'].includes(slot.key)) || ofKind('relation').some(relation => tied(relation, 'from') === clause)
      if (verbal && part) clause.ellipsis = verbal
    }
  }
  // a clause that kept nothing and that no wire refers to is no clause
  for (const clause of ofKind('clause')) {
    if (clause.slots.length || ofKind('clause').length < 2) continue
    if (!wires.some(other => other.ellipsis === clause || other.slots.some(slot => slot.ref === clause))) remove(clause)
  }

  // ---- 11. Rule 2: where the model hesitates between two starts within one clause, the attachment is left unsettled
  for (const relation of ofKind('relation')) {
    const from = ties(relation, 'from')[0]
    if (!values(relation, 'marker').length || from.moved) continue
    const ranked = (from.ranked ?? []).filter(choice => alive(choice.wire))
    if (ranked[0]?.wire !== from.ref) continue
    const rival = ranked.slice(1).find(choice => choice.wire !== tied(relation, 'to') && choice.wire.kind !== 'relation')
    if (!rival || rival.p < attachmentMargin * ranked[0].p) continue
    const home = clauseOf(from.ref)
    if (!home || clauseOf(rival.wire) !== home) continue           // a doubt between two clauses is not what the mark says
    if (!has(home, 'verb')) continue                               // the mark is about a verb and its nominals
    if (rival.wire !== home && start(rival.wire) > first(relation)) continue
    from.ref = home
    relation.attachment = true
  }

  // ---- 12. names in the order of the message
  const order = byStart(wires), counts = {}
  for (const wire of order) wire.id = LETTER[wire.kind] + (counts[wire.kind] = (counts[wire.kind] ?? 0) + 1)
  const references = wire => {
    const slots = ties(wire).filter(slot => slot.ref)
    const sorted = key => byStart(slots.filter(slot => slot.key === key).map(slot => slot.ref)).map(ref => ({key, ref: ref.id}))
    return ['subject', 'complement', 'from', 'to', 'conjunct'].flatMap(sorted)
  }
  return order.map(wire => ({id: wire.id, type: TYPE[wire.kind], slots: [
    ...(wire.kind === 'clause' ? [{key: 'form', value: wire.form}] : []),
    ...(wire.attachment ? [{key: 'attachment', value: 'ambiguous'}] : []),
    ...values(wire).map(({key, span}) => ({key, span})),
    ...references(wire),
    ...(wire.ellipsis ? [{key: 'ellipsis', ref: wire.ellipsis.id}] : [])
  ]}))
}
