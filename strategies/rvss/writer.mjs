// rvss writer: the pilot's tree of wires (or the tree read back from its stars) -> one circuit of the syntax
// schema, with writeCircuit. The same rules as replay() in hierarchy-checks/v2/oracle2.mjs: adjacent words at
// the same head / verb / marker / conjunction are joined into one value (the join rule, declared not VSA);
// a relation held at `rel` writes its `from`; a relation gathered into a coordination writes the coordination's
// holder as its `from`.
import {writeCircuit} from '../../lib/syntax.mjs'

const NOJOIN = ['dependent', 'modifier', 'auxiliary', 'negation', 'discourse']

/** nodes: {h: {type, words: [[p, key]], atoms: [[k, v]], refs: [[key, h]], parent: 'M' | h, key}} */
export function writeNodes(text, nodes) {
  const id = h => 'x' + h
  const entries = Object.entries(nodes)
  const built = entries.map(([h, nd]) => ({id: id(h), type: 'syntax.' + nd.type, slots: []}))
  const B = new Map(built.map(b => [b.id, b]))
  for (const [h, nd] of entries) {
    const slots = B.get(id(h)).slots
    for (const [i, key] of [...nd.words].sort((a, b) => a[0] - b[0])) {
      const last = slots.at(-1)
      if (last?.span && last.key === key && last.span[1] === i - 1 && !NOJOIN.includes(key)) last.span[1] = i
      else slots.push({key, span: [i, i]})
    }
    for (const [k, v] of nd.atoms) slots.push({key: k, value: v})
  }
  for (const [h, nd] of entries) {
    if (nd.parent === 'M' || nd.parent === null) continue
    const parent = nodes[String(nd.parent)]
    if (nd.type === 'relation' && nd.key === 'rel') B.get(id(h)).slots.unshift({key: 'from', ref: id(nd.parent)})
    else if (nd.type === 'relation' && nd.key === 'conjunct') {
      B.get(id(nd.parent)).slots.push({key: 'conjunct', ref: id(h)})
      B.get(id(h)).slots.unshift({key: 'from', ref: id(parent.parent)})
    } else if (nd.key === 'rel') { /* a coordination of relations held by their common from */ }
    else B.get(id(nd.parent)).slots.push({key: nd.key, ref: id(h)})
  }
  for (const [h, nd] of entries) for (const [k, t] of nd.refs) B.get(id(h)).slots.push({key: k, ref: id(t)})
  return writeCircuit(text, built)
}
