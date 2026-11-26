// Independent structural checks on a proposed syntax circuit. A successful
// check certifies offsets, token coverage and local nominal role constraints.
export function checkSyntax(text, wires) {
  const issues = []
  const tokens = new Map()
  const covered = new Uint8Array(text.length)
  const issue = (id,reason) => issues.push({wire:id,reason})
  const field = (wire,key) => wire.attrs[key]?.[0]
  const string = raw => raw?.startsWith('"') ? JSON.parse(raw) : raw
  const start = wire => Number(field(wire,'start'))
  const end = wire => Number(field(wire,'end'))
  for (const wire of wires) {
    const first = start(wire), last = end(wire)
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 ||
        last <= first || last > text.length || text.slice(first,last) !== string(field(wire,'text'))) {
      issue(wire.id,'invalid-source-range')
      continue
    }
    if (wire.type === 'w.syntax.token') {
      tokens.set('$'+wire.id,wire)
      if (covered.subarray(first,last).some(Boolean)) issue(wire.id,'overlapping-token')
      covered.fill(1,first,last)
    }
  }
  const unexplained = []
  for (const match of text.matchAll(/\S+/gu)) {
    for (let i=match.index; i<match.index+match[0].length; i++) {
      if (covered[i]) continue
      const first = i
      while (i+1<match.index+match[0].length && !covered[i+1]) i++
      unexplained.push({start:first,end:i+1,text:text.slice(first,i+1)})
    }
  }
  const attached = new Set()
  for (const phrase of wires.filter(wire=>wire.type==='w.syntax.phrase')) {
    const head = tokens.get(field(phrase,'head'))
    if (!head) issue(phrase.id,'missing-head')
    const roles = {head:['pronoun','noun'],determiner:['determiner'],modifier:['adjective']}
    for (const [role,allowed] of Object.entries(roles)) {
      for (const ref of phrase.attrs[role] ?? []) {
        const token = tokens.get(ref)
        if (!token) { issue(phrase.id,'unknown-'+role); continue }
        const classes = (token.attrs.pos ?? []).map(string)
        if (!allowed.some(pos=>classes.includes(pos))) issue(phrase.id,'unexpected-'+role+'-class')
        if (start(token)<start(phrase) || end(token)>end(phrase)) issue(phrase.id,'attachment-outside-phrase')
        if (head && role !== 'head' && end(token)>start(head)) issue(phrase.id,'unexpected-'+role+'-position')
        attached.add(ref)
      }
    }
  }
  return {ok:issues.length===0 && unexplained.length===0,issues,unexplained,
    tokens:tokens.size,tokensInPhraseHypotheses:attached.size}
}
