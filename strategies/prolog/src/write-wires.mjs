// The output stage shared by the Prolog strategies: wires whose quoted values are ranges
// of tokens become wires whose values are spans of words, and `writeCircuit` writes them.
// wires: [[id, type, [[key, 'quote', from, to] | [key, 'ref', id] | [key, 'atom', value]]]]
// tokens: [{word: [first, last] | null}], one per token of the grammar.
import {writeCircuit} from '../../../lib/syntax.mjs'

export function writeWires(text, tokens, wires) {
  const written = wires.map(([id, type, fields]) => ({id, type: 'syntax.' + type, slots: fields.flatMap(([key, kind, from, to]) => {
    if (kind === 'ref') return [{key, ref: from}]
    if (kind === 'atom') return [{key, value: from}]
    const inside = tokens.slice(from, to).filter(token => token.word)
    return inside.length ? [{key, span: [inside[0].word[0], inside.at(-1).word[1]]}] : []
  })}))
  return writeCircuit(text, written)
}
