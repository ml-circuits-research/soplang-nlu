const evidencePattern = /"(?:[^"\\]|\\.)*"|“[^”]*”|(?<![\p{L}\p{N}])‘[^’\n]*’(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])'(?:\\.|[^'\\\n])+'(?![\p{L}\p{N}])|\d{4}-\d{2}-\d{2}(?![\p{L}\p{M}\p{N}_])|\d{1,2}:\d{2}(?::\d{2})?(?![\p{L}\p{M}\p{N}_])|[+-]?(?:\d+\.\d+|\.\d+)(?![\p{L}\p{M}\p{N}_])|[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu
const cliticPattern = /(?:n['’]t|['’](?:s|d|m|re|ve|ll))$/iu
const nouns = new Set(['NOUN', 'PROPN', 'PRON', 'NUM'])
const verbs = new Set(['VERB', 'AUX'])
const subject = new Set(['nsubj', 'nsubjpass', 'expl'])
const roles = new Map([
  ['dobj', 'direct_object'], ['obj', 'direct_object'], ['iobj', 'indirect_object'],
  ['dative', 'indirect_object'], ['attr', 'predicative_entity'], ['oprd', 'predicative_entity']
])
const subordinators = new Map([
  ['if', 'condition'], ['because', 'reason'], ['although', 'concession'], ['unless', 'condition'],
  ['before', 'before'], ['after', 'after'], ['while', 'while'], ['when', 'when'], ['since', 'since'], ['once', 'once'], ['so', 'purpose']
])
const modifiers = new Map([
  ['det', 'determiner'], ['nummod', 'quantity'], ['compound', 'compound'], ['amod', 'modifier'],
  ['predet', 'modifier'], ['quantmod', 'modifier']
])
const ending = new Set(['.', '!', '?', ';', ':', '—'])
const questions = new Set(['what', 'which', 'where', 'when', 'why', 'how', 'who', 'whom', 'whose'])
const adjuncts = new Set(['advcl', 'ccomp', 'xcomp', 'relcl', 'acl', 'pcomp', 'conj', 'parataxis'])
const compoundPrepositions = new Map([
  ['next to', 'next_to'], ['close to', 'close_to'], ['out of', 'out_of'],
  ['because of', 'reason'], ['due to', 'reason'], ['instead of', 'instead_of'],
  ['in front of', 'in_front_of'], ['on top of', 'on_top_of'],
  ['on the left of', 'left_of'], ['on the right of', 'right_of'],
  ['to the left of', 'left_of'], ['to the right of', 'right_of']
])
const clauseMarkers = new Set(['if', 'whether', 'that'])
const reportingVerbs = new Set(['call', 'contain', 'label', 'name', 'print', 'quote', 'read', 'rename', 'say', 'type', 'write'])
const greeting = new Set(['hey', 'hello', 'hi', 'please'])
const gratitude = new Set(['thanks', 'thx'])
const relationalModifiers = new Set(['back', 'directly', 'immediately', 'just', 'only', 'over', 'right', 'smack'])
const resultHeads = new Set(['adjust', 'change', 'color', 'colour', 'keep', 'leave', 'make', 'paint', 'set', 'want'])
const possessiveDeterminers = new Set(['my', 'your', 'its', 'his', 'her', 'our', 'their'])
const timezone = /^(?:UTC|GMT|[ECMP][SD]T|CET|CEST)$/u
const quote = (key, value) => key + '=' + JSON.stringify(value)
const ref = (key, node) => key + '=$' + node.id

