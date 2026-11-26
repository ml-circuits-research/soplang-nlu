// Prefer an overt predicate's complement frame when a spatial lookup or a
// result adjective was attached to a neighbouring constituent by the parser.
const changes = new Set(['change','convert','transform','turn'])
const resultVerbs = new Set(['set','make','keep','leave','paint','color','colour','recolor','recolour'])
const depict = new Set(['draw','sketch','include','show','add','depict','place','put','give'])
const positions = new Set(['place','position','slot','spot','row','column','step','item'])
const bounds = new Set(['start','end','top','bottom','right','left','front','back'])
const order = /^(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|next|[0-9]+(?:st|nd|rd|th))$/u

export function repairPredicateAttachments(tokens) {
  const children = Map.groupBy(tokens.filter(t => t.head !== t.index), t => t.head)
  const under = t => children.get(t.index) ?? []
  for (const verb of tokens.filter(t => t.pos === 'VERB')) {
    const parts = under(verb)
    const obj = parts.find(t => ['dobj','obj'].includes(t.dep))
    for (const prep of parts.filter(t => t.dep === 'prep')) {
      if (verb.lemma === 'face' || verb.lemma === 'point') {
        const direction = tokens[prep.index-1]
        if (direction?.head === prep.index && direction.dep === 'advmod' &&
            ['left','right','up','down','forward','backward'].includes(direction.lower) &&
            direction.index === verb.index+1) direction.head = verb.index
      }
      if (!obj) continue
      if (changes.has(verb.lemma) && ['in','on','beside','behind','under','above','near'].includes(prep.lower) &&
          obj.index < prep.index && parts.some(t => t.dep === 'prep' && t.lower === 'into' && t.index > prep.index)) {
        prep.head = obj.index
      }
      if (prep.lower === 'from' && under(prep).some(t => t.dep === 'pobj' && bounds.has(t.lemma))) {
        const place = tokens[prep.index-1]
        if (place && positions.has(place.lemma) && under(place).some(t => order.test(t.lower))) prep.head = place.index
      }
    }
    if (!obj) continue
    if (depict.has(verb.lemma)) {
      for (const facing of parts.filter(t => t.dep === 'advcl' && t.lemma === 'face' && t.index > obj.index)) {
        if (under(facing).some(t => ['left','right','forward','backward'].includes(t.lower)) &&
            !under(facing).some(t => ['mark','nsubj','aux'].includes(t.dep)) &&
            !tokens.slice(obj.index+1,facing.index).some(t => t.value === ',' || t.dep === 'cc')) {
          facing.dep = 'acl'
          facing.head = obj.index
        }
      }
    }
    if (resultVerbs.has(verb.lemma)) {
      for (const prep of under(obj).filter(t => t.dep === 'prep')) {
        const name = under(prep).find(t => t.dep === 'pobj')
        if (!name) continue
        for (const state of under(name).filter(t => t.dep === 'acl' && t.tag === 'VBN' && t.index > name.index)) {
          if (!under(state).some(t => ['dobj','nsubj','aux','auxpass','agent','prt','prep'].includes(t.dep))) {
            state.head = verb.index
            state.dep = 'oprd'
            state.pos = 'ADJ'
          }
        }
      }
    }
  }
}
