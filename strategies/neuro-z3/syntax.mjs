import {fmtSopValue} from '../z3/src/contracts.mjs'

const literalPattern = /"(?:[^"\\]|\\.)*"|“[^”]*”|‘[^’]*’|'(?:[^'\\]|\\.)*'|[0-9]{4}-[0-9]{2}-[0-9]{2}(?![\p{L}\p{M}\p{N}_])|[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?![\p{L}\p{M}\p{N}_])|[+-]?(?:[0-9]+\.[0-9]+|\.[0-9]+)(?![\p{L}\p{M}\p{N}_])|[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu
const nominal = new Set(['NOUN', 'PROPN', 'PRON', 'NUM'])
const verbal = new Set(['VERB', 'AUX'])
const clauseDeps = new Set(['ROOT', 'ccomp', 'xcomp', 'advcl', 'relcl', 'acl', 'pcomp', 'conj', 'parataxis'])
const nounModifiers = new Set(['amod', 'det', 'nummod', 'compound', 'poss', 'quantmod', 'predet'])
const relativeWords = new Set(['who', 'whom', 'which', 'that', 'where', 'when'])
const endings = new Set(['.', '?', '!', ';', '—', ':'])
const indirect = new Set(['dative', 'iobj'])
const subject = new Set(['nsubj', 'nsubjpass', 'csubj', 'csubjpass', 'expl'])
const adjectives = new Set(['acomp', 'oprd', 'attr', 'xcomp'])
const wh = new Set(['how', 'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why'])
const namedTimeZone = /^(?:UTC|GMT|[ECMP][SD]T|CET|CEST|EET|EEST|BST|IST|JST)$/u
const chitchatVerbs = new Set(['accept', 'express', 'give', 'offer', 'receive', 'return', 'say', 'send'])
const contextualAdverbs = new Set(['already', 'also', 'finally', 'instead', 'just', 'now', 'today', 'tomorrow', 'tonight', 'yesterday'])
const lexicalResult = new Set(['make', 'paint', 'color', 'colour', 'turn', 'look', 'be', 'become', 'remain', 'seem', 'want'])
const connectiveKinds = new Map([
  ['after', 'after'], ['although', 'concession'], ['as', 'as'], ['because', 'reason'], ['before', 'before'],
  ['if', 'condition'], ['once', 'once'], ['since', 'since'], ['so', 'purpose'], ['unless', 'unless'],
  ['until', 'until'], ['when', 'when'], ['where', 'where'], ['while', 'while']
])
const atom = (value) => typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(value)
const source = (key, token) => key + '=' + fmtSopValue(token.text, {asString: true})
const ref = (key, node) => key + '=$' + node.id
const any = (items) => items.length ? '(or ' + items.join(' ') + ')' : 'false'
const all = (items) => items.length ? '(and ' + items.join(' ') + ')' : 'true'

