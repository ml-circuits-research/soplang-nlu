// What the DistilBERT model of the `syntax` schema reads and what it is trained to predict.
//
// The model reads the tokens of a message: its words and, between them, every punctuation
// mark as a token of its own. For a circuit it predicts
//   - nodes: one for every wire, standing at a word (a clause at its verb, a nominal at its
//     head, a relation at its marker, a coordination at its conjunction; a wire with no such
//     word stands at the word of what it ties);
//   - owners: for every word, the node and the key that hold it;
//   - edges: the references between nodes (subject, complement, ellipsis, from, to, conjunct);
//   - atoms: the form of a clause, and attachment=ambiguous on a relation.
// The keys, the types that a reference may point to and the values of the atoms are read from
// the schema of this package. Nothing here names a word of a message.
import {parseCircuit, validateSyntax, wordsOf, schema} from '../../lib/syntax.mjs'

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

/** For the tokens of a message: the word of `wordsOf(text)` each token is (null for a punctuation mark), and back. */
export function alignWords(text, tokens) {
  const words = wordsOf(text)
  const at = new Map(words.map((word, index) => [word.start, index]))
  const wordOfToken = tokens.map(token => { const index = at.get(token.start); return index !== undefined && words[index].end === token.end ? index : null })
  if (wordOfToken.filter(index => index !== null).length !== words.length) throw Error('The tokens given to the model do not hold every word of the message.')
  const tokenOfWord = []
  wordOfToken.forEach((word, token) => { if (word !== null) tokenOfWord[word] = token })
  return {words, wordOfToken, tokenOfWord}
}

/**
 * The schema as the model needs it: for every wire type the keys that hold words, the keys that
 * refer to wires (with the types they may point to) and the keys with a value from a list.
 * {clause: {words: [key], edges: {key: {targets, many, required}}, atoms: {key: {options, required}}}, …}
 */
export function modelSchema() {
  const types = {}
  for (const [type, keys] of Object.entries(schema)) {
    const entry = types[type.slice(7)] = {words: [], edges: {}, atoms: {}}
    for (const [key, slot] of Object.entries(keys)) {
      if (slot.kind === 'string') entry.words.push(key)
      else if (slot.kind === 'ref') entry.edges[key] = {targets: slot.targets.map(target => target.slice(7)), many: slot.many, required: slot.required}
      else entry.atoms[key] = {options: slot.options, required: slot.required}
    }
  }
  return types
}

/**
 * One circuit as training targets.
 * @returns {text, tokens, nodes: [{type, anchor, atoms: {key: value}}], owners: [null | [node, key]],
 *   edges: [[node, key, node]]}. Nodes are in the order of their anchors. Throws for a circuit
 *   that is not valid for the message, or that has a wire with no word to stand at.
 */
export function encodeCircuit(text, sop) {
  const check = validateSyntax(text, sop)
  if (!check.valid) throw Error('The circuit is not valid for the message: ' + [...new Set(check.findings.map(finding => finding.code))].join(', '))
  const tokens = modelTokens(text), {tokenOfWord} = alignWords(text, tokens)
  const wires = parseCircuit(sop), index = new Map(wires.map((wire, at) => [wire.id, at]))
  const drafts = wires.map(wire => ({type: wire.type.slice(7), atoms: {}, held: [], ties: []}))
  let place = 0
  wires.forEach((wire, at) => {
    for (const [key, raw] of wire.slots) {
      const kind = schema[wire.type][key].kind
      if (kind === 'ref') drafts[at].ties.push([key, index.get(raw.slice(1))])
      else if (kind !== 'string') drafts[at].atoms[key] = raw
      else { const {first, last} = check.placements[place++]; for (let word = first; word <= last; word++) drafts[at].held.push([key, word]) }
    }
  })
  // Where a wire stands: at the first word of the key that names it, else at its first word.
  // A wire with no word stands where what it holds stands: a relation at its end (else at its
  // start), a clause at the first of its subject and complements, a coordination at its first
  // conjunct. The clause a fragment borrows its verb from is not something it holds.
  const naming = {clause: 'verb', nominal: 'head', relation: 'marker', coordination: 'conjunction'}
  const stand = drafts.map(draft => {
    const named = draft.held.filter(([key]) => key === naming[draft.type]).map(([, word]) => word)
    const any = draft.held.map(([, word]) => word)
    return named.length ? Math.min(...named) : any.length ? Math.min(...any) : null
  })
  for (let changed = true; changed;) {
    changed = false
    drafts.forEach((draft, at) => {
      if (stand[at] !== null) return
      const known = key => draft.ties.filter(tie => tie[0] === key && stand[tie[1]] !== null).map(tie => stand[tie[1]])
      const held = draft.type === 'relation' ? [...known('to'), ...known('from')].slice(0, 1)
        : draft.ties.filter(tie => tie[0] !== 'ellipsis' && stand[tie[1]] !== null).map(tie => stand[tie[1]])
      if (held.length) { stand[at] = Math.min(...held); changed = true }
    })
    // a wire that has no word and holds nothing stands where the first relation that starts at it stands
    if (!changed) drafts.forEach((draft, at) => {
      if (stand[at] !== null) return
      const started = drafts.map((other, index) => other.type === 'relation' && other.ties.some(tie => tie[0] === 'from' && tie[1] === at) ? stand[index] : null).filter(word => word !== null)
      if (started.length) { stand[at] = Math.min(...started); changed = true }
    })
  }
  if (stand.some(word => word === null)) throw Error('A wire of the circuit has no word to stand at.')
  // nodes in the order of their anchors; wires of one type at one word are told apart by what they tie
  const typeOrder = Object.keys(schema).map(type => type.slice(7))
  const tieKey = at => drafts[at].ties.map(([key, other]) => key + ':' + String(stand[other]).padStart(4, '0')).sort().join(' ')
  const order = drafts.map((_, at) => at).sort((a, b) => stand[a] - stand[b] || typeOrder.indexOf(drafts[a].type) - typeOrder.indexOf(drafts[b].type) || (tieKey(a) < tieKey(b) ? -1 : tieKey(a) > tieKey(b) ? 1 : a - b))
  const position = new Map(order.map((at, rank) => [at, rank]))
  const owners = tokens.map(() => null)
  const edges = []
  const nodes = order.map((at, rank) => {
    const draft = drafts[at]
    for (const [key, word] of draft.held) owners[tokenOfWord[word]] = [rank, key]
    for (const [key, other] of draft.ties) edges.push([rank, key, position.get(other)])
    return {type: draft.type, anchor: tokenOfWord[stand[at]], atoms: draft.atoms}
  })
  return {text, tokens, nodes, owners, edges}
}

/** Targets as the model would predict them when it is sure of each: used to check the writer against the encoder. */
export function certainPrediction({nodes, owners, edges}) {
  const types = modelSchema()
  return {
    nodes: nodes.map((node, at) => ({type: node.type, anchor: node.anchor, p: 1,
      atoms: Object.fromEntries(Object.entries(types[node.type].atoms).map(([key, {options}]) => [key, Object.fromEntries(options.map(option => [option, Number(node.atoms[key] === option)]))])),
      edges: Object.fromEntries(Object.keys(types[node.type].edges).map(key => [key, edges.filter(edge => edge[0] === at && edge[1] === key).map(edge => [edge[2], 1])]))})),
    owners: owners.map(owner => owner ? [[owner[0], owner[1], 1]] : [])
  }
}
