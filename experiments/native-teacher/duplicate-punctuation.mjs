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
