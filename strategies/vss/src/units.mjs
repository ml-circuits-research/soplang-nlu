// From stations to units. A unit is a run of tokens whose stations belong together: one
// entity, one verb group, one cue. Nothing here looks at a particular word: the stations,
// the lexicon of learned word habits and the legend decide.
import {stemsOf} from './forms.mjs'

const NOMINAL = new Set(['determiner', 'quantity', 'degree', 'modifier', 'noun', 'name', 'pronoun', 'literal'])
const VERBAL = new Set(['auxiliary', 'negation', 'predicate', 'following'])
const SINGLE = new Set(['marker', 'question', 'adverb', 'filler', 'separator', 'conjunction', 'possessive', 'negation'])

/**
 * @param tokens observations of the message
 * @param stations station name per token
 * @param lexicon {nominal(word), verbal(word), canBe(word, station), formOf(word)}
 * @returns units in text order: {type, first, last, ...slots as token positions}
 */
export function buildUnits(tokens, stations, lexicon) {
  const units = []
  const n = tokens.length
  const at = i => i < n ? stations[i] : null
  let i = 0
  while (i < n) {
    const station = stations[i]
    if (NOMINAL.has(station)) {
      const entity = readEntity(i)
      if (entity) {
        i = entity.last + 1
        // "Jan's office chair": the first entity owns the second
        if (at(i) === 'possessive' && NOMINAL.has(at(i + 1)) && at(i + 1) !== 'pronoun') {
          const owned = readEntity(i + 1)
          if (owned?.type === 'entity' && entity.type === 'entity') {
            owned.possessor = entity
            owned.possessiveMarker = i
            owned.first = entity.first
            units.push(owned)
            i = owned.last + 1
            continue
          }
        }
        units.push(entity)
        continue
      }
    }
    if (VERBAL.has(station) && station !== 'negation' || station === 'negation' && VERBAL.has(at(i + 1))) {
      const group = readVerbGroup(i)
      units.push(group)
      i = group.last + 1
      continue
    }
    if (station === 'cue') {
      let j = i
      while (at(j + 1) === 'cue') j++
      units.push({type: 'cue', first: i, last: j})
      i = j + 1
      continue
    }
    const grades = position => at(position) === 'degree' || at(position) === 'adverb' && lexicon.canBe(tokens[position].word, 'degree') &&
      (at(position + 1) === 'complement' || at(position + 1) === 'modifier' && !NOMINAL.has(at(position + 2)))
    if (station === 'complement' || station === 'degree' || station === 'modifier' || grades(i)) {
      // bare modifiers without a head: what something is made to be
      let j = i
      const degree = []
      while (grades(j)) degree.push(j++)
      const start = j
      while (at(j) === 'complement' || at(j) === 'modifier') j++
      if (j > start) units.push({type: 'complement', first: i, last: j - 1, degree, value: [start, j - 1]})
      else units.push({type: 'adverb', first: i, last: j - 1})
      i = Math.max(j, i + 1)
      continue
    }
    if (station === 'expression' || station === 'terminator') {
      let j = i
      while (at(j + 1) === station) j++
      units.push({type: station, first: i, last: j})
      i = j + 1
      continue
    }
    units.push({type: SINGLE.has(station) ? station : 'other', first: i, last: i})
    i++
  }
  // "Box A": a grammar word written with a capital right after a thing is part of its name
  for (let k = 1; k < units.length; k++) {
    const letter = units[k], thing = units[k - 1]
    if (letter.type !== 'other' || letter.first !== letter.last || thing.type !== 'entity' || thing.pronoun || thing.last !== letter.first - 1) continue
    if (tokens[letter.first].text === tokens[letter.first].text.toLowerCase()) continue
    thing.name = thing.name ? [thing.name[0], letter.first] : [letter.first, letter.first]
    thing.last = letter.first
    units.splice(k, 1)
    k--
  }
  // "all the arrows": a word that could stand alone joins the determiner of what follows it
  for (let k = 0; k + 1 < units.length; k++) {
    const lone = units[k], next = units[k + 1]
    if (lone.type !== 'entity' || !lone.pronoun || next.type !== 'entity' || !next.determiner?.length || next.first !== lone.last + 1) continue
    if (!lexicon.canBe(tokens[lone.first].word, 'determiner')) continue
    next.determiner = [lone.first, ...next.determiner]
    next.first = lone.first
    units.splice(k, 1)
  }
  // "approximately 73 words": an adverb that grades stands with the measure after it
  for (let k = 0; k + 1 < units.length; k++) {
    const grade = units[k], measure = units[k + 1]
    if (grade.type !== 'adverb' || grade.first !== grade.last || measure.type !== 'entity' || !(measure.literal || measure.quantity?.length)) continue
    if (measure.first !== grade.last + 1 || !lexicon.grades(tokens[grade.first].word)) continue
    measure.degree = [grade.first, ...measure.degree ?? []]
    measure.first = grade.first
    units.splice(k, 1)
  }
  // "name the x axis Month": after a verb that names things, the name is a thing of its own
  for (let k = 1; k < units.length; k++) {
    const thing = units[k], verb = units[k - 1]
    if (thing.type !== 'entity' || verb.type !== 'verb' || !thing.head || !thing.name || !lexicon.names(tokens[verb.predicate[0]].word)) continue
    const label = {type: 'entity', first: thing.name[0], last: thing.name[1], determiner: [], quantity: [], degree: [], modifier: [], compound: [], name: thing.name}
    thing.last = thing.name[0] - 1
    delete thing.name
    units.splice(k + 1, 0, label)
  }
  // "two more clouds": a count, a word that grades it and the thing counted are one thing
  for (let k = 0; k + 2 < units.length; k++) {
    const count = units[k], grade = units[k + 1], thing = units[k + 2]
    if (!lexicon.leans || count.type !== 'entity' || count.first !== count.last || !(count.literal || count.quantity?.length)) continue
    if (grade.type !== 'adverb' || grade.first !== grade.last || grade.first !== count.last + 1 || !lexicon.canBe(tokens[grade.first].word, 'degree')) continue
    if (thing.type !== 'entity' || thing.pronoun || thing.literal || thing.determiner?.length || thing.quantity?.length || thing.first !== grade.last + 1) continue
    thing.quantity = [count.first]
    thing.degree = [grade.first, ...thing.degree ?? []]
    thing.first = count.first
    units.splice(k, 2)
  }
  // "520 across and 410 down": a measure and the direction right after it are one group
  for (let k = 0; k + 1 < units.length; k++) {
    const measure = units[k], direction = units[k + 1]
    if (measure.type !== 'entity' || !(measure.literal || measure.quantity?.length) || measure.pronoun) continue
    if (direction.type !== 'adverb' || direction.first !== direction.last || units[k + 2]?.type === 'cue') continue
    measure.adverb = [direction.first]
    measure.last = direction.last
    units.splice(k + 1, 1)
  }
  // "a girl waving": a form of a verb that closes an entity after its noun was not a thing
  units.doubts = []
  // "no birds": a word that can stand before a noun as its determiner does so when a noun follows it at once
  for (let k = 0; k + 1 < units.length; k++) {
    const lead = units[k], group = units[k + 1]
    if (!lexicon.leans || lead.type !== 'expression' || lead.first !== lead.last || !lexicon.canBe(tokens[lead.first].word, 'determiner')) continue
    if (group.type !== 'entity' || group.pronoun || group.literal || group.determiner?.length || group.first !== lead.last + 1) continue
    group.determiner = [lead.first]
    group.first = lead.first
    units.splice(k, 1)
  }
  // "it would be nice", "after Thanks": right after a form of "be" or a linking word, a word listed as an exclamation is no exclamation
  for (let k = 1; k < units.length; k++) {
    const said = units[k], before = units[k - 1]
    if (!lexicon.linkOf || said.type !== 'expression' || said.first !== said.last || said.first !== before.last + 1) continue
    const copula = before.type === 'verb' && lexicon.linkOf(tokens[before.predicate[0]].word) === 'predicative'
    if (copula || before.type === 'cue' || before.type === 'marker' && lexicon.canBe(tokens[before.last].word, 'cue')) units.doubts.push({position: said.first, not: 'expression'})
  }
  // "left of the hill", "ahead of it": a single word right before "of" with a thing after it forms the linking phrase with it
  for (let k = 0; k + 2 < units.length; k++) {
    const side = units[k], link = units[k + 1], thing = units[k + 2]
    if (!lexicon.linkOf || !['adverb', 'complement'].includes(side.type) || side.first !== side.last || thing.type !== 'entity') continue
    if (link.type !== 'cue' || link.first !== link.last || link.first !== side.last + 1 || lexicon.linkOf(tokens[link.first].word) !== 'belongs') continue
    link.first = side.first
    units.splice(k, 1)
  }
  // "what's in the diagram": after a pronoun or a question word, a clitic that can be a form of "be" is that verb, not a possessive
  for (let t = 1; t < tokens.length; t++) {
    if (lexicon.linkOf && lexicon.canBe(tokens[t].word, 'possessive') && lexicon.linkOf(tokens[t].word) === 'predicative' && !['predicate', 'following', 'auxiliary'].includes(stations[t]) &&
        ['pronoun', 'question'].includes(stations[t - 1])) units.doubts.push({position: t, is: 'verb'})
  }
  // "a chart that counts users": right after a word that opens a clause about a thing, a word that can be a verb is that verb
  for (let k = 0; k + 1 < units.length; k++) {
    const opener = units[k], next = units[k + 1]
    if (!lexicon.linkOf || opener.type !== 'marker' || opener.first !== opener.last || lexicon.linkOf(tokens[opener.first].word) !== 'relative') continue
    if (next.type !== 'entity' || next.pronoun || next.determiner?.length || tokens[next.first].shape !== 'lower') continue
    const word = tokens[next.first].word
    if (lexicon.sForm(word) || lexicon.kindsOf(word).verb >= 3) units.doubts.push({position: next.first, is: 'verb'})
  }
  // "where they stand": a word that can only be a subject is followed by its verb
  for (let k = 0; k + 1 < units.length; k++) {
    const doer = units[k], next = units[k + 1]
    if (!lexicon.linkOf || doer.type !== 'entity' || !doer.pronoun || lexicon.linkOf(tokens[doer.pronoun[0]].word) !== 'subject') continue
    if (next.type !== 'entity' || next.pronoun || next.first !== next.last || !next.head || tokens[next.first].shape !== 'lower') continue
    const word = tokens[next.first].word
    if (lexicon.kindsOf(word).verb >= 1 || lexicon.sForm(word) || lexicon.formOf(word)) units.doubts.push({position: next.first, is: 'verb'})
  }
  // "where the path bends": a word that opens a clause needs a verb. When only one group of words follows
  // it, the last word of the group is that verb if it can be one.
  for (let k = 0; k + 1 < units.length; k++) {
    const opener = units[k], group = units[k + 1], after = units[k + 2]
    if (!lexicon.linkOf || opener.type !== 'marker' || lexicon.linkOf(tokens[opener.last].word) === 'infinitive') continue
    if (group.type !== 'entity' || group.pronoun || !group.head || group.head[0] !== group.last || group.head[0] === group.first) continue
    if (after && !['terminator', 'separator', 'conjunction'].includes(after.type)) continue
    const head = group.head[0], word = tokens[head].word
    if (tokens[head].shape === 'lower' && (lexicon.sForm(word) || lexicon.kindsOf(word).verb >= 3)) units.doubts.push({position: head, is: 'verb'})
  }
  for (const unit of units) {
    if (unit.type !== 'entity') continue
    const head = unit.head?.[0] ?? -9
    if (unit.compound?.includes(head - 1) && stations[head - 1] === 'noun' && lexicon.formOf(tokens[head].word)) units.doubts.push({position: head, not: 'thing'})
    // "…, heading toward the bridge": a bare -ing form of a known verb right before a cue or an adverb says what something does
    else if (lexicon.leans && unit.first === unit.last && head === unit.first && lexicon.formOf(tokens[head].word) === 'progressive' &&
             lexicon.kindsOf(tokens[head].word).verb >= 3 && ['cue', 'adverb'].includes(units[units.indexOf(unit) + 1]?.type) &&
             ['separator', 'entity'].includes(units[units.indexOf(unit) - 1]?.type)) units.doubts.push({position: head, not: 'thing'})
    // "the dashed line wider": a word that says how a thing is, closing an entity after its noun, is not what the entity names
    else if (lexicon.saysHow && head > unit.first && (unit.compound?.includes(head - 1) || unit.modifier?.includes(head - 1)) &&
             lexicon.kindsOf(tokens[head - 1].word).thing >= 3 && lexicon.saysHow(tokens[head].word)) units.doubts.push({position: head, not: 'head'})
    // "the two lines differ": an entity that nothing holds, ending in a word never seen as a
    // thing after a word that is one, with no verb after it: the last word is the verb
    if (head > unit.first && lexicon.kindsOf && (unit.compound?.includes(head - 1) || unit.modifier?.includes(head - 1))) {
      const k = units.indexOf(unit), holder = units[k - 1], next = units[k + 1]
      const free = !holder || ['separator', 'conjunction', 'marker', 'filler', 'expression', 'adverb'].includes(holder.type)
      const last = lexicon.kindsOf(tokens[head].word), before = lexicon.kindsOf(tokens[head - 1].word)
      if (free && next?.type !== 'verb' && next?.type !== 'aux' && last.thing === 0 && before.thing >= 3 && tokens[head].shape === 'lower' && lexicon.leans?.(tokens[head].word) !== 'thing') units.doubts.push({position: head, not: 'thing'})
    }
    // "approximately 73 words": a word that grades, standing as a thing right before a number
    for (let position = unit.first; position <= unit.last; position++) {
      if (stations[position + 1] === 'quantity' && ['noun', 'modifier', 'name'].includes(stations[position]) && lexicon.grades(tokens[position].word) && !lexicon.canBe(tokens[position].word, 'degree')) units.doubts.push({position, not: 'thing'})
    }
  }
  // "make the girl ginger": after a verb that says what its object becomes, a last word that
  // is a quality and was never seen standing with the word before it is that outcome.
  for (let k = 1; k < units.length; k++) {
    const entity = units[k], verb = units[k - 1]
    if (entity.type !== 'entity' || verb.type !== 'verb' || !entity.head || entity.name || entity.head[0] !== entity.head[1]) continue
    const head = entity.head[0], before = head - 1
    const holds = [...entity.compound, ...entity.modifier].includes(before) && entity.compound.includes(before) || stations[before] === 'noun' && entity.compound.includes(before)
    if (!holds || !lexicon.takesQuality(tokens[verb.predicate[0]].word)) continue
    if (lexicon.nominal(tokens[head].word) !== false || lexicon.together(tokens[before].word, tokens[head].word)) continue
    entity.compound = entity.compound.filter(position => position !== before)
    entity.head = [before, before]
    entity.last = before
    units.splice(k + 1, 0, {type: 'complement', first: head, last: head, degree: [], value: [head, head]})
  }
  // "labelled Close ticket": a label goes on until something ends it, unless the verb before
  // it is one that says what its object becomes, or the same words are written again as one.
  for (let k = 0; k + 1 < units.length; k++) {
    const label = units[k], tail = units[k + 1], verb = units[k - 1]
    if (label.type !== 'entity' || !label.name || label.head || tail.type !== 'complement' || tail.degree.length) continue
    const whole = tokens.slice(label.name[0], tail.last + 1).map(token => token.word).join(' ')
    const again = tokens.map(token => token.word).join(' ').split(whole).length > 2
    const becomes = verb?.type === 'verb' && lexicon.takesQuality(tokens[verb.predicate[0]].word)
    if (!again && (becomes || verb?.type !== 'verb')) continue
    label.name = [label.name[0], tail.last]
    label.last = tail.last
    units.splice(k + 1, 1)
  }
  return units

  function readEntity(start) {
    if (stations[start] === 'pronoun') return {type: 'entity', first: start, last: start, pronoun: [start, start]}
    if (stations[start] === 'literal') {
      let j = start + 1
      const modifier = []
      while (at(j) === 'name') modifier.push(j++)
      return {type: 'entity', first: start, last: j - 1, literal: [start, start], modifier}
    }
    let j = start
    const determiner = [], quantity = [], degree = [], modifier = [], core = []
    while (at(j) === 'determiner') determiner.push(j++)
    // "the ones", "one of those": a determiner before a word that stands for a thing
    if (determiner.length && at(j) === 'pronoun') return {type: 'entity', first: start, last: j, determiner, pronoun: [j, j]}
    let quoted = -1
    for (; j < n; j++) {
      const station = stations[j]
      // "the colour bar ten steps": a number after the noun that counts the next noun begins another thing
      if (lexicon.leans && j > start && at(j + 1) === 'noun' && (station === 'quantity' || lexicon.canBe(tokens[j].word, 'quantity') || tokens[j].shape === 'number')) {
        const before = lexicon.kindsOf(tokens[j - 1].word)
        if (['noun', 'modifier'].includes(stations[j - 1]) && lexicon.linkOf(tokens[j - 1].word) !== 'selects' && before.thing >= 3 && before.thing >= 3 * before.quality) break
        // "block 2 one space": after a thing with its number, a count begins the next thing
        if (j - 1 > start && tokens[j - 1].shape === 'number') break
      }
      if (station === 'quantity') (core.length ? core : quantity).push(j)
      else if (station === 'degree' && !core.length && (at(j + 1) === 'modifier' || at(j + 1) === 'degree')) degree.push(j)
      // a number word that the route took for a description still counts the thing ("the first three bars")
      else if (station === 'modifier' && !core.length && !quantity.length && lexicon.leans && (lexicon.canBe(tokens[j].word, 'quantity') || tokens[j].shape === 'number')) quantity.push(j)
      // "the markers small circles": inside one thing a describing word does not follow a plural noun; it begins the next thing
      else if (station === 'modifier' && !core.length && lexicon.leans && j > start && stations[j - 1] === 'modifier' && lexicon.pluralThing(tokens[j - 1].word) &&
               lexicon.saysHow(tokens[j].word)) break
      else if (station === 'modifier' && !core.length) modifier.push(j)
      else if (station === 'noun' || station === 'name') core.push(j)
      else if (station === 'literal' && quoted < 0 && (determiner.length || modifier.length || core.length)) quoted = j      // the "eyes" part
      else break
    }
    // a counted thing whose word was read as a bare quality is still the head
    if (!core.length && quantity.length && at(j) === 'complement') core.push(j++)
    if (j === start) return null
    const entity = {type: 'entity', first: start, last: j - 1, determiner, quantity, degree, modifier: [], compound: []}
    if (quoted >= 0) entity.literal = [quoted, quoted]
    const attribute = position => {
      const word = tokens[position].word
      const named = tokens[position].shape === 'capital' || tokens[position].shape === 'upper'
      const nominal = named || (stations[position] === 'modifier' ? lexicon.nominal(word) === true : lexicon.nominal(word) !== false)
      ;(nominal ? entity.compound : entity.modifier).push(position)
    }
    if (core.length) {
      let head = -1
      core.forEach((position, k) => { if (stations[position] === 'noun' || stations[position] === 'complement') head = k })
      modifier.forEach(attribute)
      const label = stations[core[0]] === 'name' && !determiner.length && !modifier.length && !quantity.length
      const stands = core.length > 1 && lexicon.canBe(tokens[core.at(-1)].word, 'pronoun')
      if (stands) {
        // "the first one": a word that stands for a thing heads what describes it
        core.slice(0, -1).forEach(position => entity.modifier.push(position))
        entity.head = [core.at(-1), core.at(-1)]
      } else if (label) entity.name = [core[0], core.at(-1)]       // "Budget split": a label of several words
      else if (head >= 0) {
        core.slice(0, head).forEach(position => entity.compound.push(position))
        entity.head = [core[head], core[head]]
        if (head + 1 < core.length) entity.name = [core[head + 1], core.at(-1)]
      } else entity.name = [core[0], core.at(-1)]
      return entity
    }
    if (modifier.length && (determiner.length || quantity.length)) {
      // "the red": the last quality stands for the thing
      modifier.slice(0, -1).forEach(attribute)
      entity.head = [modifier.at(-1), modifier.at(-1)]
      return entity
    }
    if (quantity.length && !modifier.length) {
      // a number standing alone is given as written
      entity.literal = [quantity[0], quantity.at(-1)]
      entity.quantity = []
      return entity
    }
    if (quoted >= 0) return entity
    if (determiner.length && !modifier.length && !degree.length) {
      // a determiner standing alone refers by itself
      if (determiner.length === 1 && lexicon.canBe(tokens[start].word, 'pronoun')) {
        return {type: 'entity', first: start, last: start, pronoun: [start, start]}
      }
      return {type: 'other', first: start, last: j - 1}
    }
    return null
  }

  function readVerbGroup(start) {
    const auxiliary = [], negation = [], adverb = []
    let j = start
    for (; j < n; j++) {
      const station = stations[j]
      if (station === 'auxiliary') auxiliary.push(j)
      else if (station === 'negation') negation.push(j)
      else if (station === 'adverb' && VERBAL.has(at(j + 1))) adverb.push(j)
      else if (station === 'predicate' || station === 'following') {
        // "be turned", "have been moved": a helping verb before the verb it helps
        let k = j + 1
        while (at(k) === 'negation' || at(k) === 'adverb' && VERBAL.has(at(k + 1))) k++
        const helps = lexicon.canBe(tokens[j].word, 'auxiliary') &&
          (at(k) === 'predicate' || at(k) === 'following' || at(k) === 'complement' && lexicon.formOf(tokens[k].word) === 'past')
        if (helps) { auxiliary.push(j); if (at(k) === 'complement') { stations[k] = 'following' } continue }
        return {type: 'verb', first: start, last: j, auxiliary, negation, adverb, predicate: [j, j],
          form: lexicon.formOf(tokens[j].word), station}
      } else break
    }
    return {type: 'aux', first: start, last: j - 1, auxiliary, negation, adverb}
  }
}

/** Which ending built this word from another known word: 'past', 'progressive', or null. */
export function formClassifier(legend, isKnown) {
  const byName = legend.forms.map(form => ({endings: form.endings, name: form.name}))
  return word => {
    for (const {endings, name} of byName) {
      if (name !== 'past' && name !== 'progressive') continue
      if (stemsOf(word, endings).some(isKnown)) return name
    }
    return null
  }
}