function sourceTokens(text, dependencies) {
  const spans = []
  for (const match of text.matchAll(literalPattern)) {
    const start = match.index
    const token = match[0]
    const clitic = /^[\p{L}\p{M}].*[’'](?:s|d|m|re|ve|ll)$/iu.exec(token) &&
      /[’'](?:s|d|m|re|ve|ll)$/iu.exec(token)
    if (clitic) spans.push([start, start + clitic.index], [start + clitic.index, start + token.length])
    else spans.push([start, start + token.length])
  }
  const membership = new Map()
  let startIndex = 0
  const tokens = spans.map(([start, end], i) => {
    while (dependencies[startIndex]?.end <= start) startIndex++
    const parts = []
    for (let j = startIndex; dependencies[j]?.start < end; j++) {
      if (dependencies[j].end > start) parts.push(dependencies[j])
    }
    for (const part of parts) if (!membership.has(part.i)) membership.set(part.i, i)
    const ids = new Set(parts.map((part) => part.i))
    const main = parts.find((part) => part.dep === 'ROOT' || !ids.has(part.head)) ?? parts[0]
    const exact = text.slice(start, end)
    const compound = parts.length > 1
    const quoted = /^["'“‘]/u.test(exact) && /["'”’]$/u.test(exact)
    const numeric = /^[-+.0-9][0-9:.+-]*$/u.test(exact) && /[0-9]/u.test(exact)
    return {
      i, start, end, text: exact, lower: exact.toLowerCase().replaceAll('’', "'"), main,
      pos: quoted ? 'PROPN' : numeric ? 'NUM' : main?.pos ?? 'X', tag: main?.tag,
      dep: main?.dep ?? '', lemma: compound ? exact.toLowerCase() : main?.lemma?.toLowerCase(),
      quoted, numeric, compound, neg: parts.some((part) => part.dep === 'neg')
    }
  })
  for (const token of tokens) token.head = membership.get(token.main?.head) ?? token.i
  return tokens
}

function compoundPrepositions(text, tokens, kb) {
  const result = new Map()
  for (const lead of tokens) {
    if (!['prep', 'advmod', 'agent'].includes(lead.dep)) continue
    let key = lead.lower
    let best
    for (let end = lead.i + 1; end <= Math.min(tokens.length - 1, lead.i + 5); end++) {
      const tail = tokens[end]
      key += ' ' + tail.lower
      const qualified = end === lead.i + 1 && ['directly', 'immediately', 'just', 'right'].includes(lead.lower) &&
        kb.grammar.prepositions.get(tail.lower)?.space
      const meaning = kb.grammar.prepositions.get(key) ?? (qualified ? kb.grammar.prepositions.get(tail.lower) : undefined)
      if (!meaning || !['prep', 'agent'].includes(tail.dep)) continue
      const members = tokens.slice(lead.i, end + 1)
      const ids = new Set(members.map(({i}) => i))
      const landmark = tokens.find((token) => ids.has(token.head) && token.i > end &&
        ['pobj', 'obj', 'pcomp'].includes(token.dep))
      if (landmark) best = {members, meaning, landmark, lead,
        cue: {...lead, text: text.slice(lead.start, tail.end), members}}
    }
    if (best) {
      for (const member of best.members) result.set(member.i, best)
    }
  }
  return result
}

function buildGraph(text, dependencies, kb, lexicon) {
  const tokens = sourceTokens(text, dependencies)
  const roots = tokens.filter((token) => token.dep === 'ROOT')
  for (const root of roots) {
    const first = tokens.find((token) => token.i <= root.i && token.pos !== 'PUNCT' &&
      token.text !== '—' && !lexicon.filler.has(token.lower))
    if (!first || verbal.has(root.pos) || !nominal.has(root.pos)) continue
    const knownCommand = (kb.verbs.get(first.lower) ?? []).length ||
      (lexicon.verbFrames.get(first.lower)?.has('transitive') && first.head === root.i && first.dep === 'compound')
    if (!knownCommand || first.i >= root.i || tokens.slice(first.i + 1, root.i)
        .some((token) => token.dep === 'nsubj' || (token.pos === 'VERB' && token.tag !== 'VBG'))) continue
    Object.assign(first, {pos: 'VERB', tag: 'VB', lemma: first.lower, dep: 'ROOT', head: first.i})
    Object.assign(root, {dep: 'dobj', head: first.i})
    for (const token of tokens) {
      if (token.head === root.i && token.dep === 'punct') token.head = first.i
    }
  }
  for (const token of tokens) {
    if (!token.numeric || !['prep', 'nummod', 'pobj'].includes(token.dep)) continue
    const cue = tokens[token.i - 1]
    const zone = tokens[token.i + 1]
    if (!cue || cue.pos !== 'ADP') continue
    const isClock = token.text.includes(':')
    const isDate = /^\d{4}-\d{2}-\d{2}$/u.test(token.text)
    if (!isClock && !isDate) continue
    Object.assign(token, {dep: 'pobj', head: cue.i})
    if (isClock && namedTimeZone.test(zone?.text ?? '')) Object.assign(zone, {dep: 'amod', head: token.i})
    let host = tokens[cue.head]
    const ancestors = new Set([cue.i])
    while (host && !verbal.has(host.pos) && !ancestors.has(host.i)) {
      ancestors.add(host.i)
      host = tokens[host.head]
    }
    if (host && verbal.has(host.pos)) cue.head = host.i
  }
  for (const boundary of tokens.filter((token) => endings.has(token.text))) {
    const left = tokens.slice(0, boundary.i).reverse().find((token) => endings.has(token.text) ||
      (verbal.has(token.pos) && ['ROOT', 'ccomp', 'parataxis', 'advmod', 'conj'].includes(token.dep)))
    const right = tokens.slice(boundary.i + 1).find((token) => endings.has(token.text) || verbal.has(token.pos))
    if (!left || !right || endings.has(left.text) || endings.has(right.text)) continue
    if (left.head >= boundary.i && ['ccomp', 'advmod', 'conj'].includes(left.dep)) {
      Object.assign(left, {dep: 'ROOT', head: left.i})
    }
    if (left.dep === 'ROOT' && (left.tag === 'VB' || left.tag?.startsWith('VB'))) {
      boundary.head = left.i
    }
  }
  const children = Map.groupBy(tokens.filter((token) => token.head !== token.i), (token) => token.head)
  const dependents = (token) => children.get(token.i) ?? []
  const nodes = []
  const options = []
  const claims = new Map()
  const slots = new Map()
  const prepPhrases = compoundPrepositions(text, tokens, kb)
  const byClause = new Map()
  const byEntity = new Map()
  const discourse = new Set()
  const at = (index) => tokens[index]
  function node(type, head, root = false, fields = []) {
    const result = {type, head, root, fields, incoming: [], id: type[0] + (nodes.length + 1), variable: 'n' + nodes.length}
    nodes.push(result)
    return result
  }
  function option(owner, fields, {anchor = [], links = [], weight = 0, slot, when = [], incoming = true} = {}) {
    const variable = 'e' + options.length
    const result = {variable, owner, fields, anchor, links, when,
      weight: weight + 8 * anchor.length}
    options.push(result)
    for (const token of anchor) {
      if (!claims.has(token.i)) claims.set(token.i, [])
      claims.get(token.i).push(variable)
    }
    if (slot) {
      const key = owner.id + ':' + slot
      if (!slots.has(key)) slots.set(key, [])
      slots.get(key).push(variable)
    }
    if (incoming) for (const link of links) link.incoming.push(variable)
    return result
  }
  function literal(owner, key, token, {weight = 2, many = false, meaning, when} = {}) {
    return option(owner, [source(key, token), ...(meaning ? [meaning] : [])],
      {anchor: [token], weight, slot: many ? undefined : key, when})
  }
  function role(owner, key, target, weight = 4) {
    if (owner !== target && target) option(owner, [ref(key, target)], {links: [target], slot: key, weight})
  }
  function relation(owner, target, kind, cue, weight = 3, from = owner) {
    if (!target || owner === target) return
    const edge = node('relation', cue, false, ['kind=' + kind, ref('from', from), ref('to', target)])
    edge.incoming.push(option(owner, [], {links: [edge], weight, incoming: false}).variable)
    option(edge, cue ? [source('cue', cue)] : [], {anchor: cue?.members ?? (cue ? [cue] : []), links: [target],
      when: [edge.variable], weight: 2})
    edge.needsProduction = true
  }
  for (const token of tokens) {
    if (token.quoted || !clauseDeps.has(token.dep)) continue
    if (verbal.has(token.pos) && token.dep !== 'conj' && token.dep !== 'ROOT' && token.dep !== 'parataxis' &&
        !verbal.has(at(token.head)?.pos) && !['relcl', 'acl', 'pcomp'].includes(token.dep)) continue
    if (token.dep === 'conj' && !verbal.has(token.pos)) continue
    if (!verbal.has(token.pos) && !['ROOT', 'parataxis'].includes(token.dep)) continue
    const root = ['ROOT', 'parataxis'].includes(token.dep)
    const clause = node('clause', token, root)
    byClause.set(token.i, clause)
  }

  // A quoted or nominal root is a fragment. Genuine detached gratitude has
  // its own utterance even when the model attached it to another predicate.
  for (const token of tokens) {
    const phrase = lexicon.gratitude.has(token.lower) ? [token]
      : token.lower === 'thank' && at(token.i + 1)?.lower === 'you' ? [token, at(token.i + 1)] : []
    if (!phrase.length || phrase.some(({i}) => discourse.has(i))) continue
    const after = at(phrase.at(-1).i + 1)
    const before = at(token.i - 1)
    const finite = dependents(token).some((child) => subject.has(child.dep))
    const standalone = token.dep === 'ROOT' && !finite && !['dobj', 'obj', 'pobj', 'poss'].includes(token.dep)
    const command = at(token.head)
    const hasObject = command && dependents(command).some((item) => item.i < token.i &&
      ['dobj', 'obj', 'attr', 'oprd'].includes(item.dep) && !phrase.includes(item))
    const trailing = (!after || after.pos === 'PUNCT') && ['npadvmod', 'advmod', 'dobj', 'obj'].includes(token.dep) &&
      hasObject && !chitchatVerbs.has(command.lemma)
    const detached = !finite && (['intj', 'discourse', 'parataxis'].includes(token.dep) || trailing ||
      (before?.text === ',' && (!after || after.pos === 'PUNCT')))
    if (!standalone && !detached) continue
    if (standalone && dependents(token).some((child) =>
      ['dobj', 'obj'].includes(child.dep) && !phrase.includes(child))) continue
    const existing = byClause.get(token.i)
    const clause = existing ?? node('clause', token, true)
    byClause.set(token.i, clause)
    clause.root = true
    clause.gratitude = true
    clause.gratitudeEnd = phrase.at(-1).i
    clause.fields = ['form=fragment', 'speech_act=gratitude']
    for (const part of phrase) discourse.add(part.i)
    const evidence = {...token, text: text.slice(token.start, phrase.at(-1).end)}
    clause.required = [option(clause, [source('expression', evidence)], {anchor: phrase, weight: 5}).variable]
    for (const separator of [before, after].filter((part) => part?.text === ',')) {
      literal(clause, 'separator', separator, {weight: 4, many: true})
    }
  }

  function nominalParts(head) {
    const parts = [...dependents(head)]
    for (const part of parts) {
      if (part.dep !== 'compound') continue
      for (const nested of dependents(part)) {
        if (nested.dep === 'compound' && !parts.includes(nested)) parts.push(nested)
      }
    }
    return parts.sort((a, b) => a.i - b.i)
  }
  function entity(token) {
    if (!token || discourse.has(token.i)) return undefined
    if (byEntity.has(token.i)) return byEntity.get(token.i)
    if (!nominal.has(token.pos) && !(token.pos === 'ADJ' && ['ROOT', 'conj'].includes(token.dep))) return undefined
    const result = node('entity', token)
    byEntity.set(token.i, result)
    const key = token.pos === 'PRON' ? 'pronoun' : token.pos === 'PROPN' ? 'name'
      : token.numeric ? 'literal' : 'head'
    const kind = kb.domain.shapes.get(token.lemma ?? token.lower)
    const properParts = (key === 'name' && !token.quoted ? dependents(token)
      .filter((part) => part.pos === 'PROPN' && ['compound', 'flat', 'name'].includes(part.dep)) : [])
      .concat(token).sort((a, b) => a.i - b.i)
    const contiguous = properParts.every((part, index) => !index || part.i === properParts[index - 1].i + 1)
    const anchors = []
    if (properParts.length > 1 && contiguous) {
      const name = text.slice(properParts[0].start, properParts.at(-1).end)
      anchors.push(option(result, [source('name', {text: name})], {anchor: properParts, weight: 6, slot: key}).variable)
    }
    anchors.push(literal(result, key, token, {
      meaning: key === 'head' && atom(kind) ? 'kind=' + kind : undefined
    }).variable)
    result.required = anchors
    const colors = dependents(token).filter((part) => part.dep === 'amod' && atom(kb.domain.colours.get(part.lower)))
    for (const child of nominalParts(token)) {
      if (discourse.has(child.i) || wh.has(child.lower) || !nounModifiers.has(child.dep)) continue
      const conjunct = child.dep === 'amod' ? dependents(child).find((part) =>
        part.dep === 'conj' && part.pos === 'ADJ' && part.i === child.i + 2) : undefined
      if (conjunct && at(child.i + 1)?.dep === 'cc') {
        const members = [child, at(child.i + 1), conjunct]
        option(result, [source('modifier', {text: text.slice(child.start, conjunct.end)})],
          {anchor: members, weight: 5})
        continue
      }
      if (child.dep === 'poss' && child.pos !== 'DET' && !['my', 'your', 'his', 'her', 'its', 'our', 'their'].includes(child.lower)) {
        const possessor = entity(child)
        role(result, 'possessor', possessor)
        const marker = dependents(child).find((part) => part.dep === 'case' && /^['’]s?$/iu.test(part.text))
        if (marker && possessor) literal(result, 'possessive_marker', marker, {when: [possessor.variable]})
        continue
      }
      const slot = child.dep === 'det' || child.dep === 'poss' ? 'determiner'
        : child.dep === 'nummod' || child.dep === 'quantmod' ? 'quantity'
        : child.dep === 'compound' ? 'compound' : 'modifier'
      const color = kb.domain.colours.get(child.lower)
      literal(result, slot, child, {many: ['modifier', 'compound'].includes(slot),
        meaning: slot === 'modifier' && colors.length === 1 && atom(color) ? 'color=' + color : undefined})
      for (const degree of dependents(child).filter((part) => part.dep === 'advmod')) {
        literal(result, 'degree', degree, {many: true})
      }
    }
    return result
  }

  const coordinated = new Set()
  function coordination(head, first, produce) {
    const peers = [head]
    for (const parent of peers) {
      for (const child of dependents(parent)) {
        if (child.dep === 'conj' && produce(child) && !peers.includes(child)) peers.push(child)
      }
    }
    if (peers.length < 2) return first
    const earliest = Math.min(...peers.map(({i}) => i))
    const latest = Math.max(...peers.map(({i}) => i))
    const cues = tokens.slice(earliest + 1, latest)
      .filter((part) => (part.dep === 'cc' || part.text === ',') &&
        (peers.some(({i}) => i === part.head) || at(part.i - 1)?.text === ','))
    const group = node('coordination', head, false,
      ['kind=' + (cues.some((cue) => cue.lower === 'or') ? 'alternative' : 'additive')])
    const members = peers.toSorted((a, b) => a.i - b.i).map(produce)
    option(group, [...members.map((member) => ref('member', member)),
      ...cues.map((cue) => source('cue', cue))], {anchor: cues, links: members, weight: 4})
    group.needsProduction = true
    for (const item of peers.slice(1)) coordinated.add(item.i)
    return group
  }

  for (const clause of byClause.values()) {
    const root = clause.head
    const children = dependents(root)
    const hasSubject = children.some((token) => subject.has(token.dep))
    const courtesyEnd = clause.gratitude ? at(clause.gratitudeEnd + 1) : undefined
    const final = (courtesyEnd && endings.has(courtesyEnd.text) ? courtesyEnd : undefined) ?? children.findLast((token) => token.dep === 'punct' && endings.has(token.text)) ??
      (root.dep === 'ROOT' && endings.has(tokens.at(-1)?.text) ? tokens.at(-1) : undefined)
    const relative = root.dep === 'relcl' ? children.find((token) => relativeWords.has(token.lower)) : undefined
    const questionWord = !relative && (root.dep === 'ROOT' || final?.text === '?') ?
      children.find((token) => wh.has(token.lower)) ??
      tokens.find((token) => wh.has(token.lower) && token.i < root.i && at(token.head)?.head === root.i) : undefined
    const auxiliaries = children.filter((token) => ['aux', 'auxpass', 'cop'].includes(token.dep))
    const subjectIndex = children.find((token) => subject.has(token.dep))?.i
    const inversion = subjectIndex !== undefined && [root, ...auxiliaries].some((token) =>
      token.pos === 'AUX' && token.i < subjectIndex)
    const marker = children.find((token) => (token.dep === 'mark' || token.dep === 'aux') && token.lower === 'to')
    const isVerbal = verbal.has(root.pos)
    const form = !isVerbal ? 'fragment' : relative ? 'declarative'
      : questionWord || final?.text === '?' || inversion ? 'interrogative'
      : marker || (!hasSubject && root.dep !== 'ROOT' && ['VBG', 'VB'].includes(root.tag) && root.dep !== 'conj') ? 'nonfinite'
      : hasSubject || !['VB', 'VBP', ''].includes(root.tag ?? '') ? 'declarative' : 'imperative'
    if (!clause.gratitude) {
      clause.fields.push('form=' + form)
      if (form === 'fragment') {
        const topic = entity(root)
        role(clause, 'topic', topic, 5)
      } else {
        clause.required = [literal(clause, 'predicate', root, {weight: 5}).variable]
        clause.fields.push('polarity=' + (children.some((token) => token.neg || token.dep === 'neg') ? 'negative' : 'positive'))
      }
      if (marker) literal(clause, 'marker', marker, {weight: 4})
      if (questionWord) literal(clause, 'question', questionWord, {weight: 5})
    }
    if (final) literal(clause, 'terminator', final, {weight: clause.gratitude ? 9 : 5})

    for (const token of children) {
      if (discourse.has(token.i) || prepPhrases.has(token.i) || token === marker || token === relative || token === questionWord || token === final) continue
      if (subject.has(token.dep) || ['dobj', 'obj', 'attr', 'oprd'].includes(token.dep) || indirect.has(token.dep)) {
        const target = entity(token)
        if (target) {
          const group = coordination(token, target, entity)
          const key = subject.has(token.dep) ? 'subject' : indirect.has(token.dep) ? 'indirect_object'
            : ['attr', 'oprd'].includes(token.dep) ? 'predicative_entity' : 'direct_object'
          role(clause, key, group, 6)
        }
      }
      if (token.dep === 'ccomp' && !verbal.has(token.pos) && lexicalResult.has(root.lemma)) {
        const color = kb.domain.colours.get(token.lower)
        const target = dependents(token).find((part) => subject.has(part.dep)) ??
          (atom(color) ? dependents(token).find((part) => part.dep === 'compound' && nominal.has(part.pos)) : undefined)
        const object = entity(target)
        if (object && (token.pos === 'ADJ' || atom(color))) {
          literal(clause, 'result_complement', token, {weight: 6,
            meaning: atom(color) ? 'result_color=' + color : undefined})
          role(clause, 'direct_object', object, 6)
        } else if (object) {
          role(clause, 'predicative_entity', entity(token), 5)
          role(clause, 'direct_object', object, 5)
        }
      }
      if (['dobj', 'obj'].includes(token.dep) && lexicalResult.has(root.lemma)) {
        const result = dependents(token).find((part) => part.dep === 'amod' && part.tag === 'JJR' && part.i > token.i)
        if (result) {
          literal(clause, 'result_complement', result, {weight: 7})
          const degree = dependents(result).find((part) => part.dep === 'npadvmod')
          if (degree) {
            const members = [...dependents(degree), degree].sort((a, b) => a.i - b.i)
            if (members.every((part, i) => !i || part.i === members[i - 1].i + 1)) {
              option(clause, [source('degree', {text: text.slice(members[0].start, degree.end)})],
                {anchor: members, weight: 3})
            }
          }
        }
      }
      if (token.dep === 'neg' || token.neg && token.pos !== 'AUX') literal(clause, 'negation', token, {many: true})
      else if (auxiliaries.includes(token)) literal(clause, 'auxiliary', token, {many: true})
      else if (token.dep === 'prt' || (token.dep === 'prep' &&
          !(dependents(token).some((part) => ['pobj', 'pcomp', 'obj'].includes(part.dep))) &&
          (kb.verbs.has(root.lemma + ' ' + token.lower) || kb.actionSpecs.has(root.lemma + ' ' + token.lower)))) literal(clause, 'particle', token, {many: true})
      else if ((token.dep === 'advmod' && token.pos === 'ADV') || contextualAdverbs.has(token.lower)) literal(clause, 'adverb', token, {many: true})
      else if ((adjectives.has(token.dep) || token.dep === 'advmod' && token.tag === 'JJR' && isVerbal) &&
          token.pos === 'ADJ') {
        const color = kb.domain.colours.get(token.lower)
        const licensed = token.dep !== 'xcomp' || lexicalResult.has(root.lemma)
        literal(clause, 'result_complement', token, {weight: licensed ? 6 : 1,
          meaning: licensed && atom(color) ? 'result_color=' + color : undefined})
        for (const degree of dependents(token).filter((part) => part.dep === 'advmod')) {
          literal(clause, 'degree', degree, {many: true})
        }
      }
      const child = byClause.get(token.i)
      if (!child || token.dep === 'conj' || child.root) continue
      if (token.dep === 'ccomp' || token.dep === 'xcomp') {
        const group = coordination(token, child, (part) => byClause.get(part.i))
        role(clause, 'clausal_complement', group, 6)
        const complementizer = dependents(token).find((part) => part.dep === 'mark' && ['if', 'that', 'whether'].includes(part.lower))
        if (complementizer) literal(child, 'marker', complementizer, {weight: 4})
      } else if (token.dep === 'advcl') {
        const cue = dependents(token).find((part) => part.dep === 'mark' && connectiveKinds.has(part.lower))
        relation(clause, child, connectiveKinds.get(cue?.lower) ?? 'adjunct_clause', cue)
      }
    }
  }

  for (const root of byClause.values()) {
    if (!root.root || coordinated.has(root.head.i)) continue
    const group = coordination(root.head, root, (part) => byClause.get(part.i))
    if (group !== root) group.root = true
  }

  // Open-class PP and postnominal-clause attachment uses the dependency head;
  // transparent function labels remain available without forcing a domain act.
  for (const token of tokens) {
    const attachment = byEntity.get(token.head) ?? byClause.get(token.head)
    if (attachment && ['appos', 'npadvmod'].includes(token.dep) && !contextualAdverbs.has(token.lower) &&
        !discourse.has(token.i) && !(token.lower === 'thanks' && !attachment.gratitude)) {
      relation(attachment, entity(token), token.dep === 'appos' ? 'apposition' : 'nominal_adjunct')
    }
    const phrase = prepPhrases.get(token.i)
    if (attachment && (phrase ? phrase.lead === token : token.dep === 'prep' || token.dep === 'agent')) {
      const landmark = phrase?.landmark ?? dependents(token).find((part) => ['pobj', 'obj', 'pcomp'].includes(part.dep))
      const target = landmark && (byClause.get(landmark.i) ?? entity(landmark))
      if (target) {
        const group = coordination(landmark, target, target.type === 'entity' ? entity : (part) => byClause.get(part.i))
        const kbPrep = phrase?.meaning ?? kb.grammar.prepositions.get(token.lower)
        const label = attachment.gratitude && token.lower === 'for' ? 'reason'
          : token.dep === 'agent' && dependents(attachment.head).some((part) => part.dep === 'auxpass') ? 'agent'
          : landmark.numeric && token.lower === 'at' && landmark.text.includes(':') ? 'time'
          : landmark.numeric && token.lower === 'on' && landmark.text.includes('-') ? 'date'
          : token.lower === 'by' && attachment.type === 'entity' ? 'by'
          : kbPrep?.rel ?? token.lower
        const cue = phrase?.cue ?? token
        relation(attachment, group, atom(label) ? label : 'prepositional', cue, 5)
        if (kbPrep?.space && attachment.type === 'entity') {
          const predicates = byClause.get(attachment.head.head)
          if (predicates && ['move', 'place', 'position', 'put', 'set', 'shift'].includes(predicates.head.lemma)) {
            relation(predicates, group, atom(label) ? label : 'prepositional', cue, 4)
          }
        }
      }
    }
    if (attachment?.type === 'entity' && ['relcl', 'acl'].includes(token.dep)) {
      const child = byClause.get(token.i)
      const marker = dependents(token).find((part) => relativeWords.has(part.lower))
      if (child) relation(attachment, child, !marker ? 'nominal_clause' :
        subject.has(marker.dep) ? 'subject_relative' : 'object_relative', marker)
    }
  }

  for (const token of tokens.filter((part) => contextualAdverbs.has(part.lower) &&
      !discourse.has(part.i) && !byClause.has(part.head))) {
    let ancestor = at(token.head)
    const visited = new Set([token.i])
    while (ancestor && !visited.has(ancestor.i) && !byClause.has(ancestor.i)) {
      visited.add(ancestor.i)
      ancestor = at(ancestor.head)
    }
    if (ancestor && byClause.has(ancestor.i)) {
      literal(byClause.get(ancestor.i), 'adverb', token, {many: true})
    }
  }

  if (!nodes.some((item) => item.type === 'clause' && item.root)) {
    const first = tokens.find((token) => token.pos !== 'PUNCT')
    const fragment = node('clause', first ?? tokens[0], true, ['form=fragment'])
    role(fragment, 'topic', entity(first))
  }
  for (const token of tokens.filter((part) => ['intj', 'discourse', 'vocative'].includes(part.dep) &&
      !discourse.has(part.i) && lexicon.filler.has(part.lower))) {
    const owner = byClause.get(token.head) ?? [...byClause.values()].find((clause) => clause.root)
    if (owner) literal(owner, 'filler', token, {many: true, weight: 1})
  }
  return {tokens, nodes, options, claims, slots}
}

export async function analyseDependencies(text, dependencies, {kb, lexicon, runner, timeout, topK = 2}) {
  const graph = buildGraph(text, dependencies, kb, lexicon)
  const {tokens, nodes, options, claims, slots} = graph
  const query = [...nodes, ...options].map(({variable}) => variable)
  const smt = query.map((variable) => '(declare-const ' + variable + ' Bool)')
  const assert = (formula) => smt.push('(assert ' + formula + ')')
  const prefer = (variable, weight) => {
    if (weight > 0) smt.push('(assert-soft ' + variable + ' :weight ' + weight + ')')
  }
  const atMostOne = (variables) => {
    if (variables.length > 1) assert('((_ at-most 1) ' + variables.join(' ') + ')')
  }
  const productions = Map.groupBy(options, ({owner}) => owner)
  for (const node of nodes) {
    if (node.root) assert(node.variable)
    else assert('(=> ' + node.variable + ' ' + any(node.incoming) + ')')
    if (node.required) assert('(=> ' + node.variable + ' ' + any(node.required) + ')')
    if (node.needsProduction) {
      const choices = (productions.get(node) ?? []).filter(({anchor, links}) => anchor.length || links.length)
      assert('(=> ' + node.variable + ' ' + any(choices.map(({variable}) => variable)) + ')')
    }
  }
  for (const {variable, owner, links, when, weight} of options) {
    assert('(=> ' + variable + ' ' + all([owner.variable, ...links.map((link) => link.variable), ...when]) + ')')
    prefer(variable, weight)
  }
  for (const variables of [...claims.values(), ...slots.values()]) atMostOne(variables)
  const solved = await runner.solve(smt.join('\n'), query, {
    timeout, topK: Math.min(3, Math.max(1, topK)), objectiveSlack: 3, blockVars: options.map(({variable}) => variable)
  })
  const analyses = []
  const seen = new Set()
  for (const [i, model] of solved.solutions.entries()) {
    const active = nodes.filter(({variable}) => model.get(variable))
    const selected = options.filter(({variable}) => model.get(variable))
    const assigned = new Set(selected.flatMap(({anchor}) => anchor.map(({i}) => i)))
    const fields = new Map(active.map((item) => [item, [...item.fields]]))
    for (const item of selected) fields.get(item.owner).push(...item.fields)
    const clauses = active.filter(({type}) => type === 'clause').sort((a, b) => a.head.i - b.head.i)
    const unresolved = []
    for (const token of tokens.filter(({i}) => !assigned.has(i))) {
      const owner = clauses.findLast(({head}) => head.i <= token.i) ?? clauses[0]
      if (!owner) continue
      fields.get(owner).push(source('unresolved', token))
      unresolved.push({text: token.text, start: token.start, end: token.end})
    }
    const sop = active.map((item) => '@' + item.id + ' nlu.' + item.type + ' ' + fields.get(item).join(' ')).join('\n')
    if (seen.has(sop)) continue
    seen.add(sop)
    analyses.push({sop, objective: solved.objectives[i], unresolved})
  }
  return {analyses, analysisDiagnostics: {solver: 'z3', status: solved.status, error: solved.error,
    dependencyProductions: options.length}}
}
