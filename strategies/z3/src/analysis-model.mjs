import { lemmatiseVerb, lemmatiseWord } from './lattice/morph.mjs'

const tokenPattern = /"(?:[^"\\]|\\.)*"|“[^”]*”|'(?:[^'\\]|\\.)*'|‘[^’]*’|(?<date>[0-9]{4}-[0-9]{2}-[0-9]{2}(?![\p{L}\p{M}\p{N}_]))|(?<clock>[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)(?![\p{L}\p{M}\p{N}_])|(?<decimal>[+-]?(?:[0-9]+\.[0-9]+|\.[0-9]+))(?![\p{L}\p{M}\p{N}_])|[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*|[^\s]/gu
const allowedTags = ['unknown', 'verb', 'noun', 'pronoun', 'proper', 'determiner', 'adjective', 'adverb',
  'auxiliary', 'preposition', 'conjunction', 'numeral', 'ordinal', 'particle', 'interjection', 'quote']
const nominalTags = ['noun', 'pronoun', 'proper', 'quote']
const modifierTags = ['determiner', 'adjective', 'numeral', 'ordinal']
const openClassTags = new Set(['noun', 'verb', 'adjective', 'adverb'])
const monthNames = new Set(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december'])
const modalAuxiliaries = new Set(['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would'])
const linkingVerbs = new Set(['be', 'become', 'feel', 'look', 'remain', 'seem', 'smell', 'sound', 'taste'])
const degreeAdverbs = new Set(['considerably', 'far', 'less', 'more', 'much', 'slightly', 'too', 'very'])
const directionalAdverbs = new Set(['down', 'out', 'over', 'up', 'upside'])
const temporalAdverbs = new Set(['now', 'today', 'tomorrow', 'yesterday', 'tonight', 'already'])
const contentVerbs = new Set(['believe', 'know', 'say', 'think', 'see', 'hear', 'hope', 'notice', 'remember'])
const infinitivalVerbs = new Set(['agree', 'ask', 'decide', 'expect', 'hope', 'like', 'need', 'offer', 'plan', 'promise', 'refuse', 'try', 'want'])
const objectControlVerbs = new Set(['ask', 'expect', 'like', 'need', 'want'])
const quotedArgumentVerbs = new Set(['call', 'label', 'name', 'print', 'quote', 'rename', 'say', 'type', 'write'])
const numericObjectVerbs = new Set(['add', 'assign', 'average', 'count', 'display', 'divide', 'equal', 'get',
  'have', 'label', 'multiply', 'need', 'receive', 'return', 'select', 'set', 'show', 'subtract', 'total', 'use'])
const measureUnits = new Set(['%', 'percent', 'percentage', 'time', 'times'])
const clockPrepositions = new Map([['at', 'time'], ['from', 'from'], ['until', 'until'], ['to', 'to']])
const timeZone = /^(?:UTC|GMT|[ECMP][SD]T|CET|CEST|EET|EEST|BST|IST|JST)$/u
const numericFrames = new Map([
  ['by', {relation: 'factor', verbs: new Set(['multiply', 'scale'])}],
  ['to', {relation: 'target_value', verbs: new Set(['adjust', 'change', 'decrease', 'increase', 'lower', 'raise', 'resize', 'scale', 'set'])}]
])
// Explicit subordinate cues license finite adjuncts only with an overt
// subject and finite predicate on their own side of the boundary.
const adjunctCues = [
  ['as soon as', 'time'], ['even though', 'concession'], ['so that', 'purpose'],
  ['provided that', 'condition'], ['unless', 'condition'], ['if', 'condition'],
  ['because', 'reason'], ['although', 'concession'], ['though', 'concession'],
  ['after', 'time'], ['before', 'time'], ['once', 'time'], ['until', 'time'],
  ['when', 'time'], ['while', 'time'], ['so', 'consequence']
].map(([words, kind]) => ({words: words.split(' '), kind}))

function adjunctCueAt(tokens, at, end = tokens.length - 1) {
  const entry = adjunctCues.find(({words}) => at + words.length - 1 <= end &&
    words.every((word, offset) => tokens[at + offset]?.lower === word))
  return entry && {...entry, start: at, end: at + entry.words.length - 1}
}

const interrogativeComplementVerbs = new Set(['ask', 'check', 'decide', 'discover', 'find', 'inquire', 'know',
  'learn', 'see', 'test', 'verify', 'wonder'])
const coordinatingCues = new Set(['and', 'or', 'but', 'nor', 'yet', 'then'])
const hardBoundary = new Set(['.', ':', '!', '?', ';', '—'])
const genitiveStem = /^(?<stem>[\p{L}\p{M}\p{N}]+)(?:'s|’s)$/iu
const tokenTag = (index, tag) => `(= p${index} ${allowedTags.indexOf(tag)})`
const disjunction = (clauses) => clauses.length ? `(or ${clauses.join(' ')})` : 'false'
const conjunction = (clauses) => clauses.length ? `(and ${clauses.join(' ')})` : 'true'

function inputTokens(text, kb, lexicon) {
  const particles = new Set([...kb.verbs.keys(), ...kb.actionSpecs.keys()].flatMap((phrase) =>
    /^\S+ \S+$/u.test(phrase) ? [phrase.split(' ')[1]] : []))
  return [...text.matchAll(tokenPattern)].map((match, index) => {
    const surface = match[0]
    const start = match.index
    const lower = surface.toLowerCase().replaceAll('’', "'")
    const tags = new Set(lexicon.classes.get(lower) ?? [])
    const lemmas = lemmatiseWord(lower, kb)
    const owner = genitiveStem.exec(surface)?.groups.stem
    const ownerKey = owner?.toLowerCase()
    const possibleOwner = owner && lower !== "let's" && !kb.grammar.pronouns.has(ownerKey) &&
      !kb.grammar.whWords.has(ownerKey)
    const nounOwner = possibleOwner && (lexicon.classes.get(ownerKey)?.has('noun') ||
      lexicon.posUsage.get(ownerKey)?.noun > 0)
    const namedOwner = possibleOwner && /^\p{Lu}/u.test(owner)
    const genitive = nounOwner ? 'noun' : namedOwner ? 'proper' : undefined
    for (const stem of lemmas) {
      for (const tag of lexicon.classes.get(stem) ?? []) {
        if (tag === 'verb' || tag === 'noun' || tag === 'adjective') tags.add(tag)
      }
    }
    const acts = [...new Set(lemmatiseVerb(lower, kb).flatMap((stem) => (kb.verbs.get(stem) ?? []).map(({act}) => act)))]
    if (acts.length) tags.add('verb')
    if (kb.grammar.pronouns.has(lower)) tags.add('pronoun')
    if (kb.grammar.determiners.has(lower)) tags.add('determiner')
    if (kb.grammar.prepositions.has(lower) || lower === 'than' || lower === 'per') tags.add('preposition')
    if (kb.grammar.auxiliaries.has(lower) || lower === "let's") tags.add('auxiliary')
    if (kb.grammar.joiners.has(lower)) tags.add('conjunction')
    if (kb.grammar.ordinals.has(lower)) tags.add('ordinal')
    if (particles.has(lower)) tags.add('particle')
    const literal = match.groups.date ? 'date' : match.groups.clock ? 'clock' : match.groups.decimal ? 'decimal' : undefined
    const cardinal = kb.grammar.numbers.get(lower)
    const numeric = literal || /^\p{N}+$/u.test(surface) ||
      (lower !== 'one' && (tags.has('numeral') || (cardinal && !cardinal.ordinal)))
    if (numeric) tags.add('numeral')
    if (/^["“'‘].+["”'’]$/su.test(surface)) tags.add('quote')
    if (/^\p{Lu}\p{L}*$/u.test(surface) && (index > 0 || !tags.size || monthNames.has(lower))) tags.add('proper')
    if (![...tags].some((tag) => openClassTags.has(tag))) {
      // WordNet can supply a category for otherwise unknown words. Keep the
      // existing grammar categories for multiply attested surface forms.
      const attested = Object.entries(lexicon.posUsage.get(lower) ?? {})
        .filter(([tag, count]) => count > 0 && openClassTags.has(tag))
      if (attested.length === 1) tags.add(attested[0][0])
    }
    if (kb.domain.shapes.has(lower) || kb.catalog.familyWords.has(lower)) tags.add('noun')
    if (kb.domain.colours.has(lower) || /(?:able|ible|ous|less)$/u.test(lower)) tags.add('adjective')
    const negation = lexicon.negative.has(lower) || [...lexicon.negativeEndings].some((suffix) => lower.endsWith(suffix))
    if (negation && !tags.size) tags.add('adverb')
    if (temporalAdverbs.has(lower) || degreeAdverbs.has(lower)) tags.add('adverb')
    const filler = !temporalAdverbs.has(lower) && (lexicon.filler.has(lower) || kb.isFillerWord(lower))
    const copula = /^(?:am|is|are|was|were|be|been|being)$/.test(lower)
    if (copula) tags.add('verb')
    const closed = ['pronoun', 'determiner', 'auxiliary', 'conjunction'].filter((tag) => tags.has(tag))
    const allowed = numeric ? ['numeral'] : temporalAdverbs.has(lower) ? ['adverb'] : closed.length ? closed : [...tags].filter((tag) => allowedTags.includes(tag))
    if (closed.includes('auxiliary') && tags.has('verb')) allowed.push('verb')
    const preferred = kb.domain.colours.has(lower) ? 'adjective'
      : kb.domain.shapes.has(lower) ? 'noun' : tags.has('proper') ? 'proper' : null
    if (!closed.length && preferred && allowed.includes(preferred)) {
      allowed.splice(allowed.indexOf(preferred), 1)
      allowed.unshift(preferred)
    }
    const linking = copula || lemmas.some((lemma) => linkingVerbs.has(lemma))
    return {surface, index, start, lower, end: start + surface.length, tags: allowed.length ? allowed : ['unknown'],
      acts, copula, linking, negation, filler, lemmas, literal, genitive}
  }).map((token, index, tokens) => {
    if (index > 0 && token.tags[0] === 'unknown' && /^\p{L}+$/u.test(token.surface) &&
        tokens[index - 1].tags.includes('determiner')) {
      return {...token, tags: ['noun', 'unknown']}
    }
    if (/(?:ed|ing)$/u.test(token.lower) && token.tags.includes('verb') &&
        !token.tags.includes('adjective') && tokens[index + 1]?.tags.includes('noun')) {
      return {...token, tags: [...token.tags, 'adjective']}
    }
    if (index === 0 && token.tags.every((tag) => tag === 'proper' || tag === 'unknown') &&
        /^\p{L}+$/u.test(token.surface) && tokens[index + 1]?.tags.includes('determiner')) {
      return {...token, tags: ['verb', ...token.tags]}
    }
    return token
  })
}

function predicateCandidates(tokens, start, end) {
  const candidates = []
  for (let index = start; index <= end; index++) {
    const token = tokens[index]
    if (!token.tags.includes('verb')) continue
    const next = tokens[index + 1]
    const properSubject = token.tags.includes('proper') && next?.tags.includes('verb') &&
      (/s$/u.test(next.lower) || next.tags.includes('auxiliary'))
    if (properSubject) continue
    if (modalAuxiliaries.has(token.lower) && tokens.slice(index + 1, end + 1).some((later) =>
      later.tags.includes('verb') && !later.tags.includes('auxiliary'))) continue
    const before = tokens[index - 1]?.tags ?? []
    if (index > start && before.includes('determiner') && !before.includes('pronoun')) continue
    if (token.tags.includes('noun') && tokens[index + 1]?.tags.includes('auxiliary')) continue
    if (token.tags.includes('auxiliary')) {
      const next = tokens.slice(index + 1, end + 1).find((later) => !later.negation && !later.filler &&
        !later.tags.includes('auxiliary') && later.tags.some((tag) => tag !== 'adverb'))
      if (next?.tags.includes('verb') && (!token.copula || /(?:ed|ing)$/u.test(next.lower))) continue
    }
    const weight = token.acts.length || token.linking ? 9 : 3
    const beginning = index === start
      || tokens.slice(start, index).every((t) => t.negation || t.filler || t.tags.some((tag) => ['auxiliary', 'adverb'].includes(tag)))
    const formalSubject = tokens.slice(start, index).some((item) =>
      item.tags.includes('determiner') || item.tags.includes('pronoun'))
    const inflected = token.lemmas.some((lemma) => lemma !== token.lower)
    candidates.push({index, weight: weight + (beginning ? 14 : formalSubject && inflected ? 7 : 0)})
  }
  return candidates
}

function detachedGratitude(tokens, kb, phrases) {
  const detached = new Map()
  const forms = [...phrases].map((phrase) => phrase.split(/\s+/u)).sort((a, b) => b.length - a.length)
  let sentenceStart = 0
  for (const [start, token] of tokens.entries()) {
    if (hardBoundary.has(token.surface)) {
      sentenceStart = start + 1
      continue
    }
    const form = forms.find((words) => words.every((word, offset) => tokens[start + offset]?.lower === word))
    if (!form) continue
    const expressionEnd = start + form.length - 1
    let end = expressionEnd
    if (tokens[expressionEnd + 1]?.lower === 'for' && tokens[expressionEnd + 2]) {
      while (tokens[end + 1] && tokens[end + 1].surface !== ',' &&
        !hardBoundary.has(tokens[end + 1].surface)) end++
    }
    const after = tokens[end + 1]?.surface
    if (after && !hardBoundary.has(after) && after !== ',') continue
    const separatorBefore = start > sentenceStart && tokens[start - 1]?.surface === ','
    const separated = start === sentenceStart || separatorBefore
    if (!separated) {
      // A bare tail can still be a noun, a quoted label, or a direct theme
      // following a recipient. Only close it after a completed argument of a
      // local, non-transfer command.
      const host = predicateCandidates(tokens, sentenceStart, start - 1)
        .sort((left, right) => right.weight - left.weight || left.index - right.index)[0]
      if (!host || tokens[host.index].lemmas.some((lemma) =>
        quotedArgumentVerbs.has(lemma) || kb.grammar.benefactiveVerbs.has(lemma)) ||
        !nominalCandidates(tokens, host.index + 1, start - 1).some((entity) => entity.end === start - 1)) continue
    }
    const separators = []
    if (separatorBefore) separators.push(start - 1)
    if (after === ',') separators.push(end + 1)
    const terminator = hardBoundary.has(after) ? end + 1 : undefined
    detached.set(start, {start, end, expressionEnd, separators, terminator, gratitude: true})
  }
  return detached
}

function splitAtCues(tokens, discourse, nominalsOf) {
  const clauses = []
  let start = 0
  const add = (end) => {
    if (start <= end) clauses.push({start, end})
  }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    const gratitude = discourse.get(index)
    if (gratitude) {
      const preceding = gratitude.separators.find((separator) => separator < index)
      add((preceding ?? index) - 1)
      clauses.push(gratitude)
      const last = Math.max(gratitude.end, gratitude.terminator ?? -1, ...gratitude.separators)
      start = last + 1
      index = last
    } else if (hardBoundary.has(token.surface)) {
      add(index - 1)
      if (clauses.at(-1)?.end === index - 1) clauses.at(-1).terminator = index
      start = index + 1
    } else if (index > start && !(token.surface === ',' && adjunctCueAt(tokens, start)) &&
      (coordinatingCues.has(token.lower) || token.surface === ',') &&
      !discourse.has(index + 1)) {
      const left = predicateCandidates(tokens, start, index - 1)
      let next = index + 1
      const coordinators = [index]
      while (coordinatingCues.has(tokens[next]?.lower)) coordinators.push(next++)
      if (adjunctCueAt(tokens, index) || (token.surface === ',' && adjunctCueAt(tokens, next))) continue
      while (tokens[next] && (tokens[next].filler || tokens[next].negation)) next++
      const lookahead = Math.min(tokens.length - 1, next + 8)
      const boundary = tokens.slice(next, lookahead + 1).find((word) =>
        hardBoundary.has(word.surface) || word.surface === ',' || word.tags.includes('conjunction'))?.index
      const explicitSubject = left.length && predicateCandidates(tokens, next, (boundary ?? lookahead + 1) - 1)
        .some(({index: predicate}) => {
          if (predicate <= next) return false
          const verb = tokens[predicate]
          if (!verb.copula && verb.baseVerb && !tokens[predicate - 1].tags.includes('auxiliary') &&
              !tokens[next].tags.includes('pronoun')) return false
          return nominalsOf(next, predicate - 1).some((entity) => entity.start === next &&
            tokens.slice(entity.end + 1, predicate).every((word) => word.tags.includes('auxiliary') || word.negation))
        })
      if (left.length && (explicitSubject || (tokens[next]?.tags.includes('verb') &&
          (tokens[next].acts.length || !tokens[next].tags.includes('noun'))))) {
        add(index - 1)
        clauses.at(-1).coordinator = index
        clauses.at(-1).coordinators = coordinators
        const couldBeNominal = tokens[next].tags.some((tag) => nominalTags.includes(tag) || modifierTags.includes(tag))
        clauses.at(-1).strongBoundary = coordinators.some((position) => tokens[position].lower === 'then') ||
          explicitSubject || !couldBeNominal
        start = coordinators.at(-1) + 1
        index = coordinators.at(-1)
      }
    }
  }
  add(tokens.length - 1)
  return clauses
}

function finiteAdjunctPredicates(tokens, start, end, nominalsOf) {
  return predicateCandidates(tokens, start, end).filter(({index}) => {
    const predicate = tokens[index]
    const auxiliary = tokens.slice(start, index).some((word) => word.tags.includes('auxiliary'))
    if (!auxiliary && !predicate.baseVerb && predicate.lower.endsWith('ing')) return false
    const inflected = !predicate.baseVerb || predicate.copula || auxiliary
    return nominalsOf(start, index - 1).some((entity) => {
      const subject = tokens[entity.head]
      const permitsBare = ['i', 'you', 'we', 'they'].includes(subject.lower) ||
        subject.tags.includes('noun') && !subject.tags.includes('proper') && /s$/u.test(subject.lower)
      return entity.start === start && (inflected || permitsBare) &&
        tokens.slice(entity.end + 1, index).every((word) => word.tags.includes('auxiliary') ||
          word.negation || word.tags.includes('adverb'))
    })
  }).map(({index}) => index)
}

function adjunctPlans(tokens, clause, nominalsOf) {
  if (clause.gratitude) return []
  const plans = []
  for (let index = clause.start; index < clause.end - 1; index++) {
    const cue = adjunctCueAt(tokens, index, clause.end)
    if (!cue) continue
    const initial = index === clause.start
    const separator = initial
      ? tokens.slice(cue.end + 1, clause.end).find((word) => word.surface === ',')?.index
      : tokens[index - 1]?.surface === ',' ? index - 1 : undefined
    if (initial && (separator === undefined || cue.kind === 'consequence')) continue
    const subordinateStart = cue.end + 1
    const subordinateEnd = initial ? separator - 1 : clause.end
    const matrixStart = initial ? separator + 1 : clause.start
    const matrixEnd = initial ? clause.end : (separator ?? cue.start) - 1
    const childPredicates = finiteAdjunctPredicates(tokens, subordinateStart, subordinateEnd, nominalsOf)
    const matrixPredicates = predicateCandidates(tokens, matrixStart, matrixEnd)
    if (!childPredicates.length || !matrixPredicates.length) continue
    const matrixEndsInContentVerb = matrixPredicates.some(({index}) => index === matrixEnd &&
      (tokens[index].frames.has('finite_clause') || tokens[index].lemmas.some((lemma) =>
        interrogativeComplementVerbs.has(lemma))))
    if (!initial && cue.kind === 'condition' && matrixEndsInContentVerb) continue
    const matrix = {start: matrixStart, end: matrixEnd, adjunct: initial ? 0 : 1,
      adjunctCue: cue, adjunctSeparator: separator}
    const child = {start: subordinateStart, end: subordinateEnd, finitePredicates: childPredicates}
    const parts = initial ? [child, matrix] : [matrix, child]
    Object.assign(matrix, {
      terminator: clause.terminator, coordinator: clause.coordinator, coordinators: clause.coordinators
    })
    plans.push(parts)
    index = cue.end
  }
  return plans
}

function expandClause(tokens, clause, nominalsOf) {
  const expanded = []

  const infinitival = !clause.gratitude && predicateCandidates(tokens, clause.start, clause.end)
    .map(({index}) => {
      const lemmas = tokens[index].lemmas
      if (!lemmas.some((lemma) => infinitivalVerbs.has(lemma)) &&
          !tokens[index].frames.has('infinitive') && !tokens[index].frames.has('object_infinitive')) return null
      const window = lemmas.some((lemma) => objectControlVerbs.has(lemma)) ||
        tokens[index].frames.has('object_infinitive') ? 6 : 1
      const marker = tokens.slice(index + 1, Math.min(clause.end, index + window) + 1)
        .find((token) => token.lower === 'to' && tokens[token.index + 1]?.tags.includes('verb'))
      return marker ? {index, marker: marker.index} : null
    }).find(Boolean)
  if (infinitival) {
    expanded.push({start: clause.start, end: infinitival.marker - 1, complement: expanded.length + 1})
    expanded.push({...clause, start: infinitival.marker + 1, marker: infinitival.marker})
    return expanded
  }
  const bare = !clause.gratitude && predicateCandidates(tokens, clause.start, clause.end).find(({index}) =>
    tokens[index].frames.has('object_bare_infinitive') &&
    tokens[index].lemmas.some((lemma) => ['have', 'help', 'let', 'make'].includes(lemma)))
  if (bare) {
    const child = predicateCandidates(tokens, bare.index + 2, clause.end).find(({index}) => {
      const heads = nominalsOf(bare.index + 1, index - 1)
      return heads.some((head) => head.start === bare.index + 1 && head.end === index - 1) &&
        tokens[index].baseVerb && !tokens[index].tags.includes('adjective') &&
        (!tokens[index].tags.includes('noun') || (index === clause.end && tokens[index].frames.has('intransitive')) ||
          tokens[index + 1]?.tags.includes('preposition') ||
          tokens[index + 1]?.tags.includes('determiner') || tokens[index - 1].tags.includes('pronoun'))
    })
    if (child) {
      expanded.push({start: clause.start, end: child.index - 1, complement: expanded.length + 1})
      expanded.push({...clause, start: child.index, nonfinite: true})
      return expanded
    }
  }
  const relative = !clause.gratitude && tokens.slice(clause.start + 2, clause.end)
    .find((token) => {
      if (!['who', 'which', 'that'].includes(token.lower)) return false
      const host = tokens[token.index - 1]
      if (!host.tags.some((tag) => tag === 'noun' || tag === 'proper')) return false
      const parent = predicateCandidates(tokens, clause.start, token.index - 2)
      const child = predicateCandidates(tokens, token.index + 1, clause.end)
      return parent.length && child.some(({index}) =>
        index === token.index + 1 || nominalsOf(token.index + 1, index - 1)
          .some((entity) => entity.start === token.index + 1 && entity.end === index - 1))
    })
  if (relative) {
    expanded.push({start: clause.start, end: relative.index - 1,
      relative: expanded.length + 1, relativeCue: relative.index})
    expanded.push({...clause, start: relative.index + 1, relativeClause: true})
    return expanded
  }
  const matrix = !clause.gratitude && predicateCandidates(tokens, clause.start, clause.end).find(({index}) =>
    index >= clause.start && (tokens[index].lemmas.some((lemma) => contentVerbs.has(lemma)) ||
      tokens[index].frames.has('finite_clause') ||
      tokens[index].lemmas.some((lemma) => interrogativeComplementVerbs.has(lemma)) &&
      ['if', 'whether'].includes(tokens[index + 1]?.lower)))
  const cueWord = matrix && tokens[matrix.index + 1]?.lower
  const cue = cueWord === 'that' || ['if', 'whether'].includes(cueWord) && tokens[matrix.index].lemmas
    .some((lemma) => interrogativeComplementVerbs.has(lemma)) ? matrix.index + 1 : undefined
  const start = matrix ? (cue ?? matrix.index) + 1 : clause.end + 1
  const hasSubject = tokens[start]?.tags.some((tag) => ['determiner', ...nominalTags].includes(tag))
  const embedded = hasSubject && predicateCandidates(tokens, start, clause.end).find(({index}) =>
    index > start && nominalsOf(start, index - 1).some((entity) => entity.start === start &&
      tokens.slice(entity.end + 1, index).every((token) => token.negation || token.tags.includes('auxiliary') ||
        token.tags.includes('adverb'))) && (cue !== undefined || tokens[index].tags.includes('auxiliary') ||
      tokens[index - 1].tags.includes('auxiliary') || /(?:s|ed)$/u.test(tokens[index].lower) ||
      tokens[start].tags.includes('pronoun')))
  if (embedded) {
    expanded.push({start: clause.start, end: matrix.index, complement: expanded.length + 1, complementCue: cue})
    expanded.push({...clause, start})
  } else {
    expanded.push(clause)
  }
  return expanded
}

function nominalCandidates(tokens, first, last) {
  const entities = []
  for (let head = first; head <= last; head++) {
    const token = tokens[head]
    const standaloneNumber = token.tags.includes('numeral') &&
      !tokens[head + 1]?.tags.some((tag) => tag === 'noun' || tag === 'adjective')
    const tags = token.tags.filter((tag) => nominalTags.includes(tag) || (standaloneNumber && tag === 'numeral'))
    if (!tags.length || degreeAdverbs.has(token.lower) ||
        (measureUnits.has(token.lower) && tokens[head - 1]?.tags.includes('numeral') &&
          tokens[head + 1]?.tags.includes('adjective')) ||
        (token.tags.includes('preposition') && directionalAdverbs.has(token.lower))) continue
    const constraints = [disjunction(tags.map((tag) => tokenTag(head, tag)))]
    const add = (start, conditions) => {
      entities.push({start, end: head, head, tags, constraints: conditions})
      const owner = tokens[start - 1]
      if (start <= first || !owner.genitive || tokens[start].tags.includes('determiner')) return
      let ownerStart = owner.index
      let determiner
      const ownerConstraints = []
      if (owner.genitive === 'noun') {
        while (ownerStart > first && owner.index - ownerStart < 4 &&
               tokens[ownerStart - 1].tags.includes('adjective')) {
          ownerStart--
          ownerConstraints.push(tokenTag(ownerStart, 'adjective'))
        }
        if (ownerStart > first && tokens[ownerStart - 1].tags.includes('determiner')) {
          determiner = --ownerStart
          ownerConstraints.push(tokenTag(ownerStart, 'determiner'))
        }
      }
      entities.push({start: ownerStart, end: head, head, tags, contentStart: start,
        possessor: {start: ownerStart, head: owner.index, determiner},
        constraints: [...conditions, ...ownerConstraints]})
    }
    add(head, constraints)
    if (tags.every((tag) => tag === 'pronoun' || tag === 'quote' || tag === 'numeral')) continue

    let phase = 'compound'
    const prefix = []
    for (let index = head - 1; index >= Math.max(first, head - 6); index--) {
      const previous = tokens[index]
      const after = tokens[index + 1]
      const adjoiningNominal = previous.tags.some((tag) => tag === 'noun' || tag === 'proper')
      const boundedByDeterminer = tokens.slice(Math.max(first, index - 4), index).some((token, offset, prefix) =>
        token.tags.includes('determiner') && prefix.slice(offset + 1).every((item) =>
          item.tags.some((tag) => ['adjective', 'noun', 'proper'].includes(tag)) && !item.tags.includes('preposition')))
      const compound = phase === 'compound' && adjoiningNominal && !previous.genitive &&
        !previous.filler && !previous.tags.includes('preposition') && !previous.tags.includes('adjective') &&
        !directionalAdverbs.has(previous.lower) &&
        (!previous.tags.includes('verb') || previous.tags.includes('proper') ||
          boundedByDeterminer)
      const degree = phase === 'modifier' && degreeAdverbs.has(previous.lower) && after.tags.includes('adjective')
      const modifiers = previous.tags.filter((tag) => modifierTags.includes(tag))
      const alternatives = compound ? ['noun', 'proper'] : degree ? ['adverb'] : modifiers
      const available = alternatives.filter((tag) => previous.tags.includes(tag))
      if (!available.length) break
      prefix.unshift(disjunction(available.map((tag) => tokenTag(index, tag))))
      add(index, [...constraints, ...prefix])
      if (!compound) phase = 'modifier'
      if (modifiers.includes('determiner')) break
    }
  }
  return entities
}

function prepositionsOf(tokens, clause, kb) {
  const prepositions = []
  for (let first = clause.start; first <= clause.end; first++) {
    let key = ''
    for (let last = first; last <= Math.min(clause.end, first + 5); last++) {
      key += (last === first ? '' : ' ') + tokens[last].lower
      const lateral = /^on the (left|right) of$/u.test(key)
        ? kb.grammar.prepositions.get(key.replace(/^on/u, 'to')) : undefined
      if (kb.grammar.prepositions.has(key) || lateral || key === 'than' || key === 'per') {
        const previous = prepositions.at(-1)
        if (previous?.start === first) prepositions.pop()
        const info = kb.grammar.prepositions.get(key) ?? lateral ?? {rel: key === 'than' ? 'comparison' : key}
        prepositions.push({start: first, end: last, kind: info.rel ?? 'prepositional', space: info.space})
      }
    }
    if (prepositions.at(-1)?.start === first) first = prepositions.at(-1).end
  }
  return prepositions
}

function subjectAgreement(tokens, entity, predicate, clause, kb) {
  const verb = tokens[predicate.index]
  const head = tokens[entity.head]
  if (entity.end >= predicate.index || verb.copula ||
      tokens.slice(clause.start, predicate.index).some((word) =>
        word.tags.includes('auxiliary') || word.tags.includes('conjunction'))) return 0
  if (kb.grammar.pastForms.has(verb.lower) || /ed$/u.test(verb.lower)) return 0
  const pronoun = kb.grammar.pronouns.get(head.lower)
  const thirdSingular = pronoun ? pronoun.person === '3' && pronoun.number === 'sg'
    : !/s$/u.test(head.lower) || head.tags.includes('proper') ||
      ['a', 'an', 'each', 'every'].includes(tokens[entity.start].lower)
  const agrees = thirdSingular ? /s$/u.test(verb.lower) && !verb.baseVerb : verb.baseVerb
  return agrees ? 2 : -5
}

function numericLandmark(tokens, prep, clause, predicates, kb) {
  const head = prep.end + 1
  const number = tokens[head]
  if (head > clause.end || !number?.literal) return null
  const cue = tokens[prep.start].lower
  let relation
  let hosts = predicates
  if (number.literal === 'date') {
    relation = cue === 'on' ? 'date' : ['from', 'to', 'until', 'before', 'after'].includes(cue) ? cue : undefined
  } else if (number.literal === 'clock') {
    relation = clockPrepositions.get(cue)
  } else {
    const frame = numericFrames.get(cue)
    if (!frame) return null
    const suffix = tokens[head + 1]?.lower
    if (frame.relation === 'factor' && head < clause.end &&
        (kb.domain.units.has(suffix) || ['%', 'percent', 'pixel', 'pixels'].includes(suffix))) return null
    hosts = predicates.filter(({index}) => tokens[index].lemmas.some((lemma) => frame.verbs.has(lemma)))
    relation = frame.relation
  }
  if (!relation || !hosts.length) return null
  const zone = number.literal === 'clock' && head < clause.end && timeZone.test(tokens[head + 1].surface)
    ? head + 1 : undefined
  return {start: head, end: zone ?? head, head, zone, relation, hosts, constraints: [tokenTag(head, 'numeral')]}
}

// Store a sparse set of span hypotheses. The edges between boundaries form a
// DAG, so choosing one incoming and outgoing edge along the path partitions the
// input while retaining lexical and clausal readings for the same cue.
function clausePlans(tokens, discourse, nominalsOf, compact) {
  const base = splitAtCues(tokens, discourse, nominalsOf)
  const plans = []
  for (let from = 0; from < base.length; from++) {
    for (let to = from; to < Math.min(base.length, from + 3); to++) {
      if (to > from && (compact || base[to - 1].coordinator === undefined ||
          base[to - 1].strongBoundary || base[to].end - base[from].start >= 36)) break
      const span = {...base[to], start: base[from].start}
      const expanded = expandClause(tokens, span, nominalsOf)
      for (const adjunct of adjunctPlans(tokens, span, nominalsOf)) {
        plans.push({from, to: to + 1, clauses: adjunct, linked: true, adjunct: true})
      }
      if (expanded.length > 1) plans.push({from, to: to + 1, clauses: expanded, linked: true})
      plans.push({from, to: to + 1, clauses: [span]})
    }
  }
  return {plans, end: base.length}
}

export function encodeSyntaxAnalysis(text, kb, lexicon, {compact = false} = {}) {
  const tokens = inputTokens(text, kb, lexicon)
  for (const token of tokens) {
    token.baseVerb = lexicon.verbFrames.has(token.lower)
    token.frames = new Set(token.lemmas.flatMap((lemma) => [...(lexicon.verbFrames?.get(lemma) ?? [])]))
  }
  const discourse = detachedGratitude(tokens, kb, lexicon.gratitude)
  const nominalChart = new Map()
  const nominalsOf = (start, end) => {
    const key = start + ':' + end
    if (!nominalChart.has(key)) nominalChart.set(key, nominalCandidates(tokens, start, end))
    return nominalChart.get(key)
  }
  const partition = clausePlans(tokens, discourse, nominalsOf, compact)
  const clauses = []
  for (const {start} of discourse.values()) {
    if (!tokens[start].tags.includes('interjection')) tokens[start].tags.unshift('interjection')
  }
  const assertions = []
  const query = []
  const block = []
  const push = (formula) => assertions.push(`(assert ${formula})`)
  const prefer = (formula, weight) => assertions.push(`(assert-soft ${formula} :weight ${weight})`)
  const select = (prefix, clauseIndex, itemIndex, condition, weight, structural = true) => {
    const variable = `${prefix}${clauseIndex}_${itemIndex}`
    assertions.push(`(declare-const ${variable} Bool)`)
    push(`(=> ${variable} ${conjunction([clauses[clauseIndex].active, condition])})`)
    prefer(variable, weight)
    query.push(variable)
    if (structural) block.push(variable)
    return variable
  }
  const atMostOne = (variables) => {
    if (variables.length > 1) push(`((_ at-most 1) ${variables.join(' ')})`)
  }

  const incoming = Array.from({length: partition.end + 1}, () => [])
  const outgoing = Array.from({length: partition.end + 1}, () => [])
  for (const [index, plan] of partition.plans.entries()) {
    const variable = 'span' + index
    assertions.push(`(declare-const ${variable} Bool)`)
    incoming[plan.to].push(variable)
    outgoing[plan.from].push(variable)
    if (plan.adjunct) prefer(variable, 10)
    query.push(variable)
    block.push(variable)
    const offset = clauses.length
    for (const [position, clause] of plan.clauses.entries()) {
      clauses.push({...clause, active: variable, planFrom: plan.from, planTo: plan.to,
        firstInPlan: position === 0, requiresPredicate: plan.linked || clause.coordinator !== undefined,
        complement: clause.complement === undefined ? undefined : offset + clause.complement,
        relative: clause.relative === undefined ? undefined : offset + clause.relative,
        adjunct: clause.adjunct === undefined ? undefined : offset + clause.adjunct})
    }
  }
  if (partition.end > 0) {
    push(disjunction(outgoing[0]))
    push(disjunction(incoming[partition.end]))
    for (let boundary = 0; boundary <= partition.end; boundary++) {
      atMostOne(incoming[boundary])
      atMostOne(outgoing[boundary])
      if (boundary > 0 && boundary < partition.end) {
        push(`(= ${disjunction(incoming[boundary])} ${disjunction(outgoing[boundary])})`)
      }
    }
  }

  for (const token of tokens) {
    const variable = `p${token.index}`
    if (token.tags.length === 1) {
      assertions.push(`(define-fun ${variable} () Int ${allowedTags.indexOf(token.tags[0])})`)
      continue
    }
    assertions.push(`(declare-const ${variable} Int)`)
    push(disjunction(token.tags.map((tag) => tokenTag(token.index, tag))))
    prefer(tokenTag(token.index, token.tags[0]), 1)
    const counts = lexicon.posUsage.get(token.lower) ?? token.lemmas.map((lemma) =>
      lexicon.posUsage.get(lemma)).find(Boolean)
    if (counts) {
      const ranked = token.tags.filter((tag) => counts[tag] > 0).toSorted((a, b) => counts[b] - counts[a])
      if (ranked.length > 1 && counts[ranked[0]] >= counts[ranked[1]] * 2) {
        prefer(tokenTag(token.index, ranked[0]), 1)
      }
    }
    query.push(variable)
  }

  for (const [clauseIndex, clause] of clauses.entries()) {
    if (clause.gratitude) {
      clause.expression = select('g', clauseIndex, 0, tokenTag(clause.start, 'interjection'), 1)
      push(clause.expression)
    }
    const predicates = clause.gratitude ? [] : predicateCandidates(tokens, clause.start, clause.end)
      .filter(({index}) => !clause.finitePredicates || clause.finitePredicates.includes(index))
    for (const [index, predicate] of predicates.entries()) {
      predicate.variable = select('v', clauseIndex, index, tokenTag(predicate.index, 'verb'), predicate.weight)
    }
    atMostOne(predicates.map(({variable}) => variable))
    clause.predicates = predicates
    if (clause.requiresPredicate && predicates.length) {
      push(`(=> ${clause.active} ${disjunction(predicates.map(({variable}) => variable))})`)
    }
    clause.entities = []
    const nominalStart = clause.gratitude ? clause.expressionEnd + 1 : clause.start
    const nominals = nominalsOf(nominalStart, clause.end)
    const prepositions = prepositionsOf(tokens, clause, kb)
    const addEntity = (entity, role, conditions, weight, extra = {}) => {
      const item = {...entity, role, ...extra}
      item.variable = select('e', clauseIndex, clause.entities.length,
        conjunction([...entity.constraints, ...conditions]), weight)
      clause.entities.push(item)
      return item
    }
    const prepConstraint = (prep) => tokens[prep.start].tags.includes('preposition')
      ? tokenTag(prep.start, 'preposition') : 'true'
    const variants = (entity, role, matches, weight, conditions = []) => {
      if (!matches.length) return
      addEntity(entity, role, [disjunction(matches.map(({variable}) => variable)), ...conditions], weight)
    }

    for (const entity of clause.gratitude ? [] : nominals) {
      const inverted = (predicate) => tokens[predicate.index].copula &&
        clause.start < predicate.index && kb.grammar.whWords.has(tokens[clause.start].lower)
      const subjectOrder = predicates.filter((predicate) => predicate.index > entity.end &&
        (predicate.index === entity.end + 1 ||
          tokens.slice(entity.end + 1, predicate.index).every((token) =>
            token.negation || token.filler || token.tags.some((tag) => ['auxiliary', 'adverb'].includes(tag))) ||
          tokens.slice(entity.end + 1, predicate.index).some((token) => token.tags.includes('conjunction')) ||
          prepositions.some((prep) => prep.start === entity.end + 1 && prep.end < predicate.index)))

      const preceding = predicates.filter((predicate) => predicate.index < entity.start &&
        !tokens[predicate.index].copula && !inverted(predicate) &&
        (!entity.tags.includes('numeral') ||
          tokens[predicate.index].lemmas.some((lemma) => numericObjectVerbs.has(lemma))) &&
        !(tokens[predicate.index].linking && entity.start === entity.head &&
          tokens[entity.head].tags.includes('adjective') && !tokens[entity.head].tags.includes('proper')))
      const following = [...subjectOrder, ...predicates.filter((predicate) => inverted(predicate) && predicate.index < entity.start)]
      const clippedModifier = tokens[entity.head].tags.includes('adjective') &&
        nominals.some((longer) => longer.start === entity.start && longer.head === entity.head + 1)
      const weight = 11 + 6 * (entity.end - entity.start) + (entity.possessor ? 2 : 0) - (clippedModifier ? 5 : 0)
      const conditions = prepositions.filter((prep) => prep.start <= entity.end)
        .map((prep) => `(not ${prepConstraint(prep)})`)
      const pronoun = kb.grammar.pronouns.get(tokens[entity.head].lower)
      const cases = entity.tags.includes('pronoun') ? pronoun?.cases ?? [] : []
      if (!cases.includes('object') || cases.includes('subject') || cases.includes('nominative')) {
        for (const predicate of following) {
          variants(entity, 'subject', [predicate], weight + subjectAgreement(tokens, entity, predicate, clause, kb), conditions)
        }
      }
      if (!cases.some((form) => form === 'subject' || form === 'nominative') || cases.includes('object')) {
        variants(entity, 'object', preceding, weight, conditions)
      }
      addEntity(entity, 'fragment', [`(not ${disjunction(predicates.map(({variable}) => variable))})`, ...conditions], weight - 1)
    }

    if (clause.finitePredicates) {
      push(`(=> ${clause.active} ${disjunction(clause.entities.filter(({role}) => role === 'subject')
        .map(({variable}) => variable))})`)
    }

    // A nominal predicate may classify a subject or describe the result for an
    // overt object. It cannot compete for a second independent object slot.
    const objects = clause.entities.filter((entity) => entity.role === 'object')
    for (const entity of clause.gratitude ? [] : nominals) {
      if (tokens[entity.head].tags.includes('pronoun')) continue
      const copulas = predicates.filter(({index}) => tokens[index].copula && index < entity.start &&
        !['where', 'when'].includes(tokens[clause.start].lower) &&
        tokens.slice(index + 1, entity.start).every((token) => token.negation || token.tags.includes('adverb')))
      const clippedModifier = tokens[entity.head].tags.includes('adjective') &&
        nominals.some((longer) => longer.start === entity.start && longer.head === entity.head + 1)
      const predicativeWeight = 15 + 6 * (entity.end - entity.start) - (clippedModifier ? 5 : 0)
      variants(entity, 'predicative', copulas, predicativeWeight)
      const resultHosts = predicates.filter(({index}) => index < entity.start &&
        tokens[index].frames.has('object_predicative') &&
        (tokens[entity.start].tags.includes('determiner') || tokens[entity.head].tags.includes('proper')))
      for (const object of objects.filter((option) => option.end === entity.start - 1)) {
        const pronoun = tokens[object.head].lower
        const bias = ['it', 'this', 'that'].includes(pronoun) ? 3
          : ['me', 'him', 'her', 'them', 'us', 'you'].includes(pronoun) ? -2 : 0
        variants(entity, 'predicative', resultHosts, predicativeWeight + bias, [object.variable])
      }
    }
    atMostOne(clause.entities.filter(({role}) => role === 'predicative').map(({variable}) => variable))

    // Double-object frames license a recipient before an overt theme.
    const themes = clause.entities.filter((entity) => {
      if (entity.role !== 'object') return false
      const head = tokens[entity.head]
      if (entity.start === entity.head) {
        return head.tags.includes('noun') && head.lower.endsWith('s') &&
          head.lemmas.some((lemma) => lemma !== head.lower)
      }
      return tokens[entity.start].tags.some((tag) => tag === 'determiner' || tag === 'numeral')
    })
    for (const entity of nominals) {
      const pronoun = kb.grammar.pronouns.get(tokens[entity.head].lower)
      const heads = entity.tags.filter((tag) => tag === 'proper' ||
        (tag === 'pronoun' && pronoun?.cases.includes('object')))
      if (!heads.length) continue
      const matchingThemes = themes.filter((theme) => theme.start === entity.end + 1)
      if (!matchingThemes.length) continue
      const benefactives = predicates.filter((predicate) => predicate.index === entity.start - 1 &&
        (tokens[predicate.index].frames.has('double_object') ||
          tokens[predicate.index].lemmas.some((lemma) => kb.grammar.benefactiveVerbs.has(lemma))))
      variants(entity, 'indirect', benefactives, 13, [
        disjunction(matchingThemes.map(({variable}) => variable)),
        disjunction(heads.map((tag) => tokenTag(entity.head, tag)))
      ])
    }
    atMostOne(clause.entities.filter(({role}) => role === 'indirect').map(({variable}) => variable))

    for (let head = clause.start; head <= clause.end; head++) {
      const token = tokens[head]
      if (token.tags.includes('particle')) {
        const licenses = new Map()
        for (const {index} of predicates.filter(({index}) => index < head)) {
          const entries = tokens[index].lemmas.flatMap((lemma) => {
            const phrase = lemma + ' ' + token.lower
            return (kb.verbs.get(phrase) ?? (kb.actionSpecs.has(phrase) ? [{separable: false}] : []))
              .filter(({separable}) => separable || index + 1 === head)
          })
          if (entries.length) licenses.set(index, entries)
        }
        const licensed = predicates.filter(({index}) => licenses.has(index))
        if (licensed.length) addEntity({start: head, end: head, head, constraints: [tokenTag(head, 'particle')]},
          'particle', [disjunction(licensed.map(({variable}) => variable))], 12, {licenses})
      }
      const tags = token.tags.filter((tag) => tag === 'adjective' || tag === 'adverb')
      if (!tags.length || token.negation || token.filler || temporalAdverbs.has(token.lower)) continue
      const constraint = disjunction(tags.map((tag) => tokenTag(head, tag)))
      const prepMatches = prepositions.filter((prep) => prep.start <= head && prep.end >= head)
      // A preposition with an overt object is an attachment, not an orphan result.
      if (prepMatches.some((prep) => nominals.some((entity) => entity.start === prep.end + 1))) continue
      const conditions = prepMatches.map((prep) => `(not ${prepConstraint(prep)})`)
      const preceding = predicates.filter((predicate) => predicate.index < head)
      const entity = {start: head, end: head, head, constraints: [constraint]}
      variants(entity, 'complement', preceding, 5, conditions)
      const resultObjects = objects.filter((object) => object.end === head - 1)
      const adjectivalResultHosts = preceding.filter(({index}) => tokens[index].frames.has('object_predicative'))
      if (resultObjects.length && token.tags.includes('adjective') &&
          !tokens[head + 1]?.tags.some((tag) => nominalTags.includes(tag))) {
        variants({...entity, constraints: [tokenTag(head, 'adjective')]}, 'complement', adjectivalResultHosts, 12,
          [...conditions, disjunction(resultObjects.map(({variable}) => variable))])
      }
      const modifier = tokens[head - 1]
      if (head > clause.start && modifier.tags.includes('adverb') && !modifier.negation && !modifier.filler) {
        variants({...entity, start: head - 1, constraints: [constraint, tokenTag(head - 1, 'adverb')]},
          'complement', preceding.filter((predicate) => predicate.index < head - 1), 8, conditions)
      }
      if (head > clause.start + 1 && token.tags.includes('adjective') &&
          measureUnits.has(modifier.lower) && tokens[head - 2].tags.includes('numeral')) {
        variants({...entity, start: head - 2, constraints: [tokenTag(head, 'adjective'), tokenTag(head - 2, 'numeral')]},
          'complement', preceding.filter((predicate) => predicate.index < head - 2), 15, conditions)
      }

    }

    for (const prep of prepositions) {
      const predicateHosts = predicates.filter((predicate) => predicate.index < prep.start)
      const number = numericLandmark(tokens, prep, clause, predicateHosts, kb)
      if (number) {
        addEntity(number, 'prepositional', [
          prepConstraint(prep), disjunction(number.hosts.map(({variable}) => variable))
        ], 15 + 6 * (number.end - number.start), {prep})
      }
      const hostEntities = clause.entities.filter((entity) =>
        entity.end === prep.start - 1 && entity.role !== 'complement' && !entity.relation)
      for (const entity of nominals.filter((item) => item.start === prep.end + 1 &&
          (!number || item.head !== number.head))) {
        const requirement = tokens[prep.start].tags.includes('preposition') ? [tokenTag(prep.start, 'preposition')] : []
        const weight = 12 + 6 * (entity.end - entity.start)
        const item = {...entity, constraints: [...entity.constraints, ...requirement]}
        const options = []
        if (predicateHosts.length) {
          const preferred = prep === prepositions[0] && prep.space &&
            predicateHosts.some(({index}) => tokens[index].acts.includes('place'))
          options.push(addEntity(item, 'prepositional', [disjunction(predicateHosts.map(({variable}) => variable))],
            weight + (preferred ? 3 : 0), {prep}))
        }
        for (const host of hostEntities) {
          options.push(addEntity(item, 'prepositional', [host.variable], weight, {host, prep}))
        }
        if (!options.length) options.push(addEntity(item, 'prepositional', [], weight, {prep}))
        atMostOne(options.map(({variable}) => variable))
        for (const option of options) {
          const ends = new Map([[entity.end, [option]]])
          const members = nominals.filter(({start}) => start > entity.end)
            .toSorted((a, b) => a.start - b.start || a.end - b.end)
          for (const member of members) {
            let boundary = member.start - 1
            const cues = []
            if (tokens[boundary]?.tags.includes('conjunction')) cues.unshift(boundary--)
            if (tokens[boundary]?.surface === ',') cues.unshift(boundary--)
            if (!cues.length) continue
            const predecessors = ends.get(boundary)
            if (!predecessors) continue
            const requirements = cues.filter((index) => tokens[index].surface !== ',')
              .map((index) => tokenTag(index, 'conjunction'))
            const bonus = prep.kind === 'between' && predecessors.includes(option) ? 3 : 0
            const item = addEntity(member, 'prepositional-member',
              [disjunction(predecessors.map(({variable}) => variable)), ...requirements],
              10 + bonus + 6 * (member.end - member.start), {parent: option, cues})
            if (!ends.has(member.end)) ends.set(member.end, [])
            ends.get(member.end).push(item)
          }
        }
      }
    }

    const coordinatedGroups = new Map()
    for (const entity of clause.entities) {
      if (!['object', 'subject', 'fragment'].includes(entity.role)) continue
      const startOfGroup = tokens.slice(clause.start, entity.start).findLast((token) =>
        token.tags.includes('conjunction') || token.surface === ',')?.index ?? clause.start
      const key = `${entity.role}:${startOfGroup}`
      if (!coordinatedGroups.has(key)) coordinatedGroups.set(key, [])
      coordinatedGroups.get(key).push(entity.variable)
    }
    for (const variables of coordinatedGroups.values()) atMostOne(variables)

    for (const predicate of predicates) {
      const {frames} = tokens[predicate.index]
      const rolePreferences = [
        ['object', 'transitive', 'intransitive'],
        ['indirect', 'double_object'],
        ['complement', 'predicative', undefined, 'object_predicative'],
        ['prepositional', 'oblique', undefined, 'object_oblique']
      ]
      for (const [role, positive, negative, other] of rolePreferences) {
        const choices = clause.entities.filter((entity) => entity.role === role &&
          entity.start > predicate.index).map(({variable}) => variable)
        if (!choices.length) continue
        const occupiesRole = disjunction(choices)
        if (frames.has(positive) || frames.has(other)) prefer(`(=> ${predicate.variable} ${occupiesRole})`, 2)
        else if (negative && frames.has(negative)) prefer(`(=> ${predicate.variable} (not ${occupiesRole}))`, 2)
      }
    }

    const complements = clause.entities.filter(({role}) => role === 'complement')
    atMostOne(clause.entities.filter(({role}) => role === 'complement' || role === 'predicative').map(({variable}) => variable))
    const occupied = Array.from({length: clause.end - clause.start + 1}, () => [])
    for (const {index, variable} of predicates) occupied[index - clause.start].push(variable)
    for (const {start, end, variable, prep, cues} of clause.entities) {
      if (prep) for (let index = prep.start; index <= prep.end; index++) occupied[index - clause.start].push(variable)
      for (const cue of cues ?? []) occupied[cue - clause.start].push(variable)
      for (let index = start; index <= end; index++) occupied[index - clause.start].push(variable)
    }
    for (const variables of occupied) atMostOne(variables)

    // Prefer a prenominal adjective inside its noun phrase.
    for (const entity of complements) {
      const nextNominal = nominals.some((nominal) => nominal.start <= entity.end && nominal.end > entity.end)
      if (nextNominal) prefer(`(not ${entity.variable})`, 6)
    }
    const indirect = clause.entities.filter((item) => item.role === 'indirect')
    const spatial = clause.entities.filter((item) => item.role === 'prepositional' && item.prep.space)
    const newObjects = clause.entities.filter((item) =>
      item.role === 'object' && ['a', 'an', 'some'].includes(tokens[item.start].lower))
    for (const [index, predicate] of predicates.entries()) {
      const particles = clause.entities.filter((item) => item.licenses?.has(predicate.index))
      const noParticle = `(not ${disjunction(particles.map(({variable}) => variable))})`
      const noTransfer = `(not ${disjunction(indirect.map(({variable}) => variable))})`
      const contextualEvidence = { change: complements, place: spatial, make: newObjects }
      let senseIndex = 0
      const chooseActs = (acts, required, source) => acts.flatMap((act) => {
        const conditions = [predicate.variable, required]
        if (act !== 'send') conditions.push(noTransfer)
        if (acts.length > 1) {
          const evidence = contextualEvidence[act] ?? []
          if (!evidence.length) return []
          conditions.push(disjunction(evidence.map(({variable}) => variable)))
        }
        const variable = select(`a${index}_`, clauseIndex, senseIndex++, conjunction(conditions), 1, false)
        return [{act, variable, conditions, source}]
      })
      predicate.acts = [
        ...chooseActs(tokens[predicate.index].acts, noParticle),
        ...particles.flatMap((item) => {
          const acts = [...new Set(item.licenses.get(predicate.index).map(({act}) => act).filter(Boolean))]
          return chooseActs(acts, item.variable, item.head)
        })
      ]
      const options = predicate.acts.map(({variable}) => variable)
      atMostOne(options)
      for (const {conditions} of predicate.acts) {
        push(`(=> ${conjunction(conditions)} ${disjunction(options)})`)
      }
    }

  }
  const coordinating = Map.groupBy(clauses.filter((clause) => clause.coordinator !== undefined),
    (clause) => clause.planTo)
  for (const [index, next] of clauses.entries()) {
    if (!next.firstInPlan) continue
    const previous = coordinating.get(next.planFrom) ?? []
    const negativeScopes = []
    const disjunctionScopes = []
    for (const prior of previous) {
      const cue = prior.coordinators.map((position) => tokens[position].lower)
        .find((word) => word === 'and' || word === 'or')
      if (cue !== 'and' && cue !== 'or') continue
      const negatives = prior.predicates.filter((predicate) =>
        tokens.slice(prior.start, predicate.index).some((token) => token.negation)).map(({variable}) => variable)
      if (prior.inheritedNegation) negatives.push(prior.inheritedNegation)
      negativeScopes.push(...negatives)
      if (cue === 'or') disjunctionScopes.push(...negatives)
    }
    const barePredicates = next.predicates.filter((predicate) =>
      tokens.slice(next.start, predicate.index).every((token) => token.filler)).map(({variable}) => variable)
    if (!negativeScopes.length || !barePredicates.length) continue
    const variable = `neg${index}`
    const licensed = conjunction([disjunction(negativeScopes), disjunction(barePredicates)])
    assertions.push(`(declare-const ${variable} Bool)`)
    push(`(=> ${variable} ${licensed})`)
    if (disjunctionScopes.length) {
      const disjunctionScope = conjunction([disjunction(disjunctionScopes), disjunction(barePredicates)])
      prefer(`(=> ${disjunctionScope} ${variable})`, 3)
    }
    query.push(variable)
    block.push(variable)
    next.inheritedNegation = variable
  }
  return {text, tokens, clauses, smt: assertions.join('\n'), query, block}
}

export function decodeSyntaxAnalysis(encoded, model) {
  const tokens = encoded.tokens.map((token) => ({...token, pos: allowedTags[model.get(`p${token.index}`)] ?? token.tags[0]}))
  const selected = encoded.clauses.map((clause, index) => ({clause, index}))
    .filter(({clause}) => model.get(clause.active))
  const positions = new Map(selected.map(({index}, position) => [index, position]))
  const clauses = selected.map(({clause}) => {
    const predicate = clause.predicates.find(({variable}) => model.get(variable))
    return {...clause, gratitude: model.get(clause.expression) === true, predicate,
      complement: positions.get(clause.complement), relative: positions.get(clause.relative),
      adjunct: positions.get(clause.adjunct),
      action: predicate?.acts.find(({variable}) => model.get(variable)),
      inheritedNegation: model.get(clause.inheritedNegation) === true,
      entities: clause.entities.filter(({variable}) => model.get(variable))}
  })
  return {text: encoded.text, tokens, clauses}
}
