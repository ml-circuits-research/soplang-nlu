import { fmtSopValue } from './contracts.mjs'
import { decodeSyntaxAnalysis, encodeSyntaxAnalysis } from './analysis-model.mjs'

const atom = (value) => /^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(value) ? value : undefined
const sourceField = (name, value) => `${name}=${fmtSopValue(value, {asString: true})}`
const refField = (name, id) => `${name}=$${id}`
const wire = (id, type, fields) => `@${id} nlu.${type} ${fields.join(' ')}`

function emitAnalysis(decoded, kb, objective) {
  const {text, tokens, clauses} = decoded
  const lines = []
  const semanticEvidence = []
  const covered = new Set()
  const entities = new Map()
  let coordinationCount = 0
  let relationCount = 0
  const surface = (start, end = start) => text.slice(tokens[start].start, tokens[end].end)
  function quote(name, start, end = start) {
    for (let index = start; index <= end; index++) covered.add(index)
    return sourceField(name, surface(start, end))
  }
  function meaning(id, fields, key, value, source, binding) {
    if (typeof value !== 'string' || !atom(value)) return
    fields.push(`${key}=${value}`)
    semanticEvidence.push({wire: id, key, value, source, binding})
  }

  function coordination(items, cues) {
    const id = 'coord' + ++coordinationCount
    const kind = cues.some((index) => tokens[index].lower === 'or') ? 'alternative' : 'additive'
    lines.push(wire(id, 'coordination', [
      'kind=' + kind,
      ...items.map((item) => refField('member', item)),
      ...cues.map((index) => quote('cue', index))
    ]))
    return id
  }

  function entityLine(item, index, question) {
    const id = 'e' + index
    const head = tokens[item.head]
    const fields = []
    for (let modifier = item.start; modifier < item.head; modifier++) {
      if (modifier === question) continue
      const token = tokens[modifier]
      const key = token.pos === 'determiner' && !fields.some((field) => field.startsWith('determiner=')) ? 'determiner'
        : token.pos === 'numeral' && !fields.some((field) => field.startsWith('quantity=')) ? 'quantity'
        : 'modifier'
      fields.push(quote(key, modifier))
      const color = kb.domain.colours.get(token.lower)
      if (token.pos === 'adjective' && typeof color === 'string' && atom(color) &&
          !fields.some((field) => field.startsWith('color='))) {
        meaning(id, fields, 'color', color, [{slot: key, text: token.surface}], 'Z3 colour vocabulary')
      }
    }
    if (item.head === question) return
    if (head.pos === 'pronoun') {
      fields.push(quote('pronoun', item.head))
    } else if (head.pos === 'proper' || head.pos === 'quote') {
      fields.push(quote('name', item.head))
    } else {
      fields.push(quote('head', item.head))
      const shape = head.lemmas.map((lemma) => kb.domain.shapes.get(lemma)).find((value) => typeof value === 'string')
      const family = head.lemmas.find((lemma) => kb.catalog.familyWords.get(lemma)?.has(lemma))
      meaning(id, fields, 'kind', shape ?? family, [{slot: 'head', text: head.surface}],
        shape ? 'Z3 shape vocabulary' : 'Z3 request family vocabulary')
    }
    if (item.zone !== undefined) fields.push(quote('modifier', item.zone))
    entities.set(item, id)
    lines.push(wire(id, 'entity', fields))
  }

  const selectedClauses = []
  let entityIndex = 0
  for (const [index, clause] of clauses.entries()) {
    const id = 'c' + (index + 1)
    const items = clause.entities.toSorted((a, b) => a.start - b.start || a.end - b.end)
    const {predicate, terminator} = clause
    const question = tokens.slice(clause.start, predicate?.index ?? clause.end + 1)
      .find((token) => kb.grammar.whWords.has(token.lower))?.index
    for (const item of items.filter(({role}) => role !== 'complement' && role !== 'particle')) entityLine(item, ++entityIndex, question)
    const roles = (role) => items.filter((item) => item.role === role && entities.has(item))
    const subject = roles('subject')
    const objects = roles(predicate ? 'object' : 'fragment')
    const form = clause.gratitude ? 'fragment'
      : question !== undefined || tokens[terminator]?.surface === '?' ? 'interrogative'
      : !predicate ? 'fragment' : subject.length ? 'declarative' : 'imperative'
    const fields = ['form=' + form]
    if (clause.gratitude) {
      fields.push(quote('expression', clause.start, clause.expressionEnd))
      meaning(id, fields, 'speech_act', 'gratitude',
        [{slot: 'expression', text: surface(clause.start, clause.expressionEnd)}], 'Z3 discourse lexicon')
      fields.push(...clause.separators.map((separator) => quote('separator', separator)))
    }
    if (predicate) {
      fields.push(quote('predicate', predicate.index))
      if (clause.action) {
        const source = [{slot: 'predicate', text: tokens[predicate.index].surface}]
        if (clause.action.source !== undefined) {
          source.push({slot: 'particle', text: tokens[clause.action.source].surface})
        }
        meaning(id, fields, 'act', clause.action.act.replaceAll(' ', '_'), source, 'Z3 action binding')
      }
      const prefix = tokens.slice(clause.start, predicate.index)
      for (const token of prefix) {
        if (token.negation && !covered.has(token.index)) fields.push(quote('negation', token.index))
        else if (token.pos === 'auxiliary' && !covered.has(token.index)) fields.push(quote('auxiliary', token.index))
      }
      fields.push('polarity=' + (clause.inheritedNegation || prefix.some((token) => token.negation)
        ? 'negative' : 'positive'))
    }
    if (!clause.gratitude && question !== undefined) fields.push(quote('question', question))
    if (clause.complement !== undefined && clauses[clause.complement].predicate) {
      const child = 'c' + (clause.complement + 1)
      fields.push(refField('clausal_complement', child))
      if (clause.complementCue !== undefined) {
        lines.push(wire('rel' + ++relationCount, 'relation', ['kind=complement',
          refField('from', id), refField('to', child), quote('cue', clause.complementCue)]))
      }
    }
    if (terminator !== undefined) fields.push(quote('terminator', terminator))
    const roleReference = (role, group) => {
      if (!group.length) return
      const members = group.map((item) => entities.get(item))
      const cues = group.slice(1).flatMap((item, groupIndex) => tokens.slice(group[groupIndex].end + 1, item.start)
        .filter((token) => token.pos === 'conjunction' || token.surface === ',').map((token) => token.index))
      fields.push(refField(role, group.length > 1 ? coordination(members, cues) : members[0]))
    }
    roleReference('subject', subject)
    roleReference(predicate ? 'direct_object' : 'topic', objects)
    roleReference('indirect_object', roles('indirect'))
    const complement = items.find((item) => item.role === 'complement')
    if (complement) {
      fields.push(quote('result_complement', complement.start, complement.end))
      const color = kb.domain.colours.get(tokens[complement.head].lower)
      meaning(id, fields, 'result_color', color,
        [{slot: 'result_complement', text: surface(complement.start, complement.end)}], 'Z3 colour vocabulary')
    }
    for (const particle of items.filter(({role}) => role === 'particle')) {
      fields.push(quote('particle', particle.start, particle.end))
    }

    selectedClauses.push({id, fields, clause})

    for (const item of roles('prepositional')) {
      const from = entities.get(item.host) ?? id
      const member = roles('prepositional-member').find((candidate) => candidate.parent === item)
      const to = member ? coordination([entities.get(item), entities.get(member)], [item.end + 1]) : entities.get(item)
      const passive = predicate && /(?:ed|en)$/u.test(tokens[predicate.index].lower) &&
        tokens.slice(clause.start, predicate.index).some((token) => token.pos === 'auxiliary' && token.copula)
      const cue = tokens[item.prep.start].lower
      const kind = item.relation ?? (clause.gratitude && cue === 'for' && from === id ? 'reason'
        : passive && cue === 'by' && from === id ? 'agent' : item.prep.kind)
      const relation = 'rel' + ++relationCount
      const fields = []
      const source = [{slot: 'cue', text: surface(item.prep.start, item.prep.end)}]
      if (item.relation) source.push({wire: entities.get(item), slot: 'head', text: tokens[item.head].surface})
      meaning(relation, fields, 'kind', atom(kind) ?? 'prepositional', source,
        item.relation ? 'Z3 numeric prepositional argument' : 'Z3 preposition binding')
      fields.push(refField('from', from), refField('to', to), quote('cue', item.prep.start, item.prep.end))
      lines.push(wire(relation, 'relation', fields))
    }
  }

  let clauseGroup = []
  let clauseCues = []
  for (const {id, clause} of selectedClauses) {
    if (clause.gratitude) continue
    clauseGroup.push(id)
    if (clause.coordinator !== undefined) {
      clauseCues.push(clause.coordinator)
    } else {
      if (clauseGroup.length > 1) coordination(clauseGroup, clauseCues)
      clauseGroup = []
      clauseCues = []
    }
  }

  if (!selectedClauses.length && tokens.length) selectedClauses.push({id: 'c1', fields: ['form=fragment'], clause: {start: 0}})
  const gaps = []
  for (const token of tokens) {
    if (covered.has(token.index)) continue
    const owner = selectedClauses.findLast(({clause}) => token.index >= clause.start) ?? selectedClauses[0]
    if (token.filler) owner.fields.push(quote('filler', token.index))
    else if (owner.clause.predicate && token.pos === 'adverb' && !token.negation) {
      owner.fields.push(quote('adverb', token.index))
    } else {
      owner.fields.push(quote('unresolved', token.index))
      gaps.push({start: token.start, end: token.end, text: token.surface})
    }
  }
  for (const {id, fields} of selectedClauses) lines.push(wire(id, 'clause', fields))
  return {sop: lines.join('\n'), objective, unresolved: gaps, semanticEvidence,
    tokens: tokens.map(({surface, start, end, pos}) => ({text: surface, start, end, pos}))}
}

export async function analyseWithZ3(text, {kb, lexicon, runner, timeout, topK = 4}) {
  const encoded = encodeSyntaxAnalysis(text, kb, lexicon)
  const limit = Math.min(8, Math.max(1, topK))
  const solved = await runner.solve(encoded.smt, encoded.query, {timeout, topK: limit, blockVars: encoded.block})
  if (!solved.ok) return {analyses: [], analysisDiagnostics: {solver: 'z3', status: solved.status, error: solved.error}}
  const analyses = []
  const seen = new Set()
  const best = solved.objectives[0]
  for (const [index, model] of solved.solutions.entries()) {
    const objective = solved.objectives[index]
    if (typeof best === 'number' && typeof objective === 'number' && objective > best + 2) break
    const analysis = emitAnalysis(decodeSyntaxAnalysis(encoded, model), kb, objective)
    if (seen.has(analysis.sop)) continue
    seen.add(analysis.sop)
    analyses.push(analysis)
  }
  return {analyses, analysisDiagnostics: {solver: 'z3', status: solved.status, solvedModels: solved.solutions.length}}
}
