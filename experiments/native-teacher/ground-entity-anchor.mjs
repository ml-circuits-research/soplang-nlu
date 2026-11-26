const quotedField=/[ \t]+([a-z_][a-z_0-9]*)=("(?:[^"\\\r\n]|\\.)*")/gu
const anchors=new Set(['head','name','literal','pronoun'])
const countOrOrdinal=/^(?:[+-]?\d+(?:[.,]\d+)?(?:st|nd|rd|th)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)$/iu

// A standalone written number can be a literal anchor without inventing a noun.
export function groundEntityAnchor(sop){
  return sop.split('\n').map(line=>{
    if(!/^\s*@\S+\s+nlu\.entity(?:\s|$)/u.test(line))return line
    const fields=[...line.matchAll(quotedField)]
    if(fields.some(m=>anchors.has(m[1])))return line
    const missing=fields.find(m=>m[1]==='quantity'||m[1]==='determiner')
    if(!missing)return line
    let text
    try{text=JSON.parse(missing[2])}catch{return line}
    const key=missing[1]==='quantity'&&countOrOrdinal.test(text)?'literal':
      missing[1]==='determiner'&&/^(?:this|that|these|those)$/iu.test(text)?'pronoun':null
    if(!key)return line
    const prefix=missing[0].match(/^\s+/u)[0]
    return line.slice(0,missing.index)+prefix+key+'='+missing[2]+line.slice(missing.index+missing[0].length)
  }).join('\n')
}
