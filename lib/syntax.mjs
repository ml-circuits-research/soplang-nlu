// Build once from the parsed SOP facts selected by the caller.
const tokensOf = text => [...text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*|[^\s]/gu)]
const decode = value => value.startsWith('"') ? JSON.parse(value) : value

export function createSyntaxReader(facts) {
  const root = new Map()
  for (const {type, attrs} of facts) {
    let forms, feature, values
    switch (type) {
      case 'k.words.sense': forms = attrs.word; feature = 'pos'; values = attrs.pos; break
      case 'w.lang.en.closed': forms = attrs.text; feature = 'pos'; values = attrs.class; break
      case 'w.lang.en.neg': forms = attrs.text; feature = 'cue'; values = ['negative']; break
      case 'w.lang.en.skip': forms = attrs.text; feature = 'cue'; values = attrs.class; break
      default: continue
    }
    for (const form of forms) {
      let node = root
      for (const [token] of tokensOf(decode(form).toLowerCase())) {
        if (!node.has(token)) node.set(token, new Map())
        node = node.get(token)
      }
      if (!node.has(null)) node.set(null, new Set())
      for (const value of values) node.get(null).add(feature + '=' + JSON.stringify(decode(value)))
    }
  }

  return function analyseSyntax(text) {
    if (typeof text !== 'string') throw new TypeError('Expected a text string')
    const tokens = tokensOf(text)
    const pos = tokens.map(() => new Set())
    const lines = []
    let recognised = 0
    function emit(type, first, last, fields) {
      const start = tokens[first].index
      const end = tokens[last].index + tokens[last][0].length
      const id = 's' + (lines.length + 1)
      lines.push('@' + id + ' w.syntax.' + type + ' start=' + start + ' end=' + end +
        ' text=' + JSON.stringify(text.slice(start, end)) + ' ' + fields.join(' '))
      return '$' + id
    }
    const ids = []
    for (let i = 0; i < tokens.length; i++) {
      let node = root
      const matches = []
      for (let j = i; j < tokens.length; j++) {
        node = node.get(tokens[j][0].toLowerCase())
        if (!node) break
        if (node.has(null)) matches.push([j, [...node.get(null)].sort()])
      }
      const fields = matches.find(([end]) => end === i)?.[1] ?? []
      if (/^\p{P}$/u.test(tokens[i][0])) fields.push('pos="punctuation"')
      if (/^\p{N}+$/u.test(tokens[i][0])) fields.push('pos="numeral"')
      for (const field of fields) if (field.startsWith('pos=')) pos[i].add(JSON.parse(field.slice(4)))
      if (pos[i].size) recognised++
      ids.push(emit('token', i, i, fields.length ? fields : ['cue="unclassified"']))
      for (const [end, features] of matches) if (end > i) emit('expression', i, end, features)
    }
    // Local noun phrase hypotheses. Keep lexical ambiguity on the token wire.
    for (let i = 0; i < tokens.length; i++) {
      if (pos[i].has('pronoun')) emit('phrase', i, i, ['form=nominal', 'head=' + ids[i]])
      if (!pos[i].has('determiner')) continue
      let j = i + 1
      while (j < tokens.length) {
        if (pos[j].has('noun')) {
          const modifiers = ids.slice(i + 1, j).map(id => 'modifier=' + id)
          emit('phrase', i, j, ['form=nominal', 'head=' + ids[j], 'determiner=' + ids[i], ...modifiers])
        }
        if (!pos[j].has('adjective')) break
        j++
      }
    }
    return {sop: lines.join('\n'), tokens: tokens.length, tokensWithPos: recognised}
  }
}
