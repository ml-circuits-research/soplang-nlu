// What the ranker sees of a message and of the circuits proposed for it. The circuits are in the
// `syntax` schema and are read with the contract of this package alone.
//
// The ranker (model.json) was fitted on circuits of the old `nlu` schema. The names and the order
// of its features are read from the ranker itself; this module holds no list of them. For each
// name it computes the nearest counterpart in the syntax schema:
//
// | Feature of the ranker | Computed from a syntax circuit as |
// | type_clause, type_relation, type_coordination, type_entity | the number of wires of that type (entity: nominals) |
// | form_<form> | the number of clauses of that form |
// | slot_subject, slot_auxiliary | the number of subjects, of auxiliaries |
// | slot_predicate | the number of verbs |
// | slot_direct_object | the number of complements (the schema does not tell objects apart) |
// | slot_modifier | the number of dependents of nominals (determiners and numerals included) |
// | slot_head | the number of heads (names, pronouns and literals included) |
// | slot_negation | negations of clauses and of relations |
// | slot_clausal_complement | relations from a clause to a clause with no marker or with the infinitive "to" |
// | rel_<word> for the marking words where, of, to, on, in, from, by, with | relations whose marker is that word |
// | rel_apposition | relations with no marker from a nominal to a nominal |
// | any other slot_… or rel_… the ranker asks for | 0: the syntax schema has no such slot and no kinds of relations |
// | rank_<family> | 1 when the family wrote the circuit: a strategy now returns one circuit |
// The other features (the message itself, the size of the circuit, the agreement between
// families) are computed as before.
import {parseCircuit, validateSyntax, coreOf, wordsOf} from '../../lib/syntax.mjs'

export const families = ['base-beam','adapted-beam','adapted-compact','neuro-prolog']
// Marking words that the ranker counts relations by.
const markerKinds = new Set(['where','of','to','on','in','from','by','with'])
// How a message begins, by closed classes of English words.
const closedLead = {
  wh:/^(?:who|what|which|when|where|why|how|whose|whom)\b/iu,
  auxiliary:/^(?:do|does|did|can|could|would|will|shall|should|is|are|was|were|have|has|may|might)\b/iu,
  nominal:/^(?:a|an|the|one|two|three|some|both|this|that|those|these)\b/iu,
  pronoun:/^(?:i|we|you|she|he|they|it)\b/iu,
  conjunction:/^(?:and|but|or|then|instead|next)\b/iu
}
const log = n => Math.log1p(n)
const ratio = (n,d) => d ? n/d : 0

