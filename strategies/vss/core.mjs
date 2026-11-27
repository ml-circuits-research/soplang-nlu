// The syntactic core of an nlu circuit: what it says once the fine distinctions between slots are
// set aside. A circuit is reduced to
//   facts   one per clause: a command, a statement, a question, a mention, or a dependent fact
//   things  one per entity: the words that characterise one thing
//   links   doer (fact -> thing), thing (fact -> thing), link (wire -> wire, with its cue words),
//           list (wires joined), part (fact -> fact)
// and every word gets one of a few places: action, helper, how, word (in a fact); head, describing
// (in a thing); cue (in a link or a list).
import {createComparer} from './compare.mjs'

const KIND = {imperative: 'command', declarative: 'statement', interrogative: 'question', fragment: 'mention', nonfinite: 'dependent'}
const PLACE = {
  'nlu.clause': {predicate: 'action', auxiliary: 'helper', negation: 'helper', particle: 'helper', adverb: 'how', result_complement: 'how', degree: 'how'},
  'nlu.entity': {head: 'head', name: 'head', pronoun: 'head', literal: 'head'},
  'nlu.relation': {}, 'nlu.coordination': {}
}
const DEFAULT = {'nlu.clause': 'word', 'nlu.entity': 'describing', 'nlu.relation': 'cue', 'nlu.coordination': 'cue'}
const THINGS = ['direct_object', 'indirect_object', 'predicative_entity', 'topic', 'participant']

export async function createCore(knowledgeDir) {
  const {parse, validate} = await createComparer(knowledgeDir)

  /**
   * @param options.heads   false: do not tell the head of a thing from its describing words
   * @param options.origin  'fact': a link starts at the fact its thing belongs to, not at the thing
   * @returns a canonical string, equal for two circuits with the same core, or null for a broken circuit
   */
  function coreOf(text, sop, options = {}) {
    let wires
    try { wires = parse(sop) } catch { return null }
    const check = validate(text, sop, {alignSource: true})
    if (!check.valid || !check.placements) return null
    const byId = new Map(wires.map(wire => [wire.id, wire]))
    const tokensOf = new Map(), places = []
    for (const {wire, key, start, end} of check.placements) {
      const type = byId.get(wire)?.type
      if (!type) continue
      const place = PLACE[type][key] ?? DEFAULT[type]
      for (let token = start; token < end; token++) {
        if (!tokensOf.has(wire)) tokensOf.set(wire, [])
        tokensOf.get(wire).push(token)
        places.push([token, type, place])
      }
    }
    const ref = value => value.slice(1)
    // a wire is known by its first word; a wire without words by what it ties
    const anchor = (id, depth = 0) => {
      const own = tokensOf.get(id)
      const wire = byId.get(id)
      if (!wire || depth > 6) return '?'
      if (wire.type === 'nlu.coordination') return '[' + (wire.attrs.member ?? []).map(member => anchor(ref(member), depth + 1)).sort().join('+') + ']'
      if (wire.type === 'nlu.relation' && !own) return '(' + anchor(ref(wire.attrs.from[0]), depth + 1) + '>' + anchor(ref(wire.attrs.to[0]), depth + 1) + ')'
      return own ? String(Math.min(...own)) : '?' + wire.type
    }
    // the fact a thing belongs to: the clause that holds it, directly or through links
    const factOf = new Map()
    const hold = (fact, id, depth = 0) => {
      const wire = byId.get(id)
      if (!wire || depth > 6 || factOf.has(id)) return
      if (wire.type === 'nlu.coordination') { for (const member of wire.attrs.member ?? []) hold(fact, ref(member), depth + 1); return }
      if (wire.type === 'nlu.entity') factOf.set(id, fact)
    }
    for (const wire of wires) if (wire.type === 'nlu.clause') for (const key of ['subject', ...THINGS]) for (const value of wire.attrs[key] ?? []) hold(wire.id, ref(value))
    for (let round = 0; round < 4; round++) for (const wire of wires) {
      if (wire.type !== 'nlu.relation') continue
      const from = ref(wire.attrs.from[0]), to = ref(wire.attrs.to[0])
      const fact = byId.get(from)?.type === 'nlu.clause' ? from : factOf.get(from)
      if (fact) hold(fact, to)
    }
    const origin = id => options.origin === 'fact' && byId.get(id)?.type === 'nlu.entity' && factOf.has(id) ? anchor(factOf.get(id)) : anchor(id)
    const lines = []
    for (const [token, type, place] of places) {
      // punctuation and the small words of a fact are accounted for; which fact claims them is not compared
      if (place === 'word') continue
      const shown = options.heads === false && type === 'nlu.entity' ? 'in' : place
      const wire = check.placements.find(p => token >= p.start && token < p.end).wire
      lines.push(`${token} ${shown} @${type === 'nlu.relation' || type === 'nlu.coordination' ? '' : anchor(wire)}`)
    }
    for (const wire of wires) {
      const {attrs} = wire
      if (wire.type === 'nlu.clause') {
        const me = anchor(wire.id)
        // a fact that holds only small words (a lone comma, "and") says nothing of its own
        if (!attrs.predicate && !attrs.expression && !THINGS.some(key => attrs[key]) && !attrs.adverb && !attrs.result_complement) continue
        lines.push(`fact ${me} ${attrs.predicate ? KIND[attrs.form[0]] : 'mention'}`)
        for (const value of attrs.subject ?? []) lines.push(`doer ${me} ${anchor(ref(value))}`)
        for (const key of THINGS) for (const value of attrs[key] ?? []) lines.push(`thing ${me} ${anchor(ref(value))}`)
        for (const value of attrs.clausal_complement ?? []) lines.push(`part ${me} ${anchor(ref(value))}`)
      } else if (wire.type === 'nlu.relation') {
        const to = byId.get(ref(attrs.to[0]))
        lines.push(`${to?.type === 'nlu.clause' && byId.get(ref(attrs.from[0]))?.type === 'nlu.clause' ? 'part' : 'link'} ${origin(ref(attrs.from[0]))} ${anchor(ref(attrs.to[0]))}`)
      } else if (wire.type === 'nlu.entity') {
        for (const value of [...attrs.possessor ?? [], ...attrs.measure ?? []]) lines.push(`link ${anchor(wire.id)} ${anchor(ref(value))}`)
      } else if (wire.type === 'nlu.coordination') lines.push(`list ${anchor(wire.id)}`)
    }
    return [...new Set(lines)].sort().join('\n')
  }
  return {coreOf}
}
