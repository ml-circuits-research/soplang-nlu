import {sourceTokenMatches} from '../../lib/check-analysis.mjs'

const optionalKeys=new Set(['separator','terminator'])
const optionalPunctuation=/^[.,]+$/u

// Optional punctuation can be claimed by nested clauses or by a spanning quote.
// Keep the spelled-out evidence and consume each written punctuation unit once.
export function removeSurplusPunctuation(text,sop){
  const budget={}
  for(const token of sourceTokenMatches(text)){
    if(optionalPunctuation.test(token[0]))budget[token[0]]=(budget[token[0]]??0)+1
  }
  const optional=[]
  const quotes=/([ \t]+)([a-z_][a-z_0-9]*)=("(?:[^"\\\r\n]|\\.)*")/gu
  for(const match of sop.matchAll(quotes)){
    let quote
    try{quote=JSON.parse(match[3])}catch{continue}
    const tokens=sourceTokenMatches(quote).map(token=>token[0]).filter(token=>optionalPunctuation.test(token))
    if(!tokens.length)continue
    if(optionalKeys.has(match[2])&&optionalPunctuation.test(quote)){
      optional.push({match,tokens})
    }else{
      for(const token of tokens)budget[token]=(budget[token]??0)-1
    }
  }
  const removals=[]
  // When a governor and its subordinate emit the same stop, prefer the later
  // wire, which usually carries the clause nearest that punctuation.
  for(const {match,tokens} of optional.reverse()){
    if(tokens.some(token=>(budget[token]??0)<tokens.filter(other=>other===token).length)){
      removals.push(match)
      continue
    }
    for(const token of tokens)budget[token]--
  }
  for(const match of removals)sop=sop.slice(0,match.index)+sop.slice(match.index+match[0].length)
  return sop
}

// A literal already understood as quoted content can retain its written
// delimiters when the source identifies exactly one such occurrence.
export function restoreLiteralDelimiters(text,sop){
  return sop.replace(/([ \t]+)([a-z_][a-z_0-9]*)=("(?:[^"\\\r\n]|\\.)*")/gu,
    (field,prefix,key,encoded)=>{
      if(key!=='literal')return field
      let value
      try{value=JSON.parse(encoded)}catch{return field}
      if(!value||/^["“‘]/u.test(value))return field
      const candidate=['"'+value+'"','“'+value+'”','‘'+value+'’'].filter(quote=>text.includes(quote))
      if(candidate.length!==1)return field
      const quote=candidate[0], position=text.indexOf(quote)
      if(text.indexOf(value)!==position+1||text.lastIndexOf(value)!==position+1)return field
      return prefix+key+'='+JSON.stringify(quote)
    })
}

export function restoreOptionalPunctuation(text,sop,placements){
  if(!placements?.length)return sop
  const coverage=new Set(placements.flatMap(({start,end})=>Array.from({length:end-start},(_,i)=>start+i)))
  const remaining=sourceTokenMatches(text).flatMap((token,i)=>!coverage.has(i)?[{index:i,text:token[0]}]:[])
  if(!remaining.length||remaining.some(token=>!/^[.,]$/u.test(token.text)))return sop
  const wires=sop.split('\n')
  const clauses=new Map(wires.flatMap((line,index)=>{
    const match=/^\s*@([^\s]+)\s+nlu\.clause(?:\s|$)/u.exec(line)
    return match?[[match[1],index]]:[]
  }))
  for(const token of remaining){
    const key=token.text==='.'?'terminator':'separator'
    const owner=placements.filter(p=>p.end<=token.index&&clauses.has(p.wire)&&
      !['separator','terminator'].includes(p.key)&&
      (key!=='terminator'||!/\sterminator=/u.test(wires[clauses.get(p.wire)])))
      .toSorted((a,b)=>b.end-a.end)[0]
    if(!owner)continue
    const index=clauses.get(owner.wire)
    wires[index]+=' '+key+'='+JSON.stringify(token.text)
  }
  return wires.join('\n')
}
