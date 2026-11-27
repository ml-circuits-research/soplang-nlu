// What the dependency parser saw, word by word, as evidence for the constraint model of the
// Z3 strategy: the class of each word, whether it heads or depends inside a nominal, and
// where a preposition attaches. Only labels of the parse are read here: Universal part-of-
// speech tags, Penn tags and dependency labels. No word list and no knowledge world.
const verbForms = {VB: ['base'], VBP: ['base'], VBZ: ['third'], VBD: ['past'], VBN: ['part'], VBG: ['ing']}
const insideNominal = new Set(['det', 'amod', 'compound', 'nummod', 'quantmod', 'predet', 'nmod', 'poss'])
const nominalPos = new Set(['NOUN', 'PROPN', 'PRON', 'NUM'])
const clausal = new Set(['relcl', 'advcl', 'ccomp', 'acl', 'csubj', 'pcomp'])

/** The class the model would give this word, from its tags and its dependency label. */
function classOf(part, parts) {
  const {pos, tag, dep} = part
  const head = parts[part.head]
  const hasObject = parts.some((other) => other.head === part.i && other.i !== part.i && ['pobj', 'pcomp', 'npadvmod'].includes(other.dep))
  if (dep === 'neg') return 'G'
  if (tag === 'TO') return dep === 'aux' ? 'T' : 'M'
  if (tag === 'POS') return 'S'
  if (tag === 'RP' || dep === 'prt') return 'R'
  if (pos === 'AUX') return dep === 'aux' || dep === 'auxpass' ? 'X' : 'V'
  if (pos === 'VERB') return dep === 'aux' || dep === 'auxpass' ? 'X' : dep === 'amod' ? 'J' : dep === 'compound' ? 'N' : 'V'
  if (pos === 'NOUN' || pos === 'PROPN') return 'N'
  if (pos === 'NUM') return 'Q'
  if (pos === 'PRON' || pos === 'DET') {
    if (tag === 'PRP$' || dep === 'det' || dep === 'predet' || dep === 'poss') return 'D'
    // a relative word introduces its clause
    if ((tag === 'WDT' || tag === 'WP') && head && head.dep === 'relcl' && head.i > part.i) return 'M'
    return 'P'
  }
  if (pos === 'ADJ') return 'J'
  if (pos === 'ADV') return tag === 'WRB' && head && clausal.has(head.dep) && head.i > part.i ? 'M' : 'R'
  if (pos === 'ADP') return dep === 'mark' || hasObject ? 'M' : 'R'
  if (pos === 'SCONJ') return 'M'
  if (pos === 'CCONJ') return 'C'
  if (pos === 'INTJ') return 'I'
  return null
}

/**
 * @param tokens the tokens of the model (strategies/z3/src/syntax/lexicon.mjs), which this adds
 *   readings to when the parser sees a class the lexicon does not offer
 * @param words the words of the message, from `wordsOf`
 * @param parts the dependency tokens: [{i, start, end, pos, tag, dep, head}]
 * @returns one entry per model token: {tag, nominal, attachment}
 */
export function evidenceOf(tokens, words, parts) {
  // the dependency token that stands for each model token: the one whose head lies outside it
  const partOf = tokens.map((token) => {
    const from = words[token.first].start, to = words[token.last].end
    const own = parts.filter((part) => part.start < to && part.end > from)
    const ids = new Set(own.map((part) => part.i))
    return own.find((part) => part.dep === 'ROOT' || !ids.has(part.head)) ?? own[0] ?? null
  })
  const tokenOfPart = new Map()
  tokens.forEach((token, index) => {
    const from = words[token.first].start, to = words[token.last].end
    for (const part of parts) if (part.start < to && part.end > from) tokenOfPart.set(part.i, index)
  })
  return tokens.map((token, index) => {
    const part = partOf[index]
    const entry = {}
    if (!part || token.flags.quote) return entry
    const headIndex = tokenOfPart.get(part.head)
    // the class of the word. The fixed multiword markers of the model keep their own reading,
    // and so do "then", "so", "yet", which the model reads as joining words by their place
    const tag = token.flags.complexOnly || token.flags.joiner ? null : classOf(part, parts)
    if (tag) {
      entry.tag = tag
      if (!token.cand.has(tag)) token.cand.set(tag, 0)
      if (tag === 'V') for (const form of verbForms[part.tag] ?? ['base']) token.form[form] = true
    }
    // inside a nominal: a word before its head, with nothing foreign between them
    if (insideNominal.has(part.dep) && headIndex !== undefined && headIndex > index && part.tag !== 'POS' &&
        tokens.slice(index + 1, headIndex).every((_, offset) => tokenOfPart.get(partOf[index + 1 + offset]?.head) === headIndex || partOf[index + 1 + offset]?.dep === 'case')) {
      if (!(part.dep === 'poss' && part.tag !== 'PRP$')) entry.nominal = 'dependent'
    } else if (nominalPos.has(part.pos) && tag !== 'M' && tag !== 'D') entry.nominal = 'head'
    // a preposition: at the verb, or at the nominal before it; a measure before it is its start
    if (part.dep === 'prep' || part.dep === 'agent' || part.dep === 'dative') {
      const head = parts[part.head]
      const measure = parts.some((other) => other.head === part.i && other.dep === 'npadvmod' && other.i < part.i)
      entry.attachment = measure ? 'nominal' : head.pos === 'VERB' || head.pos === 'AUX' ? 'clause' : nominalPos.has(head.pos) ? 'nominal' : undefined
    }
    return entry
  })
}
