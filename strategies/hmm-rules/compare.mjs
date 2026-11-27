// Compare two circuits of the same message by what they say about its tokens: which slot
// each token stands in, which tokens form an entity, which wires are linked. Node only: it
// uses the library's validator, which reads the SOP parser of a knowledge checkout.
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createAnalysisValidator, hasCompleteSource} from '../../lib/check-analysis.mjs'
import {directedGraph, sameDirectedGraph} from '../../lib/directed-graph.mjs'

const REFS = ['subject', 'direct_object', 'indirect_object', 'predicative_entity', 'topic', 'participant', 'clausal_complement']

export async function createComparer(knowledgeDir) {
  const {parse} = await import(pathToFileURL(join(knowledgeDir, 'tools/sopworld/sopworld.mjs')))
  const validate = await createAnalysisValidator({knowledgeDir})

  /** {check, complete, labels: token -> "type.key", entities, links (with role), bare (without)} */
  function describe(text, sop) {
    const check = validate(text, sop, {alignSource: true})
    const empty = {check, complete: false, labels: new Map(), entities: new Set(), links: new Set(), bare: new Set()}
    let wires
    try { wires = parse(sop) } catch { return empty }
    const byId = new Map(wires.map(wire => [wire.id, wire]))
    const labels = new Map(), tokensOf = new Map(), slotStart = new Map()
    for (const {wire, key, start, end} of check.placements ?? []) {
      const type = byId.get(wire)?.type
      for (let token = start; token < end; token++) {
        labels.set(token, type + '.' + key)
        if (!tokensOf.has(wire)) tokensOf.set(wire, [])
        tokensOf.get(wire).push(token)
      }
      const slot = wire + '\0' + key
      if (!slotStart.has(slot)) slotStart.set(slot, start)
    }
    const anchorOf = (id, depth = 0) => {
      const wire = byId.get(id)
      if (!wire || depth > 8) return []
      if (wire.type === 'nlu.coordination') return (wire.attrs.member ?? []).flatMap(member => anchorOf(member.slice(1), depth + 1))
      const keys = wire.type === 'nlu.entity' ? ['head', 'name', 'pronoun', 'literal'] : ['predicate', 'expression']
      for (const key of keys) if (slotStart.has(id + '\0' + key)) return [slotStart.get(id + '\0' + key)]
      if (wire.type === 'nlu.clause' && wire.attrs.topic) return anchorOf(wire.attrs.topic[0].slice(1), depth + 1).map(anchor => 'f' + anchor)
      const own = tokensOf.get(id)
      return own ? [Math.min(...own)] : []
    }
    const entities = new Set(), links = new Set(), bare = new Set()
    const link = (from, key, to) => { for (const a of from) for (const b of to) { links.add(a + ' ' + key + ' ' + b); bare.add(a + ' ' + b) } }
    for (const wire of wires) {
      if (wire.type === 'nlu.entity' && tokensOf.has(wire.id)) entities.add(tokensOf.get(wire.id).sort((a, b) => a - b).join(','))
      if (wire.type === 'nlu.clause') for (const key of REFS) for (const target of wire.attrs[key] ?? []) link(anchorOf(wire.id), key, anchorOf(target.slice(1)))
      if (wire.type === 'nlu.relation' && wire.attrs.from && wire.attrs.to) link(anchorOf(wire.attrs.from[0].slice(1)), 'relation', anchorOf(wire.attrs.to[0].slice(1)))
      if (wire.type === 'nlu.entity' && wire.attrs.possessor) link(anchorOf(wire.id), 'possessor', anchorOf(wire.attrs.possessor[0].slice(1)))
      if (wire.type === 'nlu.coordination') {
        const members = (wire.attrs.member ?? []).map(member => anchorOf(member.slice(1)))
        for (let k = 1; k < members.length; k++) link(members[0], 'coordination', members[k])
      }
    }
    return {check, complete: hasCompleteSource(check), labels, entities, links, bare}
  }

  /** The same graph once optional meaning atoms are set aside. */
  function sameGraph(a, b) {
    try { return sameDirectedGraph(directedGraph(parse(a), 'syntax'), directedGraph(parse(b), 'syntax')) } catch { return false }
  }
  return {describe, sameGraph, parse, validate}
}

export const overlap = (a, b) => { let n = 0; for (const item of a) if (b.has(item)) n++; return n }

/** How far two descriptions agree: shares of tokens in the same slot and of links found in both. */
export function agreement(ours, theirs) {
  let same = 0
  for (const [token, label] of theirs.labels) if (ours.labels.get(token) === label) same++
  const tokens = Math.max(theirs.labels.size, ours.labels.size) || 1
  const shared = overlap(ours.bare, theirs.bare), links = ours.bare.size + theirs.bare.size
  return {slots: same / tokens, links: links ? 2 * shared / links : 1}
}
