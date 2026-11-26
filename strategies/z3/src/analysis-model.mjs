import { lemmatiseVerb, lemmatiseWord } from './lattice/morph.mjs'

const tokenPattern = /"(?:[^"\\]|\\.)*"|“[^”]*”|'(?:[^'\\]|\\.)*'|‘[^’]*’|(?<clock>[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)(?![\p{L}\p{M}\p{N}_])|(?<decimal>[+-]?(?:[0-9]+\.[0-9]+|\.[0-9]+))(?![\p{L}\p{M}\p{N}_])|[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*|[^\s]/gu
const allowedTags = ['unknown', 'verb', 'noun', 'pronoun', 'proper', 'determiner', 'adjective', 'adverb',
  'auxiliary', 'preposition', 'conjunction', 'numeral', 'ordinal', 'particle', 'interjection', 'quote']
const nominalTags = ['noun', 'pronoun', 'proper', 'quote']
const modifierTags = ['determiner', 'adjective', 'numeral', 'ordinal']
const linkingVerbs = new Set(['be', 'become', 'feel', 'look', 'remain', 'seem', 'smell', 'sound', 'taste'])
const temporalAdverbs = new Set(['now', 'today', 'tomorrow', 'yesterday', 'tonight', 'already'])
const contentVerbs = new Set(['believe', 'know', 'say', 'think', 'see', 'hear', 'hope', 'notice', 'remember'])
const quotedArgumentVerbs = new Set(['call', 'label', 'name', 'print', 'quote', 'rename', 'say', 'type', 'write'])
const clockPrepositions = new Map([['at', 'time'], ['from', 'from'], ['until', 'until'], ['to', 'to']])
const timeZone = /^(?:UTC|GMT|[ECMP][SD]T|CET|CEST|EET|EEST|BST|IST|JST)$/u
const numericFrames = new Map([
  ['by', {relation: 'factor', verbs: new Set(['multiply', 'scale'])}],
  ['to', {relation: 'target_value', verbs: new Set(['adjust', 'change', 'decrease', 'increase', 'lower', 'raise', 'resize', 'scale', 'set'])}]
])
const hardBoundary = new Set(['.', ':', '!', '?', ';'])
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
    for (const stem of lemmas) {
      for (const tag of lexicon.classes.get(stem) ?? []) {
        if (tag === 'verb' || tag === 'noun' || tag === 'adjective') tags.add(tag)
      }
    }
    const acts = [...new Set(lemmatiseVerb(lower, kb).flatMap((stem) => (kb.verbs.get(stem) ?? []).map(({act}) => act)))]
    if (acts.length) tags.add('verb')
    if (kb.grammar.pronouns.has(lower)) tags.add('pronoun')
    if (kb.grammar.determiners.has(lower)) tags.add('determiner')
    if (kb.grammar.prepositions.has(lower) || lower === 'than') tags.add('preposition')
    if (kb.grammar.auxiliaries.has(lower)) tags.add('auxiliary')
    if (kb.grammar.joiners.has(lower)) tags.add('conjunction')
    if (kb.grammar.ordinals.has(lower)) tags.add('ordinal')
    if (particles.has(lower)) tags.add('particle')
    const literal = match.groups.clock ? 'clock' : match.groups.decimal ? 'decimal' : undefined
    const numeric = literal || /^\p{N}+$/u.test(surface) || (lower !== 'one' && tags.has('numeral'))
    if (numeric) tags.add('numeral')
    if (/^["“'‘].+["”'’]$/su.test(surface)) tags.add('quote')
    if (/^\p{Lu}\p{L}*$/u.test(surface) && (index > 0 || !tags.size)) tags.add('proper')
    if (kb.domain.shapes.has(lower) || kb.catalog.familyWords.has(lower)) tags.add('noun')
    if (kb.domain.colours.has(lower) || /(?:able|ible|ous|less)$/u.test(lower)) tags.add('adjective')
    const negation = lexicon.negative.has(lower) || [...lexicon.negativeEndings].some((suffix) => lower.endsWith(suffix))
    if (negation && !tags.size) tags.add('adverb')
    if (temporalAdverbs.has(lower)) tags.add('adverb')
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
      acts, copula, linking, negation, filler, lemmas, literal}
  }).map((token, index, tokens) => {
    if (index > 0 && token.tags[0] === 'unknown' && /^\p{L}+$/u.test(token.surface) &&
        tokens[index - 1].tags.includes('determiner')) {
      return {...token, tags: ['noun', 'unknown']}
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
    candidates.push({index, weight: weight + (beginning ? 9 : 0)})
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

function clauseRanges(tokens, discourse) {
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
    } else if (index > start && (token.tags.includes('conjunction') || token.surface === ',') &&
      !discourse.has(index + 1)) {
      const left = predicateCandidates(tokens, start, index - 1)
      let next = index + 1
      while (tokens[next] && (tokens[next].filler || tokens[next].negation || tokens[next].lower === 'then')) next++
      if (left.length && tokens[next]?.tags.includes('verb')
          && (tokens[next].acts.length || !tokens[next].tags.includes('noun'))) {
        add(index - 1)
        clauses.at(-1).coordinator = index
        start = index + 1
      }
    }
  }
  add(tokens.length - 1)
  const expanded = []
  for (const clause of clauses) {
    const matrix = !clause.gratitude && predicateCandidates(tokens, clause.start, clause.end).find(({index}) =>
      index > clause.start && tokens[index].lemmas.some((lemma) => contentVerbs.has(lemma)))
    const cue = matrix && tokens[matrix.index + 1]?.lower === 'that' ? matrix.index + 1 : undefined
    const start = matrix ? (cue ?? matrix.index) + 1 : clause.end + 1
    const hasSubject = tokens[start]?.tags.some((tag) => ['determiner', ...nominalTags].includes(tag))
    const embedded = hasSubject && predicateCandidates(tokens, start, clause.end).find(({index}) => index > start)
    if (embedded) {
      expanded.push({start: clause.start, end: matrix.index, complement: expanded.length + 1, complementCue: cue})
      expanded.push({...clause, start})
    } else {
      expanded.push(clause)
    }
  }
  return expanded
}

function nominalCandidates(tokens, first, last) {
  const entities = []
  for (let head = first; head <= last; head++) {
    const token = tokens[head]
    const tags = token.tags.filter((tag) => nominalTags.includes(tag))
    if (!tags.length) continue
    let start = head
    while (start > first && !tokens[start].tags.includes('determiner') &&
        tokens[start - 1].tags.some((tag) => modifierTags.includes(tag))) start--
    for (let index = start; index <= head; index++) {
      const constraints = [disjunction(tags.map((tag) => tokenTag(head, tag)))]
      for (let modifier = index; modifier < head; modifier++) {
        constraints.push(disjunction(modifierTags.filter((tag) => tokens[modifier].tags.includes(tag)).map((tag) => tokenTag(modifier, tag))))
      }
      entities.push({start: index, end: head, head, tags, constraints})
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
      if (kb.grammar.prepositions.has(key) || key === 'than') {
        const previous = prepositions.at(-1)
        if (previous?.start === first) prepositions.pop()
        const info = kb.grammar.prepositions.get(key) ?? {rel: 'comparison'}
        prepositions.push({start: first, end: last, kind: info.rel ?? 'prepositional', space: info.space})
      }
    }
    if (prepositions.at(-1)?.start === first) first = prepositions.at(-1).end
  }
  return prepositions
}

function numericLandmark(tokens, prep, clause, predicates, kb) {
  const head = prep.end + 1
  const number = tokens[head]
  if (head > clause.end || !number?.literal) return null
  const cue = tokens[prep.start].lower
  let relation
  let hosts = predicates
  if (number.literal === 'clock') {
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

export function encodeSyntaxAnalysis(text, kb, lexicon) {
  const tokens = inputTokens(text, kb, lexicon)
  const discourse = detachedGratitude(tokens, kb, lexicon.gratitude)
  const clauses = clauseRanges(tokens, discourse)
  for (const {start} of discourse.values()) {
    if (!tokens[start].tags.includes('interjection')) tokens[start].tags.unshift('interjection')
  }
  const assertions = []
  const query = []
  const block = []
  const push = (formula) => assertions.push(`(assert ${formula})`)
  const prefer = (formula, weight) => assertions.push(`(assert-soft ${formula} :weight ${weight})`)
  const select = (prefix, clauseIndex, itemIndex, condition, weight) => {
    const variable = `${prefix}${clauseIndex}_${itemIndex}`
    assertions.push(`(declare-const ${variable} Bool)`)
    push(`(=> ${variable} ${condition})`)
    prefer(variable, weight)
    query.push(variable)
    block.push(variable)
    return variable
  }
  const atMostOne = (variables) => {
    if (variables.length > 1) push(`((_ at-most 1) ${variables.join(' ')})`)
  }

  for (const token of tokens) {
    const variable = `p${token.index}`
    assertions.push(`(declare-const ${variable} Int)`)
    push(disjunction(token.tags.map((tag) => tokenTag(token.index, tag))))
    prefer(tokenTag(token.index, token.tags[0]), 1)
    query.push(variable)
  }

  for (const [clauseIndex, clause] of clauses.entries()) {
    if (clause.gratitude) {
      clause.expression = select('g', clauseIndex, 0, tokenTag(clause.start, 'interjection'), 1)
      push(clause.expression)
    }
    const predicates = clause.gratitude ? [] : predicateCandidates(tokens, clause.start, clause.end)
    for (const [index, predicate] of predicates.entries()) {
      predicate.variable = select('v', clauseIndex, index, tokenTag(predicate.index, 'verb'), predicate.weight)
    }
    atMostOne(predicates.map(({variable}) => variable))
    clause.predicates = predicates
    clause.entities = []
    const nominalStart = clause.gratitude ? clause.expressionEnd + 1 : clause.start
    const nominals = nominalCandidates(tokens, nominalStart, clause.end)
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
      const inverted = (predicate) => tokens[predicate.index].copula && tokens[clause.start].lower === 'where'
      const preceding = predicates.filter((predicate) => predicate.index < entity.start && !inverted(predicate) &&
        !(tokens[predicate.index].linking && entity.start === entity.head &&
          tokens[entity.head].tags.includes('adjective') && !tokens[entity.head].tags.includes('proper')))
      const following = predicates.filter((predicate) => predicate.index > entity.end ||
        (inverted(predicate) && predicate.index < entity.start))
      const weight = 11 + 6 * (entity.end - entity.start)
      const conditions = prepositions.filter((prep) => prep.start <= entity.end)
        .map((prep) => `(not ${prepConstraint(prep)})`)
      variants(entity, 'subject', following, weight, conditions)
      variants(entity, 'object', preceding, weight, conditions)
      addEntity(entity, 'fragment', [`(not ${disjunction(predicates.map(({variable}) => variable))})`, ...conditions], weight - 1)
    }

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
        tokens[predicate.index].lemmas.some((lemma) => kb.grammar.benefactiveVerbs.has(lemma)))
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
      const modifier = tokens[head - 1]
      if (head > clause.start && modifier.tags.includes('adverb') && !modifier.negation && !modifier.filler) {
        variants({...entity, start: head - 1, constraints: [constraint, tokenTag(head - 1, 'adverb')]},
          'complement', preceding.filter((predicate) => predicate.index < head - 1), 8, conditions)
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
      for (const entity of nominals.filter((item) => item.start === prep.end + 1)) {
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
        if (prep.kind === 'between' && tokens[entity.end + 1]?.tags.includes('conjunction')) {
          for (const option of options) {
            for (const member of nominals.filter((nominal) => nominal.start === entity.end + 2)) {
              addEntity(member, 'prepositional-member', [option.variable,
                tokenTag(entity.end + 1, 'conjunction')], 10 + 6 * (member.end - member.start), {parent: option})
            }
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

    const complements = clause.entities.filter(({role}) => role === 'complement')
    atMostOne(complements.map(({variable}) => variable))
    const occupied = Array.from({length: clause.end - clause.start + 1}, () => [])
    for (const {index, variable} of predicates) occupied[index - clause.start].push(variable)
    for (const {start, end, variable} of clause.entities) {
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
        const variable = select(`a${index}_`, clauseIndex, senseIndex++, conjunction(conditions), 1)
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
  for (let index = 1; index < clauses.length; index++) {
    const prior = clauses[index - 1]
    const next = clauses[index]
    if (prior.coordinator === undefined) continue
    const cue = tokens[prior.coordinator].lower
    if (cue !== 'and' && cue !== 'or') continue
    const negativePredicates = prior.predicates.filter((predicate) =>
      tokens.slice(prior.start, predicate.index).some((token) => token.negation)).map(({variable}) => variable)
    if (prior.inheritedNegation) negativePredicates.push(prior.inheritedNegation)
    const barePredicates = next.predicates.filter((predicate) =>
      tokens.slice(next.start, predicate.index).every((token) => token.filler) &&
      !tokens.slice(next.start, predicate.index).some((token) => token.negation)).map(({variable}) => variable)
    if (!negativePredicates.length || !barePredicates.length) continue
    const variable = `neg${index}`
    const licensed = conjunction([disjunction(negativePredicates), disjunction(barePredicates)])
    assertions.push(`(declare-const ${variable} Bool)`)
    push(`(=> ${variable} ${licensed})`)
    // A shared negative disjunction is the conventional reading. A bare
    // "and" leaves narrow and wide scope as equal alternatives.
    if (cue === 'or') prefer(`(=> ${licensed} ${variable})`, 3)
    query.push(variable)
    block.push(variable)
    next.inheritedNegation = variable
  }
  return {text, tokens, clauses, smt: assertions.join('\n'), query, block}
}

export function decodeSyntaxAnalysis(encoded, model) {
  const tokens = encoded.tokens.map((token) => ({...token, pos: allowedTags[model.get(`p${token.index}`)] ?? 'unknown'}))
  const clauses = encoded.clauses.map((clause) => {
    const predicate = clause.predicates.find(({variable}) => model.get(variable))
    return {...clause, gratitude: model.get(clause.expression) === true, predicate, action: predicate?.acts.find(({variable}) => model.get(variable)),
      inheritedNegation: model.get(clause.inheritedNegation) === true, entities: clause.entities.filter(({variable}) => model.get(variable))}
  })
  return {text: encoded.text, tokens, clauses}
}
