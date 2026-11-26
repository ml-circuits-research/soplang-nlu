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

// Find local predicate trees on either side of strong punctuation. Several
// unedited sentences can share one parser root across a semicolon or dash.
export function separateWrittenClauses(tokens) {
  const markers = tokens.filter(t => [';',':','—','–','.','?','!'].includes(t.value) && !t.quoted)
  const children = Map.groupBy(tokens.filter(t => t.head !== t.index), t => t.head)
  const annotations = []
  const independent = (word, start, end) => {
    if (!['VERB','AUX'].includes(word.pos)) return false
    const local = (children.get(word.index) ?? []).filter(t => t.index >= start && t.index < end)
    if (local.some(t => t.dep === 'mark' || t.lower === 'to' && t.dep === 'aux')) return false
    return local.some(t => ['nsubj','nsubjpass','aux','auxpass','expl'].includes(t.dep)) ||
      ['VB','VBP'].includes(word.tag) && local.some(t => ['dobj','obj','dative','prep','xcomp','ccomp','acomp','prt'].includes(t.dep))
  }
  const localRoot = (start, end) => {
    const roots = tokens.slice(start,end).filter(t => (t.head === t.index || t.head < start || t.head >= end) &&
      independent(t,start,end))
    return roots.find(t => t.dep === 'ROOT') ?? roots[0]
  }
  for (const [i, mark] of markers.entries()) {
    const left = localRoot(i ? markers[i-1].index+1 : 0,mark.index)
    const rightEnd = markers[i+1]?.index ?? tokens.length
    const right = localRoot(mark.index+1,rightEnd)
    if (!left || !right) continue
    // Only break arcs that actually cross this delimiter. Daughters local
    // to the same clause retain their attachment and evidence.
    for (const [node, cross] of [[left,left.head > mark.index],[right,right.head < mark.index]]) {
      if (cross && ['ccomp','xcomp','dep','advcl','parataxis','conj'].includes(node.dep)) {
        node.head = node.index
        node.dep = 'ROOT'
      }
    }
    if (left.head !== left.index || right.head !== right.index) continue
    mark.head = left.index
    mark.dep = 'punct'
    const lead = tokens[mark.index+1]
    const cue = ['then','next','finally','subsequently'].includes(lead.lower) ? [lead] :
      lead.lower === 'after' && ['that','this'].includes(tokens[lead.index+1]?.lower) ? tokens.slice(lead.index,lead.index+2) : []
    if (cue.length && cue.at(-1).index < right.index) {
      annotations.push({left,right,cue})
    }
  }
  return annotations
}

// An unfinished lead-in can be followed by a separately phrased question.
// Preserve the overt lead-in without supplying an omitted action.
export function separateQuestionRestarts(tokens) {
  const wh = new Set(['who','what','which','where','when','why','how','whose'])
  const finiteTag = new Set(['VBP','VBZ','VBD','MD'])
  const starters = []
  for (const word of tokens) {
    if (!wh.has(word.lower) || word.index < 2) continue
    const up = tokens[word.index-1]
    const previous = tokens[word.index-2]
    const modalFrame = previous.tag === 'MD' && up.pos === 'PRON'
    const openInfinitive = up.lower === 'to' && previous.pos === 'PRON'
    if (!modalFrame && !openInfinitive) continue
    const right = tokens.slice(word.index)
    const stop = right.findIndex(t => t.index > word.index && ['.','!','?',';'].includes(t.value))
    const clause = stop < 0 ? right : right.slice(0,stop)
    const finite = clause.find(t => finiteTag.has(t.tag))
    if (!finite) continue
    if (openInfinitive && (right[stop]?.value !== '?' ||
        ['extent','degree','end','purpose'].includes(tokens[word.index+1]?.lemma))) continue
    const root = finite.dep === 'aux' && tokens[finite.head].index >= word.index ? tokens[finite.head] : finite
    if (!['AUX','VERB'].includes(root.pos)) continue
    if (modalFrame) {
      previous.dep = 'ROOT'
      previous.head = previous.index
      up.dep = 'nsubj'
      up.head = previous.index
      starters.push(previous.index)
    } else {
      const wanting = tokens[previous.head]
      if (!wanting || !['VERB','AUX'].includes(wanting.pos) || wanting.index >= previous.index ||
          !['obj','dobj','iobj','dative','nsubj'].includes(previous.dep)) continue
      previous.head = wanting.index
      previous.dep = 'dobj'
      up.dep = 'restart_mark'
      up.head = wanting.index
      starters.push(wanting.index)
    }
    root.head = root.index
    root.dep = 'ROOT'
    for (let i = word.index + clause.length; i < tokens.length && ['?','.','!'].includes(tokens[i].value); ++i) {
      tokens[i].head = root.index
      tokens[i].dep = 'punct'
    }
  }
  return new Set(starters)
}
