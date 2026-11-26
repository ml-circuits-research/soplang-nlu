import {sourceTokenMatches} from '../../lib/check-analysis.mjs'

const field=/[ \t]+(connective|cue)=("(?:[^"\\\r\n]|\\.)*")/gu
const connective=/^(?:and|or|but|then|yet)$/iu

// A conjunction on a coordination and on one of its members can refer
// to the same written occurrence. Keep the quote on the coordination.
export function removeRedundantConnective(text,sop){
  const lines=sop.split('\n')
  const entries=lines.map(line=>[...line.matchAll(field)].flatMap(match=>{
    try{return [{key:match[1],value:JSON.parse(match[2]),index:match.index,field:match[0]}]}
    catch{return []}
  }))
  const occurrences=sourceTokenMatches(text).map(token=>token[0])
  for(const [index,line] of lines.entries()){
    if(!/^\s*@\S+\s+nlu\.coordination(?:\s|$)/u.test(line))continue
    const members=[...line.matchAll(/\smember=\$([^\s]+)/gu)].map(match=>match[1])
    for(const {key,value} of entries[index]){
      if(key!=='cue'||!connective.test(value))continue
      const budget=occurrences.filter(surface=>surface===value).length
      const count=entries.flat().filter(entry=>entry.value===value).length
      if(budget===0||count!==budget+1)continue
      const redundant=lines.flatMap((source,i)=>{
        const clause=/^\s*@(\S+)\s+nlu\.clause(?:\s|$)/u.exec(source)
        if(!clause||!members.includes(clause[1]))return []
        return entries[i].filter(c=>c.key==='connective'&&c.value===value).map(field=>[i,field])
      })
      if(redundant.length!==1)continue
      const [[owner,target]]=redundant
      lines[owner]=lines[owner].replace(target.field,'')
      entries[owner]=entries[owner].filter(entry=>entry!==target)
    }
  }
  return lines.join('\n')
}
