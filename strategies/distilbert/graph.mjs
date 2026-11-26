import {sourceTokenMatches} from '../../lib/check-analysis.mjs'

export function tokenizeSource(text) {
  return sourceTokenMatches(text).map(token=>({text:token[0],start:token.index,end:token.index+token[0].length}))
}

const nodeTypes = new Set(['nlu.entity','nlu.clause','nlu.relation','nlu.coordination'])
const slotName = /^[a-z][a-z0-9_]*$/u
const validAtom = /^[\p{L}\p{N}_][\p{L}\p{N}_-]*$/u
const inRange = (value,max) => Number.isInteger(value) && value>=0 && value<max

export function renderGraph(text,tokens,nodes) {
  if (!Array.isArray(nodes)) throw Error('Expected graph nodes')
  const id = i => 'n'+(i+1)
  return nodes.map(({anchor,type,attrs},index)=>{
    if (!inRange(anchor,tokens.length) || !nodeTypes.has(type) || !Array.isArray(attrs)) throw Error('Invalid graph node')
    const fields = attrs.map(attr=>{
      const {key}=attr
      if (typeof key!=='string' || !slotName.test(key)) throw Error('Invalid graph slot')
      const forms = ['target','atom','start'].filter(name=>Object.hasOwn(attr,name))
      if (forms.length!==1) throw Error('Ambiguous graph value')
      let value
      if (forms[0]==='start') {
        if (!inRange(attr.start,tokens.length) || !Number.isInteger(attr.end) ||
            attr.end<=attr.start || attr.end>tokens.length) throw Error('Invalid evidence span')
        value=JSON.stringify(text.slice(tokens[attr.start].start,tokens[attr.end-1].end))
      } else if (forms[0]==='target') {
        if (!inRange(attr.target,nodes.length)) throw Error('Invalid graph edge')
        value='$'+id(attr.target)
      } else {
        if (typeof attr.atom!=='string' || !validAtom.test(attr.atom)) throw Error('Invalid graph atom')
        value=attr.atom
      }
      return key+'='+value
    })
    return ['@'+id(index),type,...fields].join(' ')
  }).join('\n')
}

const anchorFields = {
  'nlu.clause':['predicate','expression','question','auxiliary','marker'],
  'nlu.entity':['head','name','pronoun','literal','modifier','quantity'],
  'nlu.relation':['cue'], 'nlu.coordination':['cue']
}

export function encodeGraph(text,sop,parse,check) {
  const tokens=tokenizeSource(text)
  const wires=parse(sop)
  const indices=new Map(wires.map((wire,index)=>['$'+wire.id,index]))
  const spans=new Map()
  for (const claim of check.placements) {
    const key=JSON.stringify([claim.wire,claim.key,claim.text])
    if (!spans.has(key)) spans.set(key,[])
    spans.get(key).push({start:claim.start,end:claim.end})
  }
  const nodes=wires.map(wire=>{
    const attrs=[]
    for(const [key,values] of Object.entries(wire.attrs)) for(const raw of values) {
      if(raw.startsWith('"')) {
        const span=spans.get(JSON.stringify([wire.id,key,JSON.parse(raw)]))?.shift()
        if (!span) throw Error('Missing static source alignment')
        attrs.push({key,...span})
      } else if(raw.startsWith('$')) {
        if (!indices.has(raw)) throw Error('Unresolved edge')
        attrs.push({key,target:indices.get(raw)})
      } else attrs.push({key,atom:raw})
    }
    const quoted=attrs.filter(attr=>attr.start!==undefined)
    const head=anchorFields[wire.type].map(key=>quoted.find(a=>a.key===key)).find(Boolean)
    return {type:wire.type,anchor:head?.start ?? quoted[0]?.start ?? null,attrs}
  })
  // A fragment without a predicate can share its topic's anchor. Cue-less
  // relations use the target as their anchor, and coordination its first member.
  for(let i=0;i<nodes.length;i++) {
    let resolved=0
    for(const node of nodes.filter(n=>n.anchor===null)) {
      const refs=node.attrs.filter(attr=>attr.target!==undefined)
      const target=[...refs.filter(ref=>['to','topic','member'].includes(ref.key)),...refs]
        .map(ref=>nodes[ref.target].anchor).find(anchor=>anchor!==null)
      if(target!==undefined) {node.anchor=target;resolved++}
    }
    if(!resolved)break
  }
  if(nodes.some(node=>node.anchor===null))throw Error('Unanchored graph component')
  return {tokens,nodes}
}
