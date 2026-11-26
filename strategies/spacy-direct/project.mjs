import {repairClauseBoundaries, separateQuestionRestarts, separateWrittenClauses} from './clause-boundaries.mjs'
import {collectExplicitValues} from './explicit-literals.mjs'
import {repairPredicateAttachments} from './predicate-attachments.mjs'
import {repairNominalRoles} from './nominal-roles.mjs'

const evidencePattern = /"(?:[^"\\]|\\.)*"|“[^”]*”|(?<![\p{L}\p{N}])‘[^’\n]*’(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])'(?:\\.|[^'\\\n])+'(?![\p{L}\p{N}])|\d{4}-\d{2}-\d{2}(?![\p{L}\p{M}\p{N}_])|\d{1,2}:\d{2}(?::\d{2})?(?![\p{L}\p{M}\p{N}_])|[+-]?(?:\d+\.\d+|\.\d+)(?![\p{L}\p{M}\p{N}_])|[\p{L}\p{M}]+(?:[-‐‑][\p{L}\p{M}\p{N}]+)+|[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu
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
  ['before', 'before'], ['after', 'after'], ['until', 'until'], ['till', 'until'], ['while', 'while'],
  ['when', 'when'], ['where', 'where'], ['since', 'since'], ['once', 'once'], ['so', 'purpose']
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
const subordinatePhrases = new Map([
  ['as long as', 'condition'], ['as soon as', 'when'], ['even if', 'condition'],
  ['even though', 'concession'], ['in case', 'condition'], ['so that', 'purpose']
])
const questionModifiers = new Set(['many', 'much', 'few', 'long', 'far', 'old', 'early', 'late', 'often',
  'high', 'low', 'big', 'large', 'small', 'tall', 'short', 'wide', 'deep', 'close', 'fast', 'quickly'])
const polarQuestionVerbs = new Set(['ask', 'check', 'confirm', 'decide', 'determine', 'discover', 'know', 'see', 'wonder'])
const locativeClauseVerbs = new Set(['keep', 'leave', 'place', 'put', 'set', 'stay'])
const recipientComplementVerbs = new Set(['ask', 'inform', 'notify', 'remind', 'show', 'teach', 'tell'])
const clauseMarkers = new Set(['if', 'whether', 'that'])
const reportingVerbs = new Set(['call', 'contain', 'label', 'name', 'print', 'quote', 'read', 'rename', 'say', 'type', 'write'])
const greeting = new Set(['hey', 'hello', 'hi', 'please'])
const gratitude = new Set(['thanks', 'thx'])
const discourseActs = new Map([
  ['hey','greeting'], ['hello','greeting'], ['hi','greeting'], ['ok','acknowledgment'],
  ['okay','acknowledgment'], ['fine','acknowledgment'], ['sure','assent'], ['yes','affirmation'],
  ['no','rejection'], ['hmm','hesitation'], ['uh','hesitation'], ['um','hesitation'],
  ['sorry','apology'], ['right','acknowledgment']
])
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
  const tokens = collectExplicitValues(text,spans).map(([start, end, structured], index) => {
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
    return {index, start, end, value, quoted, structured, numeric, lower: value.toLowerCase().replaceAll('’', "'"),
      head: root?.head, dep: root?.dep, lemma: root?.lemma?.toLowerCase(), tag: root?.tag, pos: quoted || structured ? 'PROPN' : numeric ? 'NUM' : root?.pos,
      negated: parts.some((part) => part.dep === 'neg')}
  })
  for (const token of tokens) token.head = positions.get(token.head) ?? token.index
  for (const token of tokens) {
    if (token.structured) {
      const previous = tokens[token.index-1]
      if (previous && nouns.has(previous.pos) && previous.head !== token.index) {
        token.dep = 'appos'
        token.head = previous.index
        token.nominalRelation = 'value'
      } else if (previous?.pos === 'VERB' && previous.head !== token.index) {
        token.dep = 'dobj'
        token.head = previous.index
      }
    }
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
  // A nominal root can receive a spurious determiner edge even when
  // the tagger correctly recognizes an initial base-form verb.
  const first = tokens[0]
  const nominal = first && tokens[first.head]
  if (first?.pos === 'VERB' && first.tag === 'VB' && first.dep === 'det' &&
      nominal?.dep === 'ROOT' && nouns.has(nominal.pos)) {
    first.dep = 'ROOT'
    first.head = first.index
    nominal.dep = 'dobj'
    nominal.head = first.index
  }
  return tokens
}

