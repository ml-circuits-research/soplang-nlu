// Resolve nominal role conflicts before the projector indexes dependency arcs.
// All edits operate on the projector's private, source-aligned token copies.
const nominals = new Set(['NOUN','PROPN','PRON','NUM'])
const verbs = new Set(['VERB','AUX'])
const movement = new Set(['move','place','position','put','shift','slide','drag','nudge','push','pull','raise','lower'])
const lengths = new Set(['px','pixel','inch','foot','metre','meter','cm','mm','step','place','spot','unit'])
const orientation = new Set(['face','point','stand','sit','look','wear','hold'])

export function repairNominalRoles(tokens) {
  const children = Map.groupBy(tokens.filter(t => t.head !== t.index), t => t.head)
  const under = t => children.get(t.index) ?? []
  for (const token of tokens) {
    const governor = tokens[token.head]
    if (token.dep === 'conj' && nominals.has(token.pos) && verbs.has(governor.pos)) {
      // In an elliptical object list a parser can attach the next noun
      // to the verb. Relink only when there is already an overt object
      // and an intervening coordination or sequencing cue.
      const object = under(governor).find(t => ['obj','dobj'].includes(t.dep) && t.index < token.index && nominals.has(t.pos))
      if (!object || under(token).some(t => ['nsubj','nsubjpass','cop','aux'].includes(t.dep))) continue
      const cues = tokens.slice(object.index + 1,token.index)
      if (cues.some(t => t.dep === 'ROOT' || t.value === ';') ||
          !cues.some(t => t.dep === 'cc' || t.value === ',' || t.lower === 'then')) continue
      token.head = object.index
      for (const cue of cues.filter(t => (t.dep === 'cc' || t.value === ',') && t.head === governor.index)) {
        cue.head = object.index
      }
    }
    if (token.dep === 'acl' && orientation.has(token.lemma) && token.index > governor.index &&
        governor.dep === 'pobj' && ['left','right'].includes(governor.lower)) {
      const prep = tokens[governor.head]
      const referent = tokens[prep.head]
      if (prep.dep === 'prep' && nominals.has(referent.pos)) token.head = referent.index
    }
    if (token.dep === 'dep' && token.pos === 'VERB' && /^\p{Lu}/u.test(token.value) &&
        token.index === governor.index + 1 && movement.has(governor.lemma)) {
      const measure = under(token).find(t => ['obj','dobj'].includes(t.dep) && lengths.has(t.lemma) &&
        under(t).some(n => n.dep === 'nummod'))
      if (measure && !under(governor).some(t => ['obj','dobj'].includes(t.dep))) {
        token.dep = 'dobj'
        token.pos = 'PROPN'
        measure.head = governor.index
        measure.dep = 'npadvmod'
      }
    }
  }
}
