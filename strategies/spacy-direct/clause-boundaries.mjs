// Repair clause heads that a dependency parser subordinated across a written
// utterance boundary. A subordinate marker, auxiliary or overt subject rules
// out the bare-imperative repair.
export function repairClauseBoundaries(tokens) {
  const children = Map.groupBy(tokens.filter(t => t.head !== t.index),t => t.head)
  const under = token => children.get(token.index) ?? []
  const finite = token => ['VERB','AUX'].includes(token.pos)
  const boundary = new Set([',',';',':','—','.','!','?'])
  for (const token of tokens) {
    const governor = tokens[token.head]
    if (token.dep === 'pobj' && token.pos === 'PRON' && token.tag === 'WP' && finite(governor) &&
        token.index < governor.index) {
      const stranded = under(governor).filter(t => t.pos === 'ADP' && ['prep','prt'].includes(t.dep) &&
        t.index > governor.index && !under(t).some(c => ['pobj','obj','pcomp'].includes(c.dep)))
      if (stranded.length === 1) {
        token.head = stranded[0].index
        stranded[0].dep = 'prep'
      }
    }
    if (!finite(token) || !finite(governor) || token.index >= governor.index ||
        !['advcl','ccomp','xcomp'].includes(token.dep)) continue
    const gap = tokens.slice(token.index+1,governor.index)
    const mark = gap.findLast(t => boundary.has(t.value))
    if (!mark) continue
    const parts = under(token)
    const controlled = parts.some(t => ['aux','auxpass','mark','nsubj','nsubjpass'].includes(t.dep))
    const commandPair = ['VB','VBP'].includes(token.tag) && !controlled &&
      parts.some(t => ['dobj','obj','dative','prt','prep'].includes(t.dep)) &&
      ['VB','VBP'].includes(governor.tag) &&
      !under(governor).some(t => ['nsubj','nsubjpass'].includes(t.dep))
    const leftAssertion = parts.some(t => ['nsubj','nsubjpass'].includes(t.dep)) &&
      !parts.some(t => t.dep === 'mark') && (mark.value === '—' ||
        governor.lemma === 'let' && tokens[governor.index+1]?.lower === "'s")
    if (commandPair || leftAssertion) {
      token.dep = 'parataxis'
    }
  }
}