function align(text, dependencies) {
  const spans = []
  for (const match of text.matchAll(evidencePattern)) {
    const value = match[0]
    const start = match.index
    const clitic = /^\p{L}/u.test(value) && cliticPattern.exec(value)
    if (clitic) spans.push([start, start + clitic.index], [start + clitic.index, start + value.length])
    else spans.push([start, start + value.length])
  }
  const positions = new Map()
  let cursor = 0
  const tokens = spans.map(([start, end], index) => {
    while (dependencies[cursor]?.end <= start) cursor++
    const parts = []
    for (let i = cursor; dependencies[i]?.start < end; i++) {
      const dep = dependencies[i]
      parts.push(dep)
      if (!positions.has(dep.i)) positions.set(dep.i, index)
    }
    const ids = new Set(parts.map(({i}) => i))
    // Both quote marks can point outside the quotation. The external edge
    // of its content determines the quoted argument's role.
    const external = parts.filter(part => part.dep === 'ROOT' || !ids.has(part.head))
    const root = external.find(part => part.pos !== 'PUNCT') ?? external[0] ?? parts[0]
    const value = text.slice(start, end)
    const quoted = /^["“'‘].+["”'’]$/su.test(value)
    const numeric = /^[-+.]?\d[\d.:-]*$/u.test(value)
    return {index, start, end, value, quoted, numeric, lower: value.toLowerCase().replaceAll('’', "'"),
      head: root?.head, dep: root?.dep, lemma: root?.lemma?.toLowerCase(), tag: root?.tag, pos: quoted ? 'PROPN' : numeric ? 'NUM' : root?.pos,
      negated: parts.some((part) => part.dep === 'neg')}
  })
  for (const token of tokens) token.head = positions.get(token.head) ?? token.index
  for (const token of tokens) {
    if (!token.numeric || !/[\-:]/u.test(token.value)) continue
    const prep = tokens[token.index - 1]
    if (prep?.dep !== 'prep') continue
    token.dep = 'pobj'
    token.head = prep.index
    const zone = tokens[token.index + 1]
    if (token.value.includes(':') && timezone.test(zone?.value ?? '')) {
      zone.dep = 'amod'
      zone.head = token.index
    }
  }
  return tokens
}

export function projectDependencies(text, dependencies) {
  const tokens = align(text, dependencies)
  const children = Map.groupBy(tokens.filter((token) => token.head !== token.index), (token) => token.head)
  const under = (token) => children.get(token.index) ?? []
  const compoundCues = new Map()
  const internalCues = new Set()
  for (const first of tokens) {
    for (const [phrase, kind] of compoundPrepositions) {
      const words = phrase.split(' ')
      if (words[0] !== first.lower) continue
      const parts = tokens.slice(first.index, first.index + words.length)
      if (parts.length !== words.length || parts.some((part, index) => part.lower !== words[index])) continue
      if (!['prep', 'agent', 'advmod', 'acomp', 'prt'].includes(first.dep)) continue
      const last = parts.at(-1)
      const landmark = under(last).find((part) => ['pobj', 'obj', 'pcomp'].includes(part.dep))
      if (!landmark || parts.some((part) => internalCues.has(part.index))) continue
      compoundCues.set(first.index, {kind, parts, landmark})
      for (const part of parts.slice(1)) internalCues.add(part.index)
      break
    }
  }
  const nodes = []
  const used = new Set()
  const entities = new Map()
  const clauses = new Map()
  const groups = new Map()
  const deferredModifiers = new Set()
  const resultDependents = new Map()
  const courtesy = new Map()
  function make(type, token, fields = []) {
    const node = {id: 'n' + (nodes.length + 1), type, token, fields, slots: new Set()}
    nodes.push(node)
    return node
  }
  function literal(node, key, parts, repeat = false) {
    if (!parts.length || (!repeat && node.slots.has(key)) || parts.some(({index}) => used.has(index))) return false
    for (const {index} of parts) used.add(index)
    node.fields.push(quote(key, text.slice(parts[0].start, parts.at(-1).end)))
    if (!repeat) node.slots.add(key)
    return true
  }
  function relation(from, to, kind, cue = [], adverbs = []) {
    if (!from || !to || from === to || cue.some(({index}) => used.has(index))) return
    const node = make('relation', cue[0] ?? to.token, ['kind=' + kind, ref('from', from), ref('to', to)])
    literal(node, 'cue', cue)
    for (const adverb of adverbs) literal(node, 'adverb', [adverb], true)
    return node
  }

  for (const token of tokens) {
    const next = tokens[token.index + 1]
    const phrase = gratitude.has(token.lower) ? [token] : token.lower === 'thank' && next?.lower === 'you' ? [token, next] : []
    if (!phrase.length || token.quoted || under(token).some((part) => subject.has(part.dep) || possessiveDeterminers.has(part.lower))) continue
    const after = tokens[phrase.at(-1).index + 1]
    const tail = !after || ending.has(after.value) || after.value === ','
    const head = tokens[token.head]
    const hasPriorObject = head && under(head).some((part) => roles.has(part.dep) && part.index < token.index)
    const marked = ['ROOT', 'intj', 'discourse', 'parataxis'].includes(token.dep) ||
      tail && (tokens[token.index - 1]?.value === ',' || token.dep === 'npadvmod' && hasPriorObject)
    if (marked) courtesy.set(token.index, phrase)
  }

  const boundaries = new Map()
  for (const mark of tokens.filter((token) => [';', '—', ':'].includes(token.value))) {
    const left = tokens.slice(0, mark.index).findLast((token) =>
      ending.has(token.value) || verbs.has(token.pos) && ['ROOT', 'advcl', 'conj', 'parataxis'].includes(token.dep))
    const right = tokens.slice(mark.index + 1).find((token) =>
      ending.has(token.value) || verbs.has(token.pos) && ['ROOT', 'advcl', 'conj', 'parataxis'].includes(token.dep))
    if (left && right && !ending.has(left.value) && !ending.has(right.value)) boundaries.set(left.index, mark)
  }
  const prefixTopics = new Map()
  for (const token of tokens) {
    if (token.dep !== 'dep') continue
    const governor = tokens[token.head]
    if (!governor || !verbs.has(governor.pos)) continue
    if (verbs.has(token.pos) && token.index > governor.index &&
        under(token).some(part => roles.has(part.dep) || subject.has(part.dep))) {
      const delimiter = tokens.slice(governor.index + 1, token.index).findLast(part => [';', ':', '—'].includes(part.value))
      if (delimiter) boundaries.set(governor.index, delimiter)
    } else if (nouns.has(token.pos) && token.index < governor.index) {
      const between = tokens.slice(token.index + 1, governor.index)
      const join = between.findLast(part => part.lower === 'then')
      const comma = join && between.find(part => part.value === ',' && part.index < join.index)
      if (comma) prefixTopics.set(token.index, {governor, comma, join})
    }
  }
  const boundaryMarks = new Set(boundaries.values())
  const courtesyTerminators = new Set([...courtesy.values()].map((phrase) => phrase.at(-1).index + 1))
  for (const token of tokens) {
    if (token.dep === 'ROOT' || courtesy.has(token.index) || prefixTopics.has(token.index) ||
        token.dep === 'dep' && verbs.has(token.pos) && boundaries.get(token.head)?.index < token.index ||
        verbs.has(token.pos) && adjuncts.has(token.dep)) {
      clauses.set(token.index, make('clause', token))
    }
  }
  if (!clauses.size) clauses.set(tokens[0].index, make('clause', tokens[0]))

  function entity(token) {
    if (!token || courtesy.has(token.index)) return
    // Command names often have a verbal lexical tag even when the parser
    // places them in an explicit nominal argument position.
    const commandName = verbs.has(token.pos) && ['pobj','dobj','obj','appos'].includes(token.dep) &&
      /^\p{Lu}/u.test(token.value) && !under(token).some(child => subject.has(child.dep) || child.dep === 'aux')
    if (!commandName && !nouns.has(token.pos)) return
    if (entities.has(token.index)) return entities.get(token.index)
    if (used.has(token.index)) return
    const node = make('entity', token)
    entities.set(token.index, node)
    const key = token.quoted ? 'literal' : (commandName || token.pos === 'PROPN') ? 'name' : token.numeric ? 'literal' : token.pos === 'PRON' ? 'pronoun' : 'head'
    const parts = [token, ...under(token).filter((part) => part.pos === 'PROPN' && ['compound', 'flat', 'name'].includes(part.dep))]
      .sort((a, b) => a.index - b.index)
    if (key !== 'name' || !parts.every((part, index) => !index || part.index === parts[index - 1].index + 1) ||
        !literal(node, key, parts)) literal(node, key, [token])
    const pending = [...under(token)]
    for (const part of pending) {
      if (part.dep === 'compound') {
        for (const child of under(part)) if (child.dep === 'compound' && !pending.includes(child)) pending.push(child)
      }
      if (part.dep === 'advmod' && part.pos === 'ADV' && !under(part).some(child => child.dep === 'prep')) {
        literal(node, 'adverb', [part], true)
      } else if (part.dep === 'poss') {
        if (possessiveDeterminers.has(part.lower)) literal(node, 'determiner', [part])
        else {
          const possessor = entity(part)
          if (possessor && !node.slots.has('possessor')) {
            node.fields.push(ref('possessor', possessor))
            node.slots.add('possessor')
            const marker = under(part).find((child) => child.dep === 'case')
            if (marker) literal(node, 'possessive_marker', [marker])
          }
        }
      } else if (modifiers.has(part.dep) && !questions.has(part.lower)) {
        const slot = modifiers.get(part.dep)
        const conjunct = slot === 'modifier' && under(part).find((item) =>
          item.dep === 'conj' && item.pos === part.pos && item.index === part.index + 2)
        const conjunction = conjunct && tokens[part.index + 1]
        const chain = conjunction?.dep === 'cc' ? [part, conjunction, conjunct] : [part]
        literal(node, slot, chain, slot === 'modifier' || slot === 'compound')
        for (const child of under(part).filter((item) => item.dep === 'advmod' && item.pos === 'ADV')) {
          literal(node, 'degree', [child], true)
        }
      }
    }
    return node
  }

  function coordinate(token, base, lookup) {
    if (!base || groups.has(base)) return groups.get(base) ?? base
    const peers = [token]
    for (const current of peers) {
      for (const part of under(current)) {
        if (part.dep === 'conj' && !peers.includes(part) && lookup(part)?.type === base.type) peers.push(part)
      }
    }
    if (peers.length < 2) return base
    peers.sort((a, b) => a.index - b.index)
    const ids = new Set(peers.map(({index}) => index))
    const cues = tokens.slice(peers[0].index + 1, peers.at(-1).index)
      .filter((part) => ids.has(part.head) && (part.dep === 'cc' || part.value === ','))
    const kind = cues.some((part) => part.lower === 'or') ? 'alternative' : 'additive'
    const result = make('coordination', token, ['kind=' + kind, ...peers.map((part) => ref('member', lookup(part)))])
    for (const cue of cues) literal(result, 'cue', [cue], true)
    groups.set(base, result)
    return result
  }

  for (const [index,{governor,comma,join}] of prefixTopics) {
    const first = clauses.get(index)
    const next = clauses.get(governor.index)
    if (first && next) {
      const sequence = make('coordination',join,['kind=sequence',ref('member',first),ref('member',next)])
      if (comma.index + 1 === join.index) literal(sequence,'cue',[comma,join],true)
      else for (const part of [comma,join]) literal(sequence,'cue',[part],true)
    }
  }
  const primary = [...clauses.values()].filter(({token}) => token.dep === 'ROOT' || courtesy.has(token.index))
  const clauseOf = (token) => clauses.get(token.index)
  const attachments = new Map()
  for (const node of [...clauses.values()].sort((a, b) => a.token.index - b.token.index)) {
    const token = node.token
    const parts = under(token)
    const expression = courtesy.get(token.index)
    if (expression) {
      node.fields.push('form=fragment', 'speech_act=gratitude')
      literal(node, 'expression', expression)
      const before = tokens[token.index - 1]
      if (before?.value === ',') literal(node, 'separator', [before])
      const after = tokens[expression.at(-1).index + 1]
      if (after && ending.has(after.value)) literal(node, 'terminator', [after])
      continue
    }
    const final = boundaries.get(token.index) ?? parts.findLast((part) => part.dep === 'punct' && ending.has(part.value) && !courtesyTerminators.has(part.index) && !boundaryMarks.has(part))
    const marker = parts.find((part) => ['mark', 'aux'].includes(part.dep) && part.lower === 'to')
    const relativizer = token.dep === 'relcl' ? parts.find((part) => questions.has(part.lower) || part.lower === 'that') : undefined
    const question = (['ROOT', 'parataxis'].includes(token.dep) || final?.value === '?') ? parts.find((part) => questions.has(part.lower)) ??
      parts.flatMap(under).find((part) => questions.has(part.lower) && part.index < token.index && part.dep === 'det') : undefined
    const grammaticalSubject = parts.find((part) => subject.has(part.dep))
    const inversion = grammaticalSubject && [token, ...parts.filter((part) => part.dep === 'aux')]
      .some((part) => part.pos === 'AUX' && part.index < grammaticalSubject.index)
    const independent = boundaries.has(token.index) && token.head > boundaries.get(token.index).index
    const form = !verbs.has(token.pos) ? 'fragment' : relativizer ? 'declarative'
      : marker || !independent && !grammaticalSubject &&
        ['acl', 'advcl', 'xcomp', 'pcomp'].includes(token.dep) && ['VB', 'VBG', 'VBN'].includes(token.tag) ? 'nonfinite'
      : final?.value === '?' || question || inversion ? 'interrogative'
      : grammaticalSubject || !['VB', 'VBP'].includes(token.tag) ? 'declarative' : 'imperative'
    node.fields.push('form=' + form)
    if (final) {
      const interior = ['—',':'].includes(final.value) && final.index + 1 < tokens.length && !boundaryMarks.has(final)
      literal(node, interior ? 'separator' : 'terminator', [final], interior)
    }
    if (form === 'fragment') {
      const topic = coordinate(token, entity(token), entity)
      if (topic) node.fields.push(ref('topic', topic))
      else if (['ADJ','INTJ','ADV'].includes(token.pos)) {
        literal(node,'expression',[token])
        if (token.lower === 'sorry') node.fields.push('speech_act=apology')
      }
    } else {
      literal(node, 'predicate', [token])
      node.fields.push('polarity=' + (parts.some((part) => part.dep === 'neg' || part.negated) ? 'negative' : 'positive'))
    }
    if (marker) literal(node, 'marker', [marker])
    if (question) literal(node, 'question', [question])
    if (relativizer) attachments.set(token.index, relativizer)
    for (const part of parts) {
      if (part === marker || part === question || part === relativizer || courtesy.has(part.index) || compoundCues.has(part.index) || internalCues.has(part.index)) continue
      const reportedQuote = part.quoted && ['ccomp', 'xcomp', 'dep'].includes(part.dep) && reportingVerbs.has(token.lemma)
      const slot = reportedQuote ? 'direct_object' : subject.has(part.dep) ? 'subject' : roles.get(part.dep)
      if (slot && form !== 'fragment' && !node.slots.has(slot)) {
        const target = coordinate(part, entity(part), entity)
        if (target) {
          node.fields.push(ref(slot, target))
          node.slots.add(slot)
        }
      }
      const smallClauseSubject = part.dep === 'ccomp' && !verbs.has(part.pos) &&
        under(part).find((child) => subject.has(child.dep))
      let attachedResult = false
      if (smallClauseSubject) {
        const target = entity(smallClauseSubject)
        if (target && !node.slots.has('direct_object')) {
          node.fields.push(ref('direct_object', target))
          node.slots.add('direct_object')
          if (part.pos === 'ADJ') attachedResult = literal(node, 'result_complement', [part])
          else if (nouns.has(part.pos) && !node.slots.has('predicative_entity')) {
            const complement = entity(part)
            if (complement) {
              node.fields.push(ref('predicative_entity', complement))
              node.slots.add('predicative_entity')
            }
          }
        }
      }
      const comparative = (part.tag === 'JJR' || part.tag === 'RBR') && parts.some((item) => roles.get(item.dep) === 'direct_object') &&
        (part.pos === 'ADJ' && part.dep === 'advmod' ||
         ['ADJ', 'ADV'].includes(part.pos) && part.dep === 'ccomp' && resultHeads.has(token.lemma))
      const adjectivalComplement = part.pos === 'ADJ' && ['acomp', 'attr', 'oprd', 'xcomp'].includes(part.dep)
      if (comparative || adjectivalComplement) {
        attachedResult = literal(node, 'result_complement', [part]) || attachedResult
      }
      if (attachedResult) {
        resultDependents.set(node, under(part))

        for (const degree of under(part).filter((item) => ['advmod', 'npadvmod'].includes(item.dep))) {
          const chain = [...under(degree).filter((item) => ['det', 'amod'].includes(item.dep)), degree]
            .sort((a, b) => a.index - b.index)
          if (chain.every((item, index) => !index || item.index === chain[index - 1].index + 1)) {
            literal(node, 'degree', chain, true)
          }
        }
      }
      if (['aux', 'auxpass', 'cop'].includes(part.dep)) literal(node, 'auxiliary', [part], true)
      else if (part.dep === 'neg') literal(node, 'negation', [part], true)
      else if (part.dep === 'prt') literal(node, 'particle', [part], true)
      else if (part.dep === 'advmod' && part.pos === 'ADV' ||
          part.dep === 'intj' && ['now', 'then'].includes(part.lower)) {
        if (relationalModifiers.has(part.lower) && under(part).some((item) => item.dep === 'prep')) {
          deferredModifiers.add(part)
        } else if (!comparative && !['toward','towards'].includes(part.lower)) {
          for (const modifier of under(part).filter(child => child.dep === 'advmod' && child.pos === 'ADV')) {
            literal(node,'degree',[modifier],true)
          }
          literal(node, 'adverb', [part], true)
        }
      }
      else if (part.dep === 'intj' && greeting.has(part.lower)) literal(node, 'filler', [part], true)
      const child = clauseOf(part)
      const separated = boundaries.get(part.index)?.index < token.index
      if (child && !separated && ['xcomp', 'ccomp'].includes(part.dep) && !node.slots.has('clausal_complement')) {
        node.fields.push(ref('clausal_complement', coordinate(part, child, clauseOf)))
        node.slots.add('clausal_complement')
        const cue = under(part).find((item) => item.dep === 'mark' && clauseMarkers.has(item.lower))
        if (cue) literal(child, 'marker', [cue])
      }
      if (child && !separated && part.dep === 'advcl') {
        const cue = under(part).find((item) => item.dep === 'mark' && subordinators.has(item.lower))
        relation(node, child, subordinators.get(cue?.lower) ?? 'adverbial_clause', cue ? [cue] : [])
      }
    }
  }
  for (const node of primary) coordinate(node.token, node, clauseOf)

  for (const from of nodes) {
    if (!['clause', 'entity'].includes(from.type)) continue
    const {token: host} = from
    // A nominal root owns its prepositions through its topic entity.
    if (from.type === 'clause' && entities.has(host.index)) continue
    const attached = [...under(host), ...(resultDependents.get(from) ?? [])]
    for (const part of attached) {
      if (relationalModifiers.has(part.lower) && part.pos === 'ADV' && !compoundCues.has(part.index)) {
        for (const child of under(part)) {
          if (child.dep === 'prep') attached.push(child)
        }
      }
      if (internalCues.has(part.index)) continue
      const compound = compoundCues.get(part.index)
      if (compound || ['prep', 'agent'].includes(part.dep) || part.dep === 'dative' && part.pos === 'ADP') {
        const landmark = compound?.landmark ?? under(part).find((item) => ['pobj', 'obj', 'pcomp'].includes(item.dep))
        if (!landmark) continue
        const to = clauseOf(landmark) ?? entity(landmark)
        const label = compound?.kind ?? (courtesy.has(host.index) && part.lower === 'for' ? 'reason'
          : part.dep === 'agent' && under(host).some((item) => item.dep === 'auxpass') ? 'agent'
          : landmark.numeric && landmark.value.includes(':') && part.lower === 'at' ? 'time'
          : landmark.numeric && /^\d{4}-/u.test(landmark.value) && part.lower === 'on' ? 'date'
          : /^[a-z]+$/u.test(part.lower) ? part.lower : 'prepositional')
        const local = under(part).filter((item) => item.dep === 'advmod' && item.pos === 'ADV')
        const parent = tokens[part.head]
        if (parent && (deferredModifiers.has(parent) ||
            parent !== host && relationalModifiers.has(parent.lower) && parent.pos === 'ADV')) local.push(parent)
        relation(from, coordinate(landmark, to, to?.type === 'clause' ? clauseOf : entity), label, compound?.parts ?? [part], local)
        for (const child of under(part)) if (child.dep === 'prep') attached.push(child)
      }
      if (from.type === 'entity' && ['acl', 'relcl'].includes(part.dep)) {
        const cue = attachments.get(part.index)
        relation(from, clauseOf(part), cue ? subject.has(cue.dep) ? 'subject_relative' : 'object_relative'
          : 'nominal_clause', cue ? [cue] : [])
      }
      if (from.type === 'entity' && part.dep === 'nmod' && nouns.has(part.pos)) relation(from,entity(part),'nominal_modifier')
      if (part.dep === 'appos') relation(from, entity(part), 'apposition')
      if (part.dep === 'npadvmod' && !courtesy.has(part.index) && nouns.has(part.pos) && !used.has(part.index)) {
        relation(from, entity(part), 'nominal_adjunct')
      }
    }
  }

  const outputClauses = [...clauses.values()].sort((a, b) => a.token.index - b.token.index)
  const unresolved = []
  for (const token of tokens) {
    if (used.has(token.index)) continue
    const owner = outputClauses.findLast((node) => node.token.index <= token.index) ?? outputClauses[0]
    if (token.dep === 'punct' && [',',';',':','—','–'].includes(token.value)) {
      literal(owner, 'separator', [token], true)
      continue
    }
    if (token.index === 0 && token.dep === 'cc') {
      literal(owner, 'connective', [token], true)
      continue
    }
    literal(owner, 'unresolved', [token], true)
    unresolved.push({text: token.value, start: token.start, end: token.end})
  }
  return {sop: nodes.map(({id, type, fields}) => '@' + id + ' nlu.' + type + ' ' + fields.join(' ')).join('\n'), unresolved}
}