export function projectDependencies(text, dependencies) {
  const tokens = align(text, dependencies)
  const nominalPairs = repairNominalRoles(tokens) ?? []
  repairClauseBoundaries(tokens)
  const restarted = separateQuestionRestarts(tokens)
  const writtenSequences = separateWrittenClauses(tokens)
  repairPredicateAttachments(tokens)
  const children = Map.groupBy(tokens.filter((token) => token.head !== token.index), (token) => token.head)
  const under = (token) => children.get(token.index) ?? []
  // Generic dependency arcs often connect consecutive imperatives in
  // unedited input. Require an overt boundary and a governed argument.
  const sequenced = new Map()
  for (const token of tokens) {
    if (token.dep !== 'dep' || !verbs.has(token.pos) || token.index <= token.head ||
        !verbs.has(tokens[token.head]?.pos)) continue
    const cue = tokens[token.index - 1]
    const ordered = ['then', 'next', 'finally', 'subsequently'].includes(cue?.lower)
    const mark = ordered ? tokens[token.index - 2] : cue
    if (mark?.value !== ',' || mark.index <= token.head) continue
    if (!under(token).some(part => roles.has(part.dep) || subject.has(part.dep) ||
        ['ccomp', 'xcomp'].includes(part.dep))) continue
    token.dep = 'conj'
    if (ordered) sequenced.set(token.index, cue)
  }
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
  const sourceRoles = new Map()
  const entities = new Map()
  const clauses = new Map()
  const groups = new Map()
  const deferredModifiers = new Set()
  const resultDependents = new Map()
  const courtesy = new Map()
  const speechActs = new Map()
  function make(type, token, fields = []) {
    const node = {id: 'n' + (nodes.length + 1), type, token, fields, slots: new Set()}
    nodes.push(node)
    return node
  }
  function literal(node, key, parts, repeat = false) {
    if (parts.some((part, i) => i > 0 && part.index !== parts[i - 1].index + 1)) return false
    if (!parts.length || (!repeat && node.slots.has(key)) || parts.some(({index}) => used.has(index))) return false
    for (const {index} of parts) {
      used.add(index)
      sourceRoles.set(index,{node,key})
    }
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
    const label = discourseActs.get(token.lower)
    // Punctuation and dependency function distinguish an independent "right,"
    // or "no!" from a direction or a negative determiner inside a clause.
    const before = tokens[token.index - 1]
    const isolated = (!before || before.pos === 'PUNCT') && (!next || next.pos === 'PUNCT')
    const interjection = label && isolated && ['intj','discourse','ROOT','parataxis'].includes(token.dep)
    const phrase = gratitude.has(token.lower) || interjection ? [token] :
      token.lower === 'thank' && next?.lower === 'you' ? [token, next] : []
    if (!phrase.length || token.quoted || under(token).some((part) => subject.has(part.dep) || possessiveDeterminers.has(part.lower))) continue
    const after = tokens[phrase.at(-1).index + 1]
    const tail = !after || ending.has(after.value) || after.value === ','
    const head = tokens[token.head]
    const hasPriorObject = head && under(head).some((part) => roles.has(part.dep) && part.index < token.index)
    const marked = ['ROOT', 'intj', 'discourse', 'parataxis'].includes(token.dep) ||
      tail && (tokens[token.index - 1]?.value === ',' || token.dep === 'npadvmod' && hasPriorObject)
    if (marked) {
      courtesy.set(token.index, phrase)
      speechActs.set(token.index, interjection ? label : 'gratitude')
    }
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
  const qualifiedAdjectives = new Set(tokens.filter(t => t.pos === 'ADJ' &&
    ['amod','appos','oprd','acomp','attr','ccomp'].includes(t.dep) && !under(t).some(child => child.dep === 'det') &&
    under(t).some(child => child.dep === 'prep' && under(child).some(arg => ['pobj','obj','pcomp'].includes(arg.dep))))
    .map(t => t.index))
  const reducedPredicates = new Set(tokens.filter(token => token.pos === 'ADJ' &&
    (token.dep === 'advcl' || ['ccomp','xcomp'].includes(token.dep) &&
      under(token).some(t => verbs.has(t.pos) && ['ccomp','xcomp'].includes(t.dep)))).map(t => t.index))
  for (const token of tokens) {
    if (qualifiedAdjectives.has(token.index) || reducedPredicates.has(token.index) || token.dep === 'ROOT' || courtesy.has(token.index) || prefixTopics.has(token.index) ||
        token.dep === 'dep' && verbs.has(token.pos) && boundaries.get(token.head)?.index < token.index ||
        verbs.has(token.pos) && adjuncts.has(token.dep)) {
      clauses.set(token.index, make('clause', token))
    }
  }
  if (!clauses.size) clauses.set(tokens[0].index, make('clause', tokens[0]))

  const measurementHeads = new Map()
  for (const property of tokens.filter(t => t.pos === 'ADJ' || t.pos === 'ADV')) {
    const measure = under(property).find(t => ['npadvmod','advmod','quantmod','nummod'].includes(t.dep) &&
      (t.pos === 'NUM' || nouns.has(t.pos) && under(t).some(c => c.dep === 'nummod')))
    if (measure) measurementHeads.set(property.index,measure)
  }

  function entity(token) {
    if (!token || courtesy.has(token.index)) return
    // Command names often have a verbal lexical tag even when the parser
    // places them in an explicit nominal argument position.
    const commandName = verbs.has(token.pos) && ['pobj','dobj','obj','appos'].includes(token.dep) &&
      /^\p{Lu}/u.test(token.value) && !under(token).some(child => subject.has(child.dep) || child.dep === 'aux')
    const nominalAdjective = token.pos === 'ADJ' && (token.dep === 'pobj' ||
      ['dobj', 'obj', 'conj', 'appos'].includes(token.dep) &&
      (under(token).some(t => t.dep === 'det') || ['other','more','less','fewer','enough'].includes(token.lower)))
    const unknownNoun = token.pos === 'X' && ['obj','dobj','iobj','pobj','nsubj','attr'].includes(token.dep) && /\p{L}/u.test(token.value)
    const nominalAdverb = token.pos === 'ADV' && token.dep === 'pobj' && ['now','then','here','there','today','tomorrow','yesterday'].includes(token.lower)
    if (!commandName && !nominalAdjective && !measurementHeads.has(token.index) &&
        !unknownNoun && !nominalAdverb && !nouns.has(token.pos)) return
    if (entities.has(token.index)) return entities.get(token.index)
    if (used.has(token.index)) return
    const node = make('entity', token)
    entities.set(token.index, node)
    const key = token.quoted || token.structured ? 'literal' : (token.nominalName || commandName || token.pos === 'PROPN') ? 'name' : token.numeric ? 'literal' : token.pos === 'PRON' ? 'pronoun' : 'head'
    const titleParts = []
    if (key === 'name' && token.dep === 'appos') {
      // Printed titles may contain numbers and capitalized common nouns.
      // Only group an uninterrupted sequence of nominal source tokens.
      const visit = [token]
      for (const word of visit) {
        for (const child of under(word)) {
          if (['compound', 'flat', 'name', 'dep', 'nummod'].includes(child.dep) && nouns.has(child.pos) &&
              (child.pos === 'NUM' || /^\p{Lu}/u.test(child.value)) && !visit.includes(child)) visit.push(child)
        }
      }
      titleParts.push(...visit.sort((a,b) => a.index - b.index))
    }
    const parts = [token, ...under(token).filter((part) => part.pos === 'PROPN' && ['compound', 'flat', 'name'].includes(part.dep))]
      .sort((a, b) => a.index - b.index)
    const namedSpan = token.nominalName?.map(index => tokens[index]) ?? []
    if (!literal(node, key, namedSpan) && !literal(node, key, titleParts) && (key !== 'name' || !literal(node, key, parts))) literal(node, key, [token])
    const measure = measurementHeads.get(token.index)
    if (measure && measure !== token) {
      const amount = entity(measure)
      if (amount) node.fields.push(ref('measure',amount))
    }
    for (const part of under(token)) {
      if (used.has(part.index) || qualifiedAdjectives.has(part.index)) continue
      if (part.dep === 'compound' && nouns.has(part.pos) &&
          under(part).some(child => modifiers.has(child.dep) || child.dep === 'poss')) {
        relation(node, entity(part), 'nominal_compound')
        continue
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
        if (slot === 'modifier') {
          const inner = under(part).find(child => child.dep === 'amod' && child.pos === 'ADJ' && child.index + 1 === part.index)
          if (inner) chain.unshift(inner)
        }
        if (slot === 'quantity') {
          const comparative = under(part).find(child => child.dep === 'amod' && child.tag === 'JJR' &&
            child.index === part.index + 1)
          if (comparative) chain.push(comparative)
        }
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
    const sequenceCues = peers.map(part => sequenced.get(part.index)).filter(Boolean)
    const kind = cues.some(part => part.lower === 'or') ? 'alternative'
      : cues.some(part => part.lower === 'but') ? 'contrast'
      : sequenceCues.length ? 'sequence' : 'additive'
    const result = make('coordination', token, ['kind=' + kind, ...peers.map((part) => ref('member', lookup(part)))])
    for (const cue of [...cues, ...sequenceCues].sort((a,b) => a.index-b.index)) literal(result, 'cue', [cue], true)
    groups.set(base, result)
    return result
  }

  for (const {left,right,cue} of writtenSequences) {
    const sequence = make('coordination',cue[0],['kind=sequence',
      ref('member',clauses.get(left.index)),ref('member',clauses.get(right.index))])
    literal(sequence,'cue',cue,true)
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
  const joiningAdverbs = new Set(sequenced.values())
  const groupHeads = [...clauses.values()].filter(({token}) => token.dep !== 'conj')
  const clauseOf = (token) => clauses.get(token.index)
  function questionPhrase(head, parts, {proposal = false} = {}) {
    const candidates = [...parts]
    for (const part of parts) {
      if (nouns.has(part.pos) || ['ADJ', 'ADV'].includes(part.pos)) {
        candidates.push(...under(part))
        for (const modifier of under(part)) {
          if (questionModifiers.has(modifier.lower)) candidates.push(...under(modifier))
        }
      }
    }
    const word = candidates.filter((part) => questions.has(part.lower)).sort((a, b) => a.index - b.index)[0]
    if (!word) return []
    const next = tokens[word.index + 1]
    if (proposal) {
      return ['how', 'what'].includes(word.lower) && next?.lower === 'about' && candidates.includes(next) &&
        next.index < head.index ? [word, next] : []
    }
    if (word.lower === 'how' && next && questionModifiers.has(next.lower) && candidates.includes(next) &&
        (word.head === next.index || next.head === word.index || next.head === head.index)) return [word, next]
    return [word]
  }

  function subordinateCue(parts) {
    const lead = parts.find((part) => part.dep === 'mark' && subordinators.has(part.lower)) ??
      parts.find((part) => part.dep === 'advmod' && ['where', 'when'].includes(part.lower))
    // Multiword candidates must stay within the dependent clause's cue tokens.
    const cueTokens = new Set(parts.filter((part) => ['mark', 'advmod', 'fixed', 'mwe'].includes(part.dep)))
    for (const part of cueTokens) {
      for (const child of under(part)) {
        if (['mark', 'advmod', 'fixed', 'mwe'].includes(child.dep)) cueTokens.add(child)
      }
    }
    for (const part of [...cueTokens].sort((a, b) => a.index - b.index)) {
      for (const [phrase, kind] of subordinatePhrases) {
        const words = phrase.split(' ')
        if (part.lower !== words[0]) continue
        const span = tokens.slice(part.index, part.index + words.length)
        if (span.length === words.length && span.every((token, i) => cueTokens.has(token) && token.lower === words[i])) {
          return {kind, span}
        }
      }
    }
    return lead ? {kind: subordinators.get(lead.lower), span: [lead]} : {kind: 'adverbial_clause', span: []}
  }

  function locativeComplement(token) {
    if (!['ccomp', 'xcomp'].includes(token.dep) || !locativeClauseVerbs.has(tokens[token.head]?.lemma)) return
    return under(token).find((part) => part.lower === 'where' && part.dep === 'advmod')
  }

  const attachments = new Map()
  for (const node of [...clauses.values()].sort((a, b) => a.token.index - b.token.index)) {
    const token = node.token
    const parts = under(token)
    const expression = courtesy.get(token.index)
    if (expression) {
      node.fields.push('form=fragment', 'speech_act='+speechActs.get(token.index))
      literal(node, 'expression', expression)
      const before = tokens[token.index - 1]
      if (before?.value === ',') literal(node, 'separator', [before])
      const after = tokens[expression.at(-1).index + 1]
      if (after && ['.', '!', '?'].includes(after.value)) literal(node, 'terminator', [after])
      else if (after && [',', ';', '—', ':'].includes(after.value)) literal(node, 'separator', [after], true)
      continue
    }
    const final = boundaries.get(token.index) ?? parts.findLast((part) => part.dep === 'punct' && ending.has(part.value) && !courtesyTerminators.has(part.index) && !boundaryMarks.has(part))
    const endingSpan = final ? [final] : []
    if (final && /^[.?!]$/u.test(final.value)) {
      for (let i = final.index - 1; i >= 0 && /^[.?!]$/u.test(tokens[i].value) &&
           tokens[i].end === tokens[i+1].start && tokens[i].head === final.head; --i) endingSpan.unshift(tokens[i])
    }
    const questionEnding = endingSpan.some(t => t.value === '?')
    const marker = parts.find((part) => ['mark', 'aux'].includes(part.dep) && part.lower === 'to')
    const relative = token.dep === 'relcl'
    const relativizer = relative && (parts.find((part) => questions.has(part.lower) || part.lower === 'that') ??
      parts.flatMap(under).find((part) => part.lower === 'whose' && ['poss', 'det'].includes(part.dep)))
    const interrogativeContext = ['ROOT', 'parataxis', 'ccomp', 'xcomp', 'pcomp'].includes(token.dep) || questionEnding
    const polar = token.dep === 'ccomp' && polarQuestionVerbs.has(tokens[token.head]?.lemma) &&
      parts.find((part) => part.dep === 'mark' && ['if', 'whether'].includes(part.lower))
    const locationCue = locativeComplement(token)
    const fusedRelative = token.dep === 'ccomp' && tokens[token.head].lemma === 'be' &&
      parts.some(t => ['what','whoever','whatever'].includes(t.lower) && (roles.has(t.dep) || subject.has(t.dep)))
    const question = !verbs.has(token.pos) ? questionPhrase(token, parts, {proposal: true})
      : relative || fusedRelative || locationCue || !interrogativeContext ? [] : polar ? [polar] : questionPhrase(token, parts)
    const grammaticalSubject = parts.find((part) => subject.has(part.dep))
    const inversion = grammaticalSubject && [token, ...parts.filter((part) => part.dep === 'aux')]
      .some((part) => part.pos === 'AUX' && part.index < grammaticalSubject.index)
    const independent = boundaries.has(token.index) && token.head > boundaries.get(token.index).index
    const form = reducedPredicates.has(token.index) || qualifiedAdjectives.has(token.index) ? 'nonfinite' : !verbs.has(token.pos) ? 'fragment' : relative ? 'declarative'
      : marker || !independent && !grammaticalSubject &&
        ['acl', 'advcl', 'xcomp', 'pcomp'].includes(token.dep) && ['VB', 'VBG', 'VBN'].includes(token.tag) ? 'nonfinite'
      : questionEnding || question.length || inversion ? 'interrogative'
      : grammaticalSubject || !['VB', 'VBP'].includes(token.tag) ? 'declarative' : 'imperative'
    node.fields.push('form=' + form)
    if (restarted.has(token.index)) node.fields.push('completion=interrupted')
    if (final) {
      const interior = ['—',':'].includes(final.value) && final.index + 1 < tokens.length && !boundaryMarks.has(final)
      literal(node, interior ? 'separator' : 'terminator', endingSpan, interior)
    }
    literal(node, 'question', question)
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
    else if (token.dep === 'ccomp') {
      const complementizer = parts.find((part) => part.dep === 'mark' && clauseMarkers.has(part.lower))
      if (complementizer) literal(node, 'marker', [complementizer])
    }
    if (relativizer) attachments.set(token.index, relativizer)
    for (const part of parts) {
      if (part.dep === 'restart_mark') literal(node, 'marker', [part])
      if (joiningAdverbs.has(part) || part === marker || question.includes(part) || part === relativizer || part === locationCue || courtesy.has(part.index) || compoundCues.has(part.index) || internalCues.has(part.index)) continue
      const reportedQuote = part.quoted && ['ccomp', 'xcomp', 'dep'].includes(part.dep) && reportingVerbs.has(token.lemma)
      const recipient = ['dobj', 'obj'].includes(part.dep) && recipientComplementVerbs.has(token.lemma) &&
        parts.some((item) => ['ccomp', 'xcomp'].includes(item.dep) && clauses.has(item.index))
      const slot = reportedQuote ? 'direct_object' : subject.has(part.dep) ? 'subject'
        : recipient ? 'indirect_object' : roles.get(part.dep)
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
          if (measurementHeads.has(part.index)) {
            const property = coordinate(part,entity(part),entity)
            if (property) {
              node.fields.push(ref('predicative_entity',property))
              node.slots.add('predicative_entity')
            }
          } else if (part.pos === 'ADJ') attachedResult = literal(node, 'result_complement', [part])
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
      const adjectivalComplement = !qualifiedAdjectives.has(part.index) &&
        (part.pos === 'ADJ' && ['acomp', 'attr', 'oprd', 'xcomp'].includes(part.dep) ||
          part.pos === 'ADV' && part.dep === 'oprd')
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
      const childLocation = child && locativeComplement(part)
      if (childLocation && !separated) {
        relation(node, coordinate(part, child, clauseOf), 'where', [childLocation])
      } else if (child && !separated && ['xcomp', 'ccomp'].includes(part.dep) && !node.slots.has('clausal_complement')) {
        node.fields.push(ref('clausal_complement', coordinate(part, child, clauseOf)))
        node.slots.add('clausal_complement')
      }
      if (child && !separated && part.dep === 'advcl') {
        const {kind, span} = subordinateCue(under(part))
        relation(node, coordinate(part, child, clauseOf), kind, span)
      }
    }
  }
  for (const node of groupHeads) coordinate(node.token, node, clauseOf)

  for (const pair of nominalPairs) {
    const from = entity(tokens[pair.from]) ?? clauses.get(pair.from)
    const to = entity(tokens[pair.to])
    relation(from, to, pair.kind, (pair.cue ?? []).map(index => tokens[index]))
  }

  const prepRelations = new Map()
  for (const from of nodes) {
    if (!['clause', 'entity'].includes(from.type)) continue
    const {token: host} = from
    // A nominal root owns its prepositions through its topic entity.
    if (from.type === 'clause' && entities.has(host.index)) continue
    const attached = [...under(host), ...(resultDependents.get(from) ?? [])]
    for (const part of attached) {
      if (part.pos === 'ADV' && !compoundCues.has(part.index)) {
        for (const child of under(part)) {
          if (child.dep === 'prep') attached.push(child)
          if (child.dep === 'npadvmod' && nouns.has(child.pos) && !used.has(child.index)) {
            relation(from, entity(child), 'extent')
          }
        }
      }
      if (qualifiedAdjectives.has(part.index) && part !== host) {
        const state = clauseOf(part)
        relation(from, state, from.type === 'entity' ? 'nominal_predicate' : 'result_state')
        continue
      }
      if (internalCues.has(part.index)) continue
      const compound = compoundCues.get(part.index)
      const conjoinedPrep = part.dep === 'conj' && part.pos === 'ADP' && prepRelations.has(part.head)
      if (compound || conjoinedPrep || ['prep', 'agent'].includes(part.dep) || part.dep === 'dative' && part.pos === 'ADP') {
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
        if (parent && (deferredModifiers.has(parent) || parent !== host && parent.pos === 'ADV')) {
          local.push(...under(parent).filter(t => t.dep === 'advmod' && t.pos === 'ADV'), parent)
        }
        const edge = relation(from, coordinate(landmark, to, to?.type === 'clause' ? clauseOf : entity), label, compound?.parts ?? [part], local)
        if (edge) {
          prepRelations.set(part.index, edge)
          for (const modifier of under(part).filter(t => t.dep === 'neg')) literal(edge,'negation',[modifier],true)
        }
        const measure = under(part).find(t => t.dep === 'npadvmod' && nouns.has(t.pos))
        if (edge && measure) {
          const amount = entity(measure)
          if (amount) edge.fields.push(ref('measure', amount))
        }
        for (const child of under(part)) if (child.dep === 'prep' || child.dep === 'conj' && child.pos === 'ADP') attached.push(child)
      }
      if (from.type === 'entity' && ['acl', 'relcl'].includes(part.dep)) {
        const cue = attachments.get(part.index)
        const kind = cue?.lower === 'where' ? 'locative_relative' : cue?.lower === 'when' ? 'temporal_relative'
          : cue?.lower === 'whose' ? 'possessive_relative'
          : cue ? subject.has(cue.dep) ? 'subject_relative' : 'object_relative' : 'nominal_clause'
        relation(from, coordinate(part, clauseOf(part), clauseOf), kind, cue ? [cue] : [])
      }
      if (from.type === 'entity' && part.dep === 'nmod' && nouns.has(part.pos)) relation(from,entity(part),'nominal_modifier')
      if (from.type === 'entity' && part.dep === 'advcl') {
        const {kind, span} = subordinateCue(under(part))
        relation(from, coordinate(part, clauseOf(part), clauseOf), kind, span)
      }
      if (measurementHeads.has(part.index) && !used.has(part.index) && ['amod','dep','oprd','acomp'].includes(part.dep)) {
        relation(from, coordinate(part,entity(part),entity), 'measurement')
      }
      if (part.dep === 'appos') {
        const group = coordinate(part, entity(part), entity)
        const inventory = group?.type === 'coordination' &&
          tokens.slice(host.index + 1,part.index).some(t => t.value === ':')
        relation(from, group, part.nominalRelation ?? (inventory ? 'elaboration' : 'apposition'),
          (part.nominalCue ?? []).map(index => tokens[index]))
      }
      if (part.dep === 'dep' && nouns.has(part.pos) && !used.has(part.index)) {
        // Speech and drawing directives often place a bare nominal topic
        // before a dash, or an inventory after a colon. Keep its attached
        // modifiers and list members together as an explicit nominal fragment.
        const lo = Math.min(host.index,part.index)
        const hi = Math.max(host.index,part.index)
        const boundary = tokens.slice(lo+1,hi).findLast(t => [':','—','–'].includes(t.value))
        if (boundary) {
          const topic = coordinate(part, entity(part), entity)
          if (topic) {
            const fragment = make('clause', part, ['form=fragment', ref('topic',topic)])
            relation(from, fragment, part.index < host.index ? 'fronted_topic' : 'elaboration')
          }
        }
      }
      if (part.dep === 'npadvmod' && !courtesy.has(part.index) && nouns.has(part.pos) && !used.has(part.index)) {
        relation(from, entity(part), 'nominal_adjunct')
      }
    }
  }

  for (const [index, edge] of prepRelations) {
    if (tokens[index].dep !== 'conj') coordinate(tokens[index], edge, token => prepRelations.get(token.index))
  }
  // Recover dependent modifiers against the exact already-grounded role,
  // including cues whose owner is a relation instead of a clause or noun.
  for (const token of tokens) {
    if (used.has(token.index)) continue
    const host = sourceRoles.get(token.head)
    if (!host) continue
    if (token.dep === 'advmod' && token.pos === 'ADV') {
      if (host.node.type === 'relation' && ['cue','adverb'].includes(host.key)) literal(host.node,'adverb',[token],true)
      else if (['entity','clause'].includes(host.node.type) &&
          ['modifier','result_complement','adverb','degree','quantity','question','marker'].includes(host.key)) {
        literal(host.node, 'degree', [token],true)
      }
    }
  }
  const outputClauses = [...clauses.values()].sort((a, b) => a.token.index - b.token.index)
  const unresolved = []
  for (const token of tokens) {
    if (used.has(token.index)) continue
    const owner = outputClauses.findLast((node) => node.token.index <= token.index) ?? outputClauses[0]
    if (token.dep === 'mark' && clauses.has(token.head) &&
        ['SCONJ','ADP','PART'].includes(token.pos) && literal(clauseOf(tokens[token.head]), 'marker', [token])) continue
    if (token.dep === 'punct' && ['.','!','?'].includes(token.value) && owner.token.index < token.index &&
        literal(owner, 'terminator', [token])) continue
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
