// Features describe the candidate circuit and agreement among independent
// providers. Training and inference use the same construction and ordering.
const families = ['base-beam','adapted-beam','adapted-compact','neuro-prolog']
const forms = ['imperative','declarative','interrogative','fragment','nonfinite']
const roleKeys = ['subject','direct_object','indirect_object','predicative_entity','clausal_complement',
  'result_complement','predicate','question','auxiliary','negation','modifier','quantity','degree',
  'measure','compound','name','head','pronoun','literal','connective','speech_act','topic']
const types = ['clause','entity','relation','coordination']
const relationKinds = ['apposition','label','nominal_predicate','where','value','of','to','on','in','from',
  'by','with','sequence','elaboration','nominal_adjunct','result_state','adverbial_clause']
const closedLead = {
  wh:/^(?:who|what|which|when|where|why|how|whose|whom)\b/iu,
  auxiliary:/^(?:do|does|did|can|could|would|will|shall|should|is|are|was|were|have|has|may|might)\b/iu,
  nominal:/^(?:a|an|the|one|two|three|some|both|this|that|those|these)\b/iu,
  pronoun:/^(?:i|we|you|she|he|they|it)\b/iu,
  conjunction:/^(?:and|but|or|then|instead|next)\b/iu
}
const decode = raw => raw.startsWith('"') ? JSON.parse(raw) : raw
const first = (wire,key) => wire.attrs[key]?.[0]
const sequenceKey = (...parts) => JSON.stringify(parts)
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

function describe(sop,parse,size) {
  const wires=parse(sop)
  const byId=new Map(wires.map(w=>['$'+w.id,w]))
  const basic=new Map()
  for(const wire of wires) {
    const type=wire.type.slice(4)
    const keys=type==='entity'?['name','head','pronoun','literal']:type==='clause'?['predicate','expression']:['kind']
    const surface=keys.map(key=>first(wire,key)).find(Boolean)
    basic.set('$'+wire.id,sequenceKey(type,surface ? decode(surface):''))
  }
  // Use a bounded neighbourhood, so cycles and repeated entity names cannot
  // cause recursive traversal or make the score depend on wire numbering.
  const anchors=new Map()
  for(const wire of wires) {
    const key='$'+wire.id
    if(wire.type==='nlu.coordination') anchors.set(key,sequenceKey(basic.get(key),
      ...(wire.attrs.member ?? []).map(ref=>basic.get(ref) ?? '').sort()))
    else if(wire.type==='nlu.entity') anchors.set(key,sequenceKey(basic.get(key),
      ...(wire.attrs.modifier ?? []).map(decode).sort(),...(wire.attrs.quantity ?? []).map(decode).sort()))
    else anchors.set(key,basic.get(key))
  }
  const facts=new Map(), core=new Map(),counts=new Map()
  const add=(map,key) => map.set(key,(map.get(key) ?? 0)+1)
  const stats={wireCount:log(wires.length), wiresPerToken:ratio(wires.length,size)}
  let rootless=0,noArgument=0,longest=0,references=0,strings=0
  const incoming=new Set()
  for(const wire of wires) {
    const type=wire.type.slice(4), anchor=anchors.get('$'+wire.id)
    add(counts,'type_'+type)
    if(type==='clause') {
      add(counts,'form_'+first(wire,'form'))
      if(!(wire.attrs.subject || wire.attrs.direct_object || wire.attrs.topic || wire.attrs.clausal_complement || wire.attrs.result_complement)) noArgument++
    }
    if(type==='relation') {
      const kind=first(wire,'kind')
      add(counts,'rel_'+kind)
      const arc=sequenceKey('relation',kind,anchors.get(first(wire,'from')),anchors.get(first(wire,'to')))
      add(core,arc); add(facts,arc)
    }
    for(const [slot,raws] of Object.entries(wire.attrs)) {
      for(const raw of raws) {
        add(counts,'slot_'+slot)
        const ref=raw.startsWith('$')
        if(ref){references++;incoming.add(raw)}
        if(raw.startsWith('"')){strings++;longest=Math.max(longest,decode(raw).trim().split(/\s+/u).length)}
        const value=ref ? anchors.get(raw) ?? '' : decode(raw)
        const fact=sequenceKey(anchor,slot,value)
        add(facts,fact)
        if(type==='clause' && (ref || ['predicate','form','result_complement','polarity'].includes(slot)) ||
            type==='coordination' && (slot==='kind'||slot==='member')) add(core,fact)
      }
    }
  }
  for(const w of wires) if(w.type==='nlu.clause' && !incoming.has('$'+w.id)) rootless++
  Object.assign(stats,{mainClauses:log(rootless), clausesWithoutArguments:log(noArgument), longestQuote:log(longest),
    refsPerToken:ratio(references,size), sourceSlotsPerToken:ratio(strings,size)})
  for(const [prefix,names] of [['type',types],['form',forms],['slot',roleKeys],['rel',relationKinds]]) {
    for(const name of names) stats[prefix+'_'+name]=log(counts.get(prefix+'_'+name) ?? 0)
  }
  return {stats,facts,core}
}

// Multiset Dice retains repeated predicates or relations in a longer utterance.
function overlap(a,b) {
  let shared=0, total=0
  for(const [key,n] of a){shared+=Math.min(n,b.get(key) ?? 0);total+=n}
  for(const n of b.values())total+=n
  return ratio(2*shared,total)
}

export function selectorChoices(text,pool,parse) {
  const {size,features}=sourceFeatures(text)
  const unique=new Map()
  for(const {family,rank,sop,eligible} of pool) {
    if(!eligible)continue
    if(!families.includes(family)) throw Error('Unknown proposal family '+family)
    let c=unique.get(sop)
    if(!c){c={sop,ranks:new Map(),graph:describe(sop,parse,size)};unique.set(sop,c)}
    c.ranks.set(family,Math.min(rank,c.ranks.get(family) ?? Infinity))
  }
  const choices=[...unique.values()]
  const matrix=choices.map((a,i)=>choices.map((b,j)=>i===j?1:overlap(a.graph.facts,b.graph.facts)))
  const core=choices.map((a,i)=>choices.map((b,j)=>i===j?1:overlap(a.graph.core,b.graph.core)))
  let featureNames=[]
  const candidates=choices.map((c,i)=>{
    const f={...features,...c.graph.stats,eligiblePoolSize:log(choices.length),exactFamilySupport:c.ranks.size}
    for(const family of families){
      f['from_'+family]=Number(c.ranks.has(family))
      f['rank_'+family]=c.ranks.has(family)?1/(1+c.ranks.get(family)):0
      let max=0, maxCore=0,n=0
      for(const [j,other] of choices.entries()){
        if(i!==j && other.ranks.has(family)){max=Math.max(max,matrix[i][j]);maxCore=Math.max(maxCore,core[i][j]);n++}
      }
      f['agreement_'+family]=max
      f['roleAgreement_'+family]=maxCore
      f['peers_'+family]=log(n)
    }
    featureNames=Object.keys(f)
    return {sop:c.sop,features:Object.values(f),similarity:matrix[i]}
  })
  return {featureNames,candidates}
}
