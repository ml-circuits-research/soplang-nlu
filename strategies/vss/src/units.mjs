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
  const T = lexicon.trial ?? (() => false)
  // (rule T1) "next Tuesday", "last week": a word that selects, right before a bare name or noun, stands in that thing
  for (let k = 0; T('T') && k + 1 < units.length; k++) {
    const lone = units[k], next = units[k + 1]
    if (!['adverb', 'complement'].includes(lone.type) || lone.first !== lone.last || lone.degree?.length || lexicon.linkOf?.(tokens[lone.first].word) !== 'selects') continue
    // (right after a verb the word says how or when the verb is done: "which comes first Monday or Tuesday")
    if (units[k - 1]?.type === 'verb') continue
    if (next.type !== 'entity' || next.pronoun || next.literal || next.determiner?.length || next.first !== lone.last + 1) continue
    next.modifier = [lone.first, ...next.modifier ?? []]
    next.first = lone.first
    units.splice(k, 1)
  }
  // (rule T2) "tomorrow morning": a word for a day, right before a bare noun, forms one thing with it
  for (let k = 0; T('T') && k + 1 < units.length; k++) {
    const day = units[k], next = units[k + 1]
    if (day.type !== 'adverb' || day.first !== day.last || !lexicon.tagged(tokens[day.first].word, 'day')) continue
    if (next.type !== 'entity' || next.pronoun || next.literal || next.determiner?.length || next.quantity?.length || next.first !== day.last + 1 || next.first !== next.last || !next.head || tokens[next.first].shape !== 'lower') continue
    next.compound = [day.first, ...next.compound ?? []]
    next.first = day.first
    units.splice(k, 1)
  }
  // (rule T3) "tomorrow's Standup": only a thing takes the possessive "'s"; the word before it owns the thing after it
  for (let k = 0; T('T') && k + 2 < units.length; k++) {
    const owner = units[k], mark = units[k + 1], owned = units[k + 2]
    if (owner.type !== 'adverb' || owner.first !== owner.last || mark.type !== 'possessive' || owned.type !== 'entity' || owned.pronoun || mark.first !== owner.last + 1 || owned.first !== mark.last + 1) continue
    const possessor = {type: 'entity', first: owner.first, last: owner.last, determiner: [], quantity: [], degree: [], modifier: [], compound: [], head: [owner.first, owner.first]}
    owned.possessor = possessor
    owned.possessiveMarker = mark.first
    owned.first = owner.first
    units.splice(k, 2)
  }
  // (rule L) "the title Second", "a meeting Second Pass": a word written with a capital inside a sentence is a name,
  // also when it is spelt like a word the language lists as saying how or which
  for (let t = 1; T('L') && t < tokens.length; t++) {
    if (tokens[t].shape !== 'capital' || !['complement', 'adverb', 'modifier', 'degree'].includes(stations[t])) continue
    if (['separator', 'terminator'].includes(stations[t - 1]) || !lexicon.listed?.(tokens[t].word)) continue
    units.doubts.push({position: t, is: 'name'})
  }
  // (rule O) "Sam is travelling", "Work should be Studio": a finite helping verb has its subject before it. The word
  // that opens the clause, with only bare nouns between it and that verb, is the subject, not a command
  for (let t = 0; T('O') && t + 1 < tokens.length; t++) {
    if (!['predicate', 'following'].includes(stations[t]) || t > 0 && !['separator', 'terminator', 'conjunction', 'filler', 'expression'].includes(stations[t - 1])) continue
    if (lexicon.canBe(tokens[t].word, 'auxiliary') || lexicon.makesDo?.(tokens[t].word) || lexicon.takesClause(tokens[t].word) || lexicon.asks(tokens[t].word)) continue
    let j = t + 1
    while (j < tokens.length && ['noun', 'name', 'modifier', 'complement'].includes(stations[j])) j++
    // (with bare nouns between, only a word the text never showed as a verb: "delete events Lee has declined" stays a command)
    if (j > t + 1 && lexicon.kindsOf(tokens[t].word).verb > 0) continue
    if (j < tokens.length && lexicon.tagged(tokens[j].word, 'finite') && ['auxiliary', 'predicate', 'following'].includes(stations[j])) units.doubts.push({position: t, not: 'quality'})
  }
  // (rule B) "by removing it", "thanks for sorting the sync": right after a linking word, the -ing form of a known verb
  // with a thing after it is the verb of a clause of its own
  for (let t = 1; T('B') && t + 1 < tokens.length; t++) {
    if (stations[t - 1] !== 'cue' || ['predicate', 'following'].includes(stations[t]) || lexicon.formOf(tokens[t].word) !== 'progressive') continue
    const seen = lexicon.kindsOf(tokens[t].word)
    // (what follows must be a thing in its own right: a pronoun, a thing that a determiner opens, a name; or one of these after a
    // word that moves with the verb. A bare noun may form one thing with the -ing word: "moving costs")
    const own = position => ['pronoun', 'determiner'].includes(stations[position]) || stations[position] === 'name' && ['capital', 'upper'].includes(tokens[position]?.shape)
    if (seen.verb >= 3 && seen.thing === 0 && (own(t + 1) || ['cue', 'adverb'].includes(stations[t + 1]) && own(t + 2))) units.doubts.push({position: t, is: 'verb'})
  }
  // (rule G2) "wipe Intro meeting", "system design": right after a thing, a lone word that the text showed as a thing
  // and never as a verb, far more often than as a quality, names the thing
  for (let k = 1; T('G') && k < units.length; k++) {
    const thing = units[k - 1], lone = units[k], verb = units.slice(0, k).findLast(unit => unit.type === 'verb')
    if (thing.type !== 'entity' || thing.pronoun || thing.literal || lone.type !== 'complement' || lone.first !== lone.last || lone.degree?.length || lone.first !== thing.last + 1) continue
    const seen = lexicon.kindsOf(tokens[lone.first].word)
    if (tokens[lone.first].shape !== 'lower' || lexicon.listed(tokens[lone.first].word) || seen.verb > 0 || seen.thing < 20 || seen.thing < 10 * seen.quality) continue
    // (a word that says how much a counted thing measures stays what it is: "one hour long")
    if (thing.quantity?.length || thing.literal) continue
    // (a thing that a determiner opens is complete: the word after it says how it is, "show the labels temporary")
    if (thing.determiner?.length) continue
    units.doubts.push({position: lone.first, is: 'head'})
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
  // "in the top right", "labelled Right side": two words that the text shows standing together inside one
  // thing are one thing, also where the route took one of them for a word that says where or how
  for (let k = 0; k + 1 < units.length; k++) {
    const left = units[k], right = units[k + 1]
    if (!lexicon.together || !lexicon.kindsOf || left.last + 1 !== right.first || !lexicon.together(tokens[left.last].word, tokens[right.first].word)) continue
    // a plural noun closes its thing: the word after it does not name the thing
    const closed = left.type === 'entity' && left.head && /[^s]s$/u.test(tokens[left.last].word) && lexicon.pluralThing(tokens[left.last].word)
    if (left.type === 'entity' && left.head?.[0] === left.last && ['adverb', 'complement'].includes(right.type) && right.first === right.last && !closed &&
        lexicon.kindsOf(tokens[right.first].word).thing >= 3) units.doubts.push({position: right.first, is: 'head'})
    else if (left.type === 'adverb' && left.first === left.last && right.type === 'entity' && !right.pronoun && !right.determiner?.length &&
             right.head?.[0] === right.first && lexicon.kindsOf(tokens[left.first].word).thing >= 3) units.doubts.push({position: left.first, is: 'head'})
  }
  // after a linking word, a thing that a determiner opens runs to its last noun: a lone word after it that the
  // text showed as a thing, not as saying how things are, is the word the thing is named by
  for (let k = 1; k + 1 < units.length; k++) {
    const cue = units[k - 1], thing = units[k], last = units[k + 1], after = units[k + 2]
    if (!lexicon.kindsOf || cue.type !== 'cue' || thing.type !== 'entity' || !thing.determiner?.length || thing.pronoun || thing.head?.[0] !== thing.last) continue
    if (last.type !== 'complement' || last.first !== last.last || last.degree?.length || last.first !== thing.last + 1) continue
    if (after && !['separator', 'terminator', 'conjunction', 'cue', 'marker'].includes(after.type)) continue
    // (a word with its own "of" phrase says how the thing is: "a city street full of traffic")
    if (after?.type === 'cue' && lexicon.linkOf?.(tokens[after.first].word) === 'belongs') continue
    const seen = lexicon.kindsOf(tokens[last.first].word)
    // (not where a verb that says what its object becomes still waits for that: "make the bars on the chart purple")
    let wanted = false
    for (let j = k - 1; j >= 0 && !['separator', 'terminator', 'conjunction'].includes(units[j].type); j--) {
      if (units[j].type === 'complement') break
      if (units[j].type === 'verb') { wanted = lexicon.takesQuality(tokens[units[j].predicate[0]].word); break }
    }
    if (wanted || lexicon.listed(tokens[last.first].word)) continue
    if (tokens[last.first].shape === 'lower' && seen.thing >= 3 && seen.thing >= 3 * seen.quality && !lexicon.saysHow(tokens[last.first].word)) units.doubts.push({position: last.first, is: 'head'})
  }
  // inside a thing that a determiner opens, a plural noun is the last word: the nouns that describe a noun
  // stand in the singular. A word after it that is not itself known as a thing does not belong to the thing.
  for (const unit of units) {
    if (!lexicon.pluralThing || unit.type !== 'entity' || !unit.determiner?.length || unit.pronoun || !unit.head) continue
    for (let p = unit.first + 1; p < unit.last; p++) {
      if (!['modifier', 'noun'].includes(stations[p]) || tokens[p].shape !== 'lower' || !lexicon.pluralThing(tokens[p].word) || !/[^s]s$/u.test(tokens[p].word)) continue
      const next = tokens[p + 1].word
      if (tokens[p + 1].shape !== 'lower' || lexicon.pluralThing(next) || lexicon.nominal(next) !== false) continue
      units.doubts.push({position: p, is: 'head'}, {position: p + 1, not: 'head'})
      break
    }
  }
  // "more readable": a word that grades is followed by what it grades, a quality; a word never shown as a verb is not one there
  for (let t = 1; t < tokens.length; t++) {
    if (!lexicon.kindsOf || !['predicate', 'following'].includes(stations[t]) || lexicon.kindsOf(tokens[t].word).verb >= 3) continue
    if (stations[t - 1] === 'degree' || stations[t - 1] === 'adverb' && lexicon.canBe(tokens[t - 1].word, 'degree')) units.doubts.push({position: t, not: 'verb'})
  }
  // "teal-edged", "left-aligned": two words joined by a hyphen, the second with a past ending, say how a thing is.
  // The joined word is a verb only where a word that does it stands before it or what it acts on follows.
  for (let t = 0; t < tokens.length; t++) {
    if (!['predicate', 'following'].includes(stations[t]) || !/^[^-]+-[^-]+ed$/u.test(tokens[t].word)) continue
    if (['pronoun', 'auxiliary', 'infinitive'].includes(stations[t - 1]) || ['determiner', 'pronoun', 'noun', 'name', 'quantity', 'modifier'].includes(stations[t + 1])) continue
    units.doubts.push({position: t, not: 'verb'})
  }
  // "put all removed shapes back": right after a verb, a word that can open a thing, a past form and a noun are one
  // thing; the past form describes the noun
  for (let t = 2; t + 1 < tokens.length; t++) {
    if (!lexicon.formOf || stations[t] !== 'predicate' || lexicon.formOf(tokens[t].word) !== 'past' || stations[t + 1] !== 'noun') continue
    if (stations[t - 1] === 'pronoun' && lexicon.canBe(tokens[t - 1].word, 'determiner') && ['predicate', 'following'].includes(stations[t - 2])) units.doubts.push({position: t, not: 'verb'})
  }
  // "way longer": a word that can grade, right before a graded form, grades it; it names no thing
  for (let t = 0; t + 1 < tokens.length; t++) {
    if (!lexicon.gradedForm || !lexicon.canBe(tokens[t].word, 'degree') || !lexicon.gradedForm(tokens[t + 1].word)) continue
    if (stations[t] === 'noun') units.doubts.push({position: t, is: 'degree'})
    // the graded form is then no name of a thing either
    if (stations[t + 1] === 'noun') units.doubts.push({position: t + 1, not: 'head'})
  }
  // "so the animals can still pass", "it won't fit": a helping verb that is never a verb by itself (can, will, should, …),
  // with its subject right before it, is followed by its verb: the next word that says neither when nor how nor "not"
  for (let t = 2; t < tokens.length; t++) {
    if (!lexicon.kindsOf || !['noun', 'modifier', 'complement'].includes(stations[t]) || tokens[t].shape !== 'lower') continue
    let helper = t - 1
    while (helper >= 0 && ['adverb', 'negation'].includes(stations[helper])) helper--
    if (helper < 1 || stations[helper] !== 'auxiliary' || lexicon.canBe(tokens[helper].word, 'predicate')) continue
    // ("so I honestly can't vouch for it": a word that says how may stand between the subject and the helping verb)
    let subject = helper - 1
    while (subject > 0 && stations[subject] === 'adverb') subject--
    if (!['noun', 'name', 'pronoun'].includes(stations[subject])) continue
    // (the word must have been shown as a verb, or never as anything: "yes we can thanks" keeps its words)
    const seen = lexicon.kindsOf(tokens[t].word)
    if (seen.verb >= 1 || seen.thing + seen.quality === 0 && !lexicon.listed(tokens[t].word)) units.doubts.push({position: t, is: 'verb'})
  }
  // "…, just like that": a word that the language lists as a linking word and as a verb ("like") is the verb only where
  // its subject, a helping verb or "to" stands before it ("people like it", "I would like a chart"). Opening a phrase after
  // a break, a linking word or another verb, it links.
  for (let t = 1; t < tokens.length; t++) {
    if (!['predicate', 'following'].includes(stations[t]) || !lexicon.canBe(tokens[t].word, 'cue') || !lexicon.canBe(tokens[t].word, 'predicate')) continue
    let before = t - 1
    while (before >= 0 && ['adverb', 'negation'].includes(stations[before])) before--
    if (before >= 0 && ['pronoun', 'noun', 'name', 'auxiliary', 'infinitive'].includes(stations[before])) continue
    units.doubts.push({position: t, not: 'verb'})
  }
  // "a falcon high above the hill": before a linking word, the last word of a thing that the text did not show as a
  // thing, but showed saying how things are, is not what the thing is named by; it says where or how
  for (let k = 0; k + 1 < units.length; k++) {
    const unit = units[k], head = unit.head?.[0] ?? -9
    if (!lexicon.leans || unit.type !== 'entity' || units[k + 1].type !== 'cue' || head !== unit.last || head === unit.first) continue
    if (!(unit.compound?.includes(head - 1) || unit.modifier?.includes(head - 1))) continue
    const seen = lexicon.kindsOf(tokens[head].word)
    if (tokens[head].shape === 'lower' && seen.thing < 3 && seen.quality >= 1 && seen.quality >= seen.verb) units.doubts.push({position: head, not: 'head'})
  }
  // "book retro at 15:30": right after a verb that does not say what its object becomes, a lone word that the text
  // did not show as saying how things are is what the verb acts on
  for (let k = 0; k + 1 < units.length; k++) {
    // also after a counted thing: "schedule a 60 minutes retro", where the count measures the word after it
    const measured = units[k + 1]?.type === 'entity' && units[k + 1].quantity?.length && units[k + 1].determiner?.length && units[k + 2]?.first === units[k + 1].last + 1
    const verb = units[k], next = measured ? units[k + 2] : units[k + 1]
    if (!lexicon.listed || verb.type !== 'verb' || next?.type !== 'complement' || next.first !== next.last || next.degree?.length) continue
    // only for a command: after a thing that does something, the lone word says how that thing is ("the view stays open")
    if (units[k - 1]?.type === 'entity') continue
    const word = tokens[next.first].word
    // (the verb must be one the text showed as a verb: after a doubtful one nothing follows from it)
    if (tokens[next.first].shape === 'lower' && lexicon.kindsOf(tokens[verb.predicate[0]].word).verb >= 3 && !lexicon.takesQuality(tokens[verb.predicate[0]].word) && !lexicon.saysHow(word) && !lexicon.listed(word) && !lexicon.formOf(word))
      units.doubts.push({position: next.first, is: 'head'})
  }
  // "Leadership looks tiny", "Lee asked to sync": the first word of a sentence, never shown as a verb, before the
  // s-form of a known verb, or its past form with no thing after it, is the one who does it
  for (let t = 0; t + 1 < tokens.length; t++) {
    if (!lexicon.listed || tokens[t].shape !== 'initial' || !['predicate', 'following'].includes(stations[t]) || lexicon.kindsOf(tokens[t].word).verb > 0) continue
    const next = tokens[t + 1].word
    if (tokens[t + 1].shape !== 'lower' || lexicon.kindsOf(next).verb < 3) continue
    if (lexicon.sForm(next) || lexicon.formOf(next) === 'past' && !['noun', 'name', 'modifier', 'quantity', 'determiner'].includes(stations[t + 2])) units.doubts.push({position: t, not: 'verb'}, {position: t + 1, is: 'verb'})
  }
  // after a comma, a colon, a dash or a word said in passing, a word written with a capital right before
  // a determiner or a pronoun opens a command, when the text knows the word as a verb
  for (let t = 1; t + 1 < tokens.length; t++) {
    if (stations[t] !== 'name' || tokens[t].shape !== 'capital' || !['separator', 'expression', 'filler', 'adverb'].includes(stations[t - 1])) continue
    if (!['determiner', 'pronoun'].includes(stations[t + 1])) continue
    const seen = lexicon.kindsOf(tokens[t].word.toLowerCase())
    if (seen.verb >= 3 && seen.verb > seen.thing) units.doubts.push({position: t, is: 'verb'})
  }
  // "a paragraph saying Thank you": a capital inside a sentence marks a name or quoted words; such a word is not said in passing
  for (let t = 1; t < tokens.length; t++) {
    if (['expression', 'filler'].includes(stations[t]) && tokens[t].shape === 'capital' && !['separator', 'terminator', 'expression', 'filler'].includes(stations[t - 1])) units.doubts.push({position: t, not: 'expression'})
  }
  // "a short planning meeting tomorrow", "a watering can below the tree": a thing that a determiner opens must be named.
  // When its last word is an -ing form and a lone verb with nothing to act on follows, that "verb" is the name.
  for (let k = 0; k + 1 < units.length; k++) {
    const thing = units[k], verb = units[k + 1], after = units[k + 2]
    if (!lexicon.formOf || thing.type !== 'entity' || !thing.determiner?.length || thing.head?.[0] !== thing.last || verb.type !== 'verb') continue
    if (verb.first !== verb.last || verb.first !== thing.last + 1 || after?.type === 'entity' || lexicon.formOf(tokens[thing.last].word) !== 'progressive') continue
    // ("how the drawing looks": a form in -s that the text showed as a verb at least as often as a thing is said of the
    // thing before it; it stays the verb)
    const seen = lexicon.kindsOf(tokens[verb.first].word)
    if (lexicon.sForm(tokens[verb.first].word) && seen.verb >= seen.thing) continue
    units.doubts.push({position: verb.first, is: 'head'})
  }
  // "use curved connectors": right after a verb that is no helper, a past form before a noun describes the noun
  for (let t = 1; t + 1 < tokens.length; t++) {
    if (!lexicon.formOf || stations[t] !== 'predicate' && stations[t] !== 'following' || lexicon.formOf(tokens[t].word) !== 'past' || stations[t + 1] !== 'noun') continue
    if (['predicate', 'following'].includes(stations[t - 1]) && !lexicon.canBe(tokens[t - 1].word, 'auxiliary') && !lexicon.formOf(tokens[t - 1].word)) units.doubts.push({position: t, not: 'verb'})
  }
  // "turn italic off": a bare verb form does not follow another verb directly, unless that verb makes something do
  // something ("let it go", "help move it"); the second word says what or how
  for (let t = 1; t < tokens.length; t++) {
    if (!lexicon.makesDo || !['predicate', 'following'].includes(stations[t]) || !['predicate', 'following'].includes(stations[t - 1])) continue
    const first = tokens[t - 1].word, second = tokens[t].word
    if (lexicon.formOf(second) || lexicon.sForm(second) || lexicon.canBe(first, 'auxiliary') || lexicon.kindsOf(first).verb < 3) continue
    // after a verb that says what its object becomes, a word the text showed saying how things are is that, not a second verb
    const seen = lexicon.kindsOf(second)
    if (lexicon.takesQuality(first) && seen.quality >= 3 && seen.quality >= seen.verb) units.doubts.push({position: t, not: 'verb'})
    else if (!lexicon.makesDo(first) && !lexicon.directs(first)) units.doubts.push({position: t, not: 'verb'})
  }
  // "describe my calendar entries": after a thing, a lone word in the plural form that the language lists nowhere names the thing
  for (let k = 1; k < units.length; k++) {
    const thing = units[k - 1], lone = units[k]
    if (!lexicon.listed || thing.type !== 'entity' || thing.pronoun || lone.type !== 'complement' || lone.first !== lone.last || lone.degree?.length || lone.first !== thing.last + 1) continue
    const word = tokens[lone.first].word
    if (tokens[lone.first].shape === 'lower' && /[^s]s$/u.test(word) && !lexicon.listed(word) && !lexicon.saysHow(word) && lexicon.kindsOf(word).verb === 0) units.doubts.push({position: lone.first, is: 'head'})
  }
  // "undo the last document edit": after a verb that does not make its object do something, a lone bare form right
  // after a thing opened by a determiner, with nothing after it, is no second verb: it names the thing
  for (let k = 0; k + 2 < units.length; k++) {
    const first = units[k], thing = units[k + 1], second = units[k + 2], after = units[k + 3]
    if (!lexicon.makesDo || first.type !== 'verb' || thing.type !== 'entity' || !thing.determiner?.length || thing.pronoun || second.type !== 'verb') continue
    if (second.first !== second.last || second.first !== thing.last + 1 || after && !['separator', 'terminator', 'conjunction', 'adverb'].includes(after.type)) continue
    const lead = tokens[first.predicate[0]].word, word = tokens[second.first].word
    // (after a verb that says what its object becomes, the word says that: "turn the nose open")
    if (lexicon.formOf(word) || lexicon.sForm(word) || lexicon.makesDo(lead) || lexicon.directs(lead) || lexicon.takesQuality(lead) || lexicon.canBe(lead, 'auxiliary')) continue
    units.doubts.push({position: second.first, is: 'head'})
  }
  // "level 2", "scale 1.5": a word the text showed as a thing more often than as a verb, right before a number that
  // no unit follows, is that thing with its number ("set 2023 to 20" keeps its verb)
  for (let t = 0; t + 1 < tokens.length; t++) {
    const seen = lexicon.kindsOf(tokens[t].word)
    if (!lexicon.listed || !['predicate', 'following'].includes(stations[t]) || tokens[t + 1].shape !== 'number' || seen.thing < 3 || seen.thing <= seen.verb) continue
    if (stations[t + 2] === 'noun' && tokens[t + 2].shape === 'lower') continue
    units.doubts.push({position: t, not: 'verb'})
  }
  // "so it no longer cuts through the box": a word that stands for a thing, then words that say when or how,
  // then the s-form of a known verb: that form is the verb of the first. The same right after a word that opens a clause.
  for (let k = 0; k + 1 < units.length; k++) {
    const doer = units[k]
    if (!lexicon.sForm || doer.type !== 'entity' || !doer.pronoun) continue
    let m = k + 1
    while (['adverb', 'negation'].includes(units[m]?.type)) m++
    const next = units[m]
    if (m === k + 1 && units[k - 1]?.type !== 'marker') continue
    if (!next || next.type !== 'entity' || next.pronoun || next.determiner?.length || next.quantity?.length || next.head?.[0] !== next.first || tokens[next.first].shape !== 'lower') continue
    const word = tokens[next.first].word
    if (lexicon.sForm(word) && lexicon.kindsOf(word).verb >= 3) units.doubts.push({position: next.first, is: 'verb'})
  }
  // "where the path bends": a word that opens a clause needs a verb. When only one group of words follows
  // it, the last word of the group is that verb if it can be one.
  // "tell me how the picture goes", "showing how the broadcasts split by time of day": inside a message, a word that asks
  // how, where, when or why opens such a clause as well. Its verb may be followed by more words, as long as none of
  // them is a verb.
  for (let k = 0; k + 1 < units.length; k++) {
    const opener = units[k], group = units[k + 1], after = units[k + 2]
    const asks = opener.type === 'question' && k > 0 && lexicon.canBe(tokens[opener.first].word, 'adverb')
    if (!lexicon.linkOf || !asks && (opener.type !== 'marker' || lexicon.linkOf(tokens[opener.last].word) === 'infinitive')) continue
    if (group.type !== 'entity' || group.pronoun || !group.head || group.head[0] !== group.last || group.head[0] === group.first) continue
    let verbless = asks
    for (let m = k + 2; verbless && m < units.length && !['terminator', 'separator', 'conjunction'].includes(units[m].type); m++) verbless = !['verb', 'aux'].includes(units[m].type)
    if (after && !['terminator', 'separator', 'conjunction'].includes(after.type) && !verbless) continue
    const head = group.head[0], word = tokens[head].word
    if (tokens[head].shape === 'lower' && (lexicon.sForm(word) || lexicon.kindsOf(word).verb >= 3)) units.doubts.push({position: head, is: 'verb'})
  }
  for (const unit of units) {
    if (unit.type !== 'entity') continue
    const head = unit.head?.[0] ?? -9
    // (rule G: not a word the text showed as a thing and never as a verb: "a prep meeting")
    const thingOnly = T('G') && head >= 0 && lexicon.kindsOf(tokens[head].word).verb === 0 && lexicon.kindsOf(tokens[head].word).thing >= 20
    if (unit.compound?.includes(head - 1) && stations[head - 1] === 'noun' && lexicon.formOf(tokens[head].word) && !thingOnly) units.doubts.push({position: head, not: 'thing'})
    // "…, heading toward the bridge": a bare -ing form of a known verb right before a cue or an adverb says what something does
    else if (lexicon.leans && unit.first === unit.last && head === unit.first && lexicon.formOf(tokens[head].word) === 'progressive' &&
             lexicon.kindsOf(tokens[head].word).verb >= 3 && ['cue', 'adverb'].includes(units[units.indexOf(unit) + 1]?.type) &&
             ['separator', 'entity'].includes(units[units.indexOf(unit) - 1]?.type)) units.doubts.push({position: head, not: 'thing'})
    // "the dashed line wider": a word that says how a thing is, closing an entity after its noun, is not what the entity names
    else if (lexicon.saysHow && head > unit.first && (unit.compound?.includes(head - 1) || unit.modifier?.includes(head - 1)) &&
             lexicon.kindsOf(tokens[head - 1].word).thing >= 3 && lexicon.saysHow(tokens[head].word)) units.doubts.push({position: head, not: 'head'})
    // a graded form right after a noun does not name the thing; the noun before it does
    else if (lexicon.gradedForm && head > unit.first && (unit.compound?.includes(head - 1) || unit.modifier?.includes(head - 1)) &&
             lexicon.kindsOf(tokens[head - 1].word).thing >= 3 && lexicon.gradedForm(tokens[head].word) && !lexicon.listed(tokens[head - 1].word)) units.doubts.push({position: head, not: 'head'}, {position: head - 1, is: 'head'})
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
    // "these two": a word that can open a thing, before a count with no noun after it, opens the counted thing
    if (stations[start] === 'pronoun' && lexicon.leans && lexicon.canBe(tokens[start].word, 'determiner') && at(start + 1) === 'quantity' && !NOMINAL.has(at(start + 2))) stations[start] = 'determiner'
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
      // "the Introduction heading level 2", "the eyes scale 1.5": a noun with its number or value after it begins a thing
      // of its own, unless the text showed it standing together with the noun before it
      else if (station === 'noun' && core.length && determiner.length && lexicon.leans && stations[core.at(-1)] === 'noun' && j === core.at(-1) + 1 &&
               (tokens[j + 1]?.shape === 'number' || at(j + 1) === 'literal') && !lexicon.together(tokens[j - 1].word, tokens[j].word)) break
      else if (station === 'noun' || station === 'name') core.push(j)
      else if (station === 'literal' && quoted < 0 && (determiner.length || modifier.length || core.length)) quoted = j      // the "eyes" part
      else break
    }
    // a counted thing whose word was read as a bare quality is still the head
    if (!core.length && quantity.length && at(j) === 'complement') core.push(j++)
    // "a little longer": a word that opens a thing and a word that grades, before a graded form, grade it together;
    // no thing is named
    if (!core.length && !quantity.length && determiner.length && lexicon.gradedForm) {
      const found = [...degree, ...modifier].sort((a, b) => a - b)
      const [grading, graded] = found.length === 1 && at(j) === 'complement' ? [found[0], j] : found.length === 2 && modifier.includes(found[1]) ? found : [-1, -1]
      if (graded >= 0 && lexicon.canBe(tokens[grading].word, 'degree') && lexicon.gradedForm(tokens[graded].word))
        return {type: 'complement', first: start, last: graded, degree: [...determiner, grading], value: [graded, graded]}
    }
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