function sourceFeatures(text) {
  const tokens = text.match(/[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu) ?? []
  const leads = Object.fromEntries(Object.entries(closedLead).map(([name,pattern]) =>
    ['starts_'+name,Number(pattern.test(text.trimStart()))]))
  return {size:Math.max(tokens.length,1),features:{tokens:log(tokens.length), characters:log(text.length),
    commas:log(tokens.filter(t=>t===',').length), strongBoundaries:log(tokens.filter(t=>[';',':','—'].includes(t)).length),
    endsQuestion:Number(/\?[.!"]*\s*$/u.test(text)), numbers:log(tokens.filter(t=>/\p{N}/u.test(t)).length),
    capitals:log(tokens.slice(1).filter(t=>/^\p{Lu}/u.test(t)).length),
    quoted:Number(/["“”]/u.test(text)), negative:Number(/\b(?:not|never|no)\b|n['’]t\b/iu.test(text)),...leads}}
}

/** What one circuit says: its counts for the ranker, and its statements for the agreement between circuits. */
function describe(text, sop, size) {
  const check = validateSyntax(text, sop)
  if (!check.valid) return null
  const words = wordsOf(text), wires = parseCircuit(sop), byId = new Map(wires.map(wire => [wire.id, wire]))
  const counts = new Map()
  const add = (key, n = 1) => counts.set(key, (counts.get(key) ?? 0) + n)
  const placed = new Map()
  let longest = 0
  for (const place of check.placements) {
    placed.set(place.wire, [...(placed.get(place.wire) ?? []), place])
    longest = Math.max(longest, place.last - place.first + 1)
  }
  const quoted = (wire, key) => (placed.get(wire.id) ?? []).filter(place => place.key === key)
  const targets = (wire, key) => wire.slots.filter(slot => slot[0] === key && slot[1].startsWith('$')).map(slot => byId.get(slot[1].slice(1)))
  const clausal = wire => wire?.type === 'syntax.clause' || (wire?.type === 'syntax.coordination' && targets(wire, 'conjunct').every(member => member.type === 'syntax.clause'))
  let references = 0, rootless = 0, noArgument = 0
  const incoming = new Set(), completed = new Set()
  for (const wire of wires) {
    const type = wire.type.slice(7)
    add('type_' + (type === 'nominal' ? 'entity' : type))
    for (const slot of wire.slots) if (slot[1].startsWith('$')) { references++; incoming.add(slot[1].slice(1)) }
    if (type === 'clause') {
      add('form_' + wire.slots.find(slot => slot[0] === 'form')[1])
      add('slot_subject', targets(wire, 'subject').length)
      add('slot_direct_object', targets(wire, 'complement').length)
      add('slot_predicate', quoted(wire, 'verb').length)
      add('slot_auxiliary', quoted(wire, 'auxiliary').length)
      add('slot_negation', quoted(wire, 'negation').length)
    } else if (type === 'nominal') {
      add('slot_head', quoted(wire, 'head').length)
      add('slot_modifier', quoted(wire, 'dependent').length)
    } else if (type === 'relation') {
      add('slot_negation', quoted(wire, 'negation').length)
      const marker = quoted(wire, 'marker').map(place => words.slice(place.first, place.last + 1).map(word => word.text.toLowerCase()).join(' ')).join(' ')
      const [from] = targets(wire, 'from'), [to] = targets(wire, 'to')
      if (from?.type === 'syntax.clause' && clausal(to) && (!marker || marker === 'to')) { add('slot_clausal_complement'); completed.add(from.id) }
      else if (!marker && from?.type === 'syntax.nominal' && !clausal(to)) add('rel_apposition')
      else if (markerKinds.has(marker)) add('rel_' + marker)
    }
  }
  for (const wire of wires) {
    if (wire.type !== 'syntax.clause') continue
    if (!incoming.has(wire.id)) rootless++
    if (!targets(wire, 'subject').length && !targets(wire, 'complement').length && !completed.has(wire.id)) noArgument++
  }
  const stats = {wireCount:log(wires.length), wiresPerToken:ratio(wires.length,size),
    mainClauses:log(rootless), clausesWithoutArguments:log(noArgument), longestQuote:log(longest),
    refsPerToken:ratio(references,size), sourceSlotsPerToken:ratio(check.placements.length,size)}
  for (const [name,count] of counts) stats[name]=log(count)
  // The statements of a circuit, with wire names set aside: where every word stands, and how the
  // wires are tied. The core statements are the ties, the forms and the verbs.
  const identity = coreOf(text, sop)
  const lines = identity.split('\n')
  return {stats, identity, facts:new Set(lines), core:new Set(lines.filter(line => !/^\d+-\d+ /u.test(line) || /^\d+-\d+ verb /u.test(line)))}
}

// Dice overlap of two sets of statements.
function overlap(a,b) {
  let shared=0
  for(const line of a) if(b.has(line)) shared++
  return ratio(2*shared,a.size+b.size)
}

// A count of wires, forms, slots or relations that a circuit does not have is 0. Any other name
// that this module cannot compute is a ranker it was not written for.
const counted = /^(?:type|form|slot|rel)_/u

/**
 * @param observations [{family, sop}]: the valid circuits of the pool, at most one per family
 * @param featureNames the features the ranker was fitted with, in its order
 * @returns {featureNames, candidates: [{sop, families, features, similarity}]}, one candidate for
 *   each distinct circuit (two circuits that say the same are one candidate)
 */
export function selectorChoices(text,observations,featureNames) {
  const {size,features}=sourceFeatures(text)
  const unique=new Map()
  for(const {family,sop} of observations) {
    if(!families.includes(family)) throw Error('Unknown proposal family '+family)
    const graph=describe(text,sop,size)
    if(!graph)continue
    let c=unique.get(graph.identity)
    if(!c){c={sop,graph,families:new Set()};unique.set(graph.identity,c)}
    c.families.add(family)
  }
  const choices=[...unique.values()]
  const matrix=choices.map((a,i)=>choices.map((b,j)=>i===j?1:overlap(a.graph.facts,b.graph.facts)))
  const core=choices.map((a,i)=>choices.map((b,j)=>i===j?1:overlap(a.graph.core,b.graph.core)))
  const candidates=choices.map((c,i)=>{
    const f={...features,...c.graph.stats,eligiblePoolSize:log(choices.length),exactFamilySupport:c.families.size}
    for(const family of families){
      f['from_'+family]=Number(c.families.has(family))
      f['rank_'+family]=Number(c.families.has(family))
      let max=0, maxCore=0,n=0
      for(const [j,other] of choices.entries()){
        if(i!==j && other.families.has(family)){max=Math.max(max,matrix[i][j]);maxCore=Math.max(maxCore,core[i][j]);n++}
      }
      f['agreement_'+family]=max
      f['roleAgreement_'+family]=maxCore
      f['peers_'+family]=log(n)
    }
    const vector=featureNames.map(name=>{
      if(name in f)return f[name]
      if(counted.test(name))return 0
      throw Error('The ranker asks for a feature this strategy cannot compute: '+name)
    })
    return {sop:c.sop,families:[...c.families],features:vector,similarity:matrix[i]}
  })
  return {featureNames,candidates}
}
