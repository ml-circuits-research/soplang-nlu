// Build a stable text representation of directed attachments for a learned verifier.
export function describeGraph(wires) {
  const literal=raw=>raw.startsWith('"') ? JSON.parse(raw) : raw
  const values=(w,key)=>(w.attrs[key]??[]).filter(v=>!v.startsWith('$')).map(literal)
  const type=w=>w.type.slice(4)
  const heads={clause:['predicate','expression','speech_act','form'],entity:['head','name','pronoun','literal'],
    coordination:['cue','kind'],relation:['cue','kind']}
  function label(w){
    for(const key of heads[type(w)]??[]) {
      const terms=values(w,key)
      if(terms.length)return type(w)+' '+terms.join(' ')
    }
    return type(w)
  }
  const byId=new Map(wires.map(w=>['$'+w.id,label(w)]))
  const lines=wires.map(w=>{
    const attrs=[]
    for(const [key,raws] of Object.entries(w.attrs).sort(([a],[b])=>a<b?-1:a>b?1:0)){
      const ordered=key==='member'&&['sequence','contrast'].includes(w.attrs.kind?.[0])
      const items=raws.map(raw=>raw.startsWith('$') ? byId.get(raw) : literal(raw))
      if(!ordered)items.sort()
      attrs.push(key.replaceAll('_',' ')+' '+items.join(' / '))
    }
    return type(w)+' | '+attrs.join(' | ')
  })
  return lines.sort().join(' ; ')
}
