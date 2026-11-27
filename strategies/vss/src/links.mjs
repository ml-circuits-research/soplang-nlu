// From units to a circuit. A verb opens a clause and expects its subject on the left and its
// objects on the right; a cue opens a relation, expects its target on the right and attaches
// on the left to the clause or to the entity before it, by a learned affinity; a conjunction
// joins the units it stands between. Every token ends in exactly one quoted slot.
import {headKey} from './habits.mjs'

const quote = JSON.stringify

/**
 * @param context {lexicon, kindOf(unit, cue), linkOf(word), joinsClauses(word), attach(), alike()}
 * @param flips decisions to take the other way (for an alternative reading)
 * @returns {wires: [{id, type, slots: [[key, value]]}], decisions: [{id, margin}]}
 */
// Below this likeness two things are not listed together by a comma alone. Measured on the first conversion
// round: items of a list scored 0.6 or more against the things before them, a day or an hour set off after a
// phrase scored about 0.
const UNLIKE = 0.3
// How often the text must have shown a word as a verb, and never as a thing, before it is taken to open a command that
// has no other verb ("excuse" 121 times, "chose" 38; "warm" 6 and "empty" 10 also say how things are).
export const SURELY_A_VERB = 20

export function linkUnits(text, tokens, units, context, flips = new Set()) {
  const {lexicon} = context
  const wires = [], decisions = [], doubts = []
  const counters = {c: 0, e: 0, r: 0, k: 0}
  const span = (first, last) => quote(text.slice(tokens[first].start, tokens[last].end))
  const word = unit => tokens[unit.last].word
  const wire = (letter, type) => {
    const made = {id: letter + ++counters[letter], type, slots: []}
    wires.push(made)
    return made
  }
  // a quoted value keeps the tokens it covers, so that it can be written in any schema
  const put = (target, key, first, last = first) => target.slots.push([key, span(first, last), first, last])
  const has = (target, key) => target.slots.some(slot => slot[0] === key)
  // a clause that completes a verb; a verb that already has one is tied to the second with no word saying how
  const completes = (governor, clause) => {
    if (!has(governor, 'clausal_complement')) { governor.slots.push(['clausal_complement', '$' + clause.id]); return }
    const relation = wire('r', 'nlu.relation')
    relation.slots.push(['kind', 'open'], ['from', '$' + governor.id], ['to', '$' + clause.id])
  }
  const fragmentClause = () => {
    const made = {wire: wire('c', 'nlu.clause'), fragment: true}
    made.wire.slots.push(['form', 'fragment'])
    return made
  }

  // A quality that a cue points at is the thing itself: "in red", "from low to high".
  units = units.map((unit, i) => {
    if (unit.type !== 'complement' || units[i - 1]?.type !== 'cue' || unit.degree.length) return unit
    const [first, last] = unit.value
    return {type: 'entity', first, last, determiner: [], quantity: [], degree: [], compound: [],
      modifier: Array.from({length: last - first}, (_, k) => first + k), head: [last, last]}
  })

  // "keep everything else where it is": a word that modifies the pronoun right before it (the legend marks it) belongs to the
  // thing that pronoun names
  for (let i = 1; i < units.length; i++) {
    const unit = units[i], before = units[i - 1]
    if (unit.type !== 'adverb' || unit.first !== unit.last || before.type !== 'entity' || !before.pronoun || before.last + 1 !== unit.first ||
        !context.tagged(tokens[unit.first].word, 'postposed')) continue
    units[i - 1] = {...before, last: unit.first, adverb: [...before.adverb ?? [], unit.first]}
    units.splice(i, 1)
  }

  // "by product and region": a bare word listed after a thing is a thing as well
  for (let i = 2; i < units.length; i++) {
    const unit = units[i]
    if (unit.type !== 'complement' || unit.degree.length || unit.value[0] !== unit.value[1]) continue
    let j = i - 1
    while (units[j]?.type === 'conjunction' || units[j]?.type === 'separator') j--
    if (j === i - 1 || units[j]?.type !== 'entity' || !units.slice(j + 1, i).some(joiner => joiner.type === 'conjunction')) continue
    units[i] = {type: 'entity', first: unit.first, last: unit.last, determiner: [], quantity: [], degree: [], compound: [], modifier: [], head: unit.value}
  }

  // ---- entities
  const entityWire = unit => {
    if (unit.wire) return unit.wire
    const made = unit.wire = wire('e', 'nlu.entity')
    if (unit.pronoun) put(made, 'pronoun', ...unit.pronoun)
    if (unit.literal) put(made, 'literal', ...unit.literal)
    if (unit.determiner?.length) put(made, 'determiner', unit.determiner[0], unit.determiner.at(-1))
    if (unit.quantity?.length) put(made, 'quantity', unit.quantity[0], unit.quantity.at(-1))
    for (const position of unit.degree ?? []) put(made, 'degree', position)
    for (const position of unit.modifier ?? []) put(made, 'modifier', position)
    for (const position of unit.compound ?? []) put(made, 'compound', position)
    if (unit.head) put(made, 'head', ...unit.head)
    if (unit.name) put(made, 'name', ...unit.name)
    for (const position of unit.adverb ?? []) put(made, 'adverb', position)
    if (unit.possessor) {
      made.slots.push(['possessor', '$' + entityWire(unit.possessor).id])
      put(made, 'possessive_marker', unit.possessiveMarker)
    }
    return made
  }
  const headWord = unit => headKey(tokens, unit)

  // ---- sentences
  const sentences = [[]]
  for (const unit of units) {
    sentences.at(-1).push(unit)
    if (unit.type === 'terminator') sentences.push([])
  }
  for (const sentence of sentences) {
    if (!sentence.length) continue
    const from = wires.length
    linkSentence(sentence)
    if (context.open !== false) tieLoose(wires.slice(from))
  }
  return {wires, decisions, doubts}

  // A clause without a finite verb that nothing refers to belongs with the clause before it; no
  // word says how. It is tied to that clause and the tie is left open.
  function tieLoose(made) {
    // (a clause that only starts a relation, "split by time of day", is not yet tied to anything before it)
    const referred = new Set()
    for (const other of made) for (const [key, value] of other.slots) if (key !== 'from' && typeof value === 'string' && value.startsWith('$')) referred.add(value.slice(1))
    let before = null
    for (const other of made) {
      if (other.type !== 'nlu.clause') continue
      const form = other.slots.find(slot => slot[0] === 'form')[1]
      if (form === 'nonfinite' && before && !referred.has(other.id) && !other.slots.some(slot => slot[0] === 'subject')) {
        const relation = wire('r', 'nlu.relation')
        relation.slots.push(['kind', 'open'], ['from', '$' + before.id], ['to', '$' + other.id])
      }
      // "tell me which events are scheduled": a clause that opens with a question word, right after a verb that takes
      // what is asked or said, is what that verb takes
      // (so is one whose question word stands right after any verb: "that is how the picture goes", "showing how they differ")
      const told = before?.slots.find(slot => slot[0] === 'predicate'), asked = other.slots.find(slot => slot[0] === 'question')
      if (form !== 'nonfinite' && told && told.length >= 4 && !referred.has(other.id) && asked &&
          !before.slots.some(slot => slot[0] === 'clausal_complement') && (lexicon.asks(tokens[told[2]].word) || lexicon.takesClause(tokens[told[2]].word) || asked[2] === told[3] + 1)) {
        const relation = wire('r', 'nlu.relation')
        relation.slots.push(['kind', 'open'], ['from', '$' + before.id], ['to', '$' + other.id])
      }
      before = other
    }
    // "the trees should be gone, the two of them", "mouth blue — change a neutral, please", "cancelled — rewind that": the
    // words of one sentence hang together. A part of the sentence that no wire ties to the rest (a clause, or a group of
    // words with no verb, together with what hangs on it) is tied to the sentence's main clause, the first one with a verb
    // that can make a sentence by itself; no word says how. Words said in passing ("thanks", "next") need no tie, and a
    // clause whose own linking word ties it is tied when its circuit is written.
    if (!made.length) return
    const all = wires.slice(wires.indexOf(made[0]))
    const root = new Map(all.map(other => [other.id, other.id]))
    const find = id => { while (root.get(id) !== id) id = root.get(id); return id }
    const join = (a, b) => { if (root.has(a) && root.has(b)) root.set(find(a), find(b)) }
    for (const other of all) {
      for (const slot of other.slots) if (typeof slot[1] === 'string' && slot[1].startsWith('$')) join(other.id, slot[1].slice(1))
      if (other.shares) join(other.id, other.shares)
    }
    const groups = new Map()
    for (const other of all) if (other.type === 'nlu.clause') (groups.get(find(other.id)) ?? groups.set(find(other.id), []).get(find(other.id))).push(other)
    const acts = clause => clause.slots.some(slot => slot[0] === 'predicate')
    const finite = clause => acts(clause) && !['nonfinite', 'fragment'].includes(clause.slots.find(slot => slot[0] === 'form')[1])
    const marked = group => group.some(clause => clause.slots.some(slot => slot[0] === 'marker'))
    const passing = group => group.every(clause => clause.slots.every(slot => slot[0] !== 'predicate' && !(typeof slot[1] === 'string' && slot[1].startsWith('$'))))
    const parts = [...groups.values()].filter(group => !marked(group) && !passing(group))
    const main = parts.find(group => group.some(finite)) ?? parts.find(group => group.some(acts)) ?? parts[0]
    if (!main) return
    const anchor = main.find(finite) ?? main.find(acts) ?? main[0]
    for (const group of parts) {
      if (group === main) continue
      const relation = wire('r', 'nlu.relation')
      relation.slots.push(['kind', 'open'], ['from', '$' + anchor.id], ['to', '$' + group[0].id])
    }
  }

  function linkSentence(all) {
    const terminator = all.at(-1).type === 'terminator' ? all.at(-1) : null
    const list = terminator ? all.slice(0, -1) : all

    // A helping verb that stands before the subject joins its verb; one with no verb is the verb.
    for (let i = 0; i < list.length; i++) {
      const unit = list[i]
      const helping = unit.type === 'aux' || unit.type === 'verb' && !unit.auxiliary.length && !unit.form &&
        lexicon.canBe(tokens[unit.predicate[0]].word, 'auxiliary') &&
        (list[i + 1]?.pronoun || list[i - 1]?.type === 'question' || list[i - 2]?.type === 'question' ||
         // "does this diagram make sense": opening its clause before a thing; not a verb that makes its object do something ("have the fan become …",
         // "have the counter top painted ivory": the legend's list of such verbs, or a verb the text showed taking a clause)
         context.open !== false && (i === 0 || ['separator', 'conjunction', 'filler', 'expression'].includes(list[i - 1]?.type)) &&
           list[i + 1]?.type === 'entity' && !lexicon.takesClause(tokens[unit.predicate[0]].word) && !lexicon.makesDo(tokens[unit.predicate[0]].word))
      if (!helping) continue
      const own = unit.type === 'aux' ? unit.auxiliary : [unit.predicate[0]]
      let k = i + 1
      if (list[k]?.type === 'entity') {
        k++
        while (['adverb', 'filler', 'negation'].includes(list[k]?.type)) k++
        // "what values does Sales show": after the helping verb and its subject, a word known as a verb is the verb
        const late = list[k]
        const at = late?.type === 'complement' && late.value[0] === late.value[1] ? late.value[0]
          : late?.type === 'entity' && late.head && late.head[0] === late.last ? late.last : -1
        if (context.open !== false && at >= 0 && (list[i - 1]?.type === 'question' || list[i - 2]?.type === 'question') &&
            lexicon.kindsOf(tokens[at].word).verb >= 3) doubts.push({position: at, is: 'verb'})
        // (rule A) "Could Main work as the name", "does the design critique overlap": a helping verb that needs a bare
        // verb ("do" and the modal verbs), opening its clause before a group of words with no verb after it, takes the
        // last word of that group as its verb when that word can be one
        const subjectGroup = list[i + 1]
        if (context.trial?.('A') && context.tagged(tokens[own.at(-1)].word, 'needsbare') && (i === 0 || ['separator', 'conjunction', 'filler', 'expression'].includes(list[i - 1]?.type)) &&
            list[k]?.type !== 'verb' && !subjectGroup.pronoun && subjectGroup.last > subjectGroup.first && (subjectGroup.head?.[0] ?? subjectGroup.name?.[1]) === subjectGroup.last &&
            tokens[subjectGroup.last].shape === 'lower' && lexicon.kindsOf(tokens[subjectGroup.last].word).verb >= 1 && !lexicon.sForm(tokens[subjectGroup.last].word)) {
          doubts.push({position: subjectGroup.last, is: 'verb'})
        }
        // "have" helps a form that says what was done; before a bare verb it makes its object do something
        const perfect = context.linkOf(tokens[own.at(-1)].word) === 'perfect' && list[k]?.type === 'verb' && list[k].form !== 'past'
        if (list[k]?.type === 'verb' && list[k] !== unit && !perfect) {
          const verb = list[k]
          verb.auxiliary = [...own, ...verb.auxiliary]
          verb.negation = [...unit.negation, ...verb.negation]
          verb.inverted = {aux: unit, subject: list[i + 1]}
          unit.type = 'absorbed'
          continue
        }
      }
      if (unit.type !== 'aux') continue
      // a negation with no verb to negate stays a word of its clause
      if (!unit.auxiliary.length) { unit.type = 'negation'; continue }
      unit.type = 'verb'
      unit.predicate = [unit.auxiliary.at(-1), unit.auxiliary.at(-1)]
      unit.auxiliary = unit.auxiliary.slice(0, -1)
      unit.form = null
      unit.station = 'predicate'
      // "…, would you": a helping verb with only the one it asks after it is a question with that one as its subject
      const asked = list[i + 1], beyond = list[i + 2]
      // (a helping verb never takes a pronoun as its object: whatever follows, the pronoun is its subject)
      if (context.open !== false && asked?.pronoun && !unit.auxiliary.length && list[i - 1]?.type !== 'entity') {
        unit.inverted = {aux: unit, subject: asked}
        unit.asked = asked
      }
    }

    // "it is level with the house": after a form of "be", a word never shown to be a verb says how the
    // subject is; "be" is the verb
    if (context.open !== false) for (const unit of list) {
      if (unit.type !== 'verb' || !unit.auxiliary.length || unit.form) continue
      const helper = tokens[unit.auxiliary.at(-1)].word, said = tokens[unit.predicate[0]].word
      const seen = lexicon.kindsOf(said)
      if (context.linkOf(helper) === 'predicative' && (seen.verb === 0 || seen.quality >= 3 * seen.verb) && tokens[unit.predicate[0]].shape === 'lower') doubts.push({position: unit.predicate[0], not: 'verb'})
    }

    // ---- what each verb is to its neighbours, and where its clause starts
    // "have the car on the path face the house", "make the man in the purple shirt and no hat go right", "let's also set
    // the interval": a verb that makes its object do something (the legend's list: let, make, have, help, see, watch, hear,
    // feel) takes that object and then the bare verb of what the object does. The object runs from the first thing after
    // that verb over the place phrases and the "and"-joined things that hang on it; words that say when or how may stand
    // between it and the bare verb. Returns {object, lead, start} for the verb at i, or null.
    const causedBy = i => {
      let h = i - 1
      while (['adverb', 'negation'].includes(list[h]?.type)) h--
      if (list[h]?.type !== 'entity') return null
      const start = h + 1
      while (['cue', 'conjunction'].includes(list[h - 1]?.type) && list[h - 2]?.type === 'entity') h -= 2
      const lead = list[h - 1]
      return lead?.type === 'verb' && lexicon.makesDo(tokens[lead.predicate[0]].word) ? {object: list[h], lead, start} : null
    }
    // the bare "be" of a passive ("let the bird be turned into an owl") is no finite helping verb
    const bareBe = verb => verb.auxiliary.length === 1 && context.tagged(tokens[verb.auxiliary[0]].word, 'bare')
    const clauses = []
    for (let i = 0; i < list.length; i++) {
      const verb = list[i]
      if (verb.type !== 'verb') continue
      const previous = list[i - 1], bare = !verb.auxiliary.length
      const clause = {verb, index: i, start: i, pre: [], role: 'main', predicate: tokens[verb.predicate[0]].word}
      // (the word must be a plain verb: not a word the legend lists as a linking word, not a graded form, not one the text
      // showed saying how things are more often than as a verb: "make the avatar like him", "have the bars thicker")
      const plainVerb = !lexicon.canBe(clause.predicate, 'cue') && !lexicon.gradedForm(clause.predicate) &&
        lexicon.kindsOf(clause.predicate).quality <= lexicon.kindsOf(clause.predicate).verb
      // (a word the fixed frames never showed as a verb must act on a thing or take a phrase: "let it drift a little away
      // from the shore", not "have the distance farthest out")
      const evident = lexicon.kindsOf(clause.predicate).verb > 0 || ['entity', 'cue'].includes(list[i + 1]?.type)
      // (nor a word the text shows standing together with the noun right before it inside one thing: "have the font colour black")
      const joined = previous?.type === 'entity' && previous.last + 1 === verb.first && lexicon.together(tokens[previous.last].word, clause.predicate)
      const caused = context.open !== false && (bareBe(verb) || bare && !verb.form && plainVerb && evident && !joined) ? causedBy(i) : null
      // "a girl facing left sitting on the bench": a word that says where or how (an adverb or a particle) stands after its
      // verb, so between two verb forms it belongs to the first; the second form, with no helping verb, goes on describing
      // the thing that the first describes
      let back = i - 1
      while (bare && verb.form && list[back]?.type === 'adverb' && list[back].first === list[back].last && lexicon.canBe(tokens[list[back].first].word, 'adverb')) back--
      const earlier = clauses.at(-1)
      if (context.open !== false && bare && verb.form && list[back]?.type === 'verb' && earlier?.verb === list[back] && earlier.role === 'modifier' && !earlier.modifiesHost && earlier.modifies) {
        clause.role = 'modifier'
        clause.modifies = earlier.modifies
      } else if (previous?.type === 'marker' && context.linkOf(word(previous)) === 'infinitive') {
        clause.role = 'infinitive'
        clause.marker = previous
        clause.start = i - 1
        const teller = list[i - 3]?.type === 'verb' ? tokens[list[i - 3].predicate[0]].word : null
        if (list[i - 2]?.type === 'entity' && teller && (list[i - 2].pronoun || lexicon.directs(teller))) { clause.subject = list[i - 2]; clause.start = i - 2 }
        else if (list[i - 2]?.type === 'entity') clause.purposeOf = list[i - 2]      // "a button to close the window"
      } else if (context.trial?.('B') && previous?.type === 'cue' && previous.first === previous.last && bare && verb.form === 'progressive') {
        // (rule B) "by removing it": the linking word before an -ing form ties the clause of that form to what stands before it
        clause.marker = previous
        previous.type = 'marker'
        clause.start = i - 1
      } else if (previous?.type === 'entity' && bare && verb.form && !(verb.form === 'past' && opensClause(list, i - 1)) &&
                 // "they made": after a word that can only be the doer, a past form is the verb of its own clause
                 !(context.open !== false && verb.form === 'past' && previous.pronoun && context.linkOf(tokens[previous.pronoun[0]].word) === 'subject')) {
        clause.role = 'modifier'
        clause.modifies = previous
      } else if (previous?.type === 'verb' && bare && verb.form === 'progressive') {
        clause.role = 'complement'                       // "try making …": what the verb before it is about
      } else if (previous?.type === 'separator' && bare && verb.form && clauses.some(other => other.role === 'main')) {
        clause.role = 'modifier'
        clause.modifiesHost = true
        clause.separator = previous
        clause.start = i - 1
      } else if (caused) {
        // the bare verb heads a clause that completes the verb before it; the whole object is its subject, and the words
        // that say when or how right before the bare verb belong to its clause
        clause.role = 'complement'
        clause.subject = caused.object
        clause.causedBy = caused.lead
        clause.start = caused.start
        clause.pre.push(...list.slice(caused.start, i))
      } else if (previous?.type === 'entity' && bare && !verb.form && list[i - 2]?.type === 'verb' &&
                 lexicon.takesClause(tokens[list[i - 2].predicate[0]].word)) {
        clause.role = 'complement'
        clause.subject = previous
      } else {
        scanLeft(clause, i)
        // "the first chart they open is Orders by weekday": a verb that follows a clause saying which thing is meant ("they
        // open", with no "that") has that thing as its subject; the thing then belongs to no clause before it
        const said = clauses.at(-1)
        if (context.open !== false && !clause.subject && !clause.marker && !clause.conjunction && !clause.separator && !clause.question && previous?.type === 'verb' &&
            said?.verb === previous && said.relativeTo?.type === 'entity' && !said.relativeTo.pronoun && (verb.auxiliary.length ? context.tagged(tokens[verb.auxiliary[0]].word, 'finite') : lexicon.sForm(clause.predicate) || context.tagged(clause.predicate, 'finite'))) {
          clause.subject = said.relativeTo
          said.relativeTo.claimed = true
        }
        // a bare verb right after another verb's object, with nothing to introduce it and no
        // subject of its own, cannot be placed: the word was probably not a verb
        const stranded = bare && !verb.form && !clause.subject && !clause.marker && !clause.conjunction && !clause.separator &&
          previous?.type === 'entity' && !previous.pronoun && clauses.length && list.slice(clauses.at(-1).index + 1, i).every(unit => unit.type === 'entity' || unit.type === 'cue')
        // "can I get a cinnamon stick?": a bare verb right after a thing that a verb or a cue
        // already holds, whose word is known as a thing where the legend fixes the frame, is
        // the head of that thing
        const kinds = lexicon.kindsOf(clause.predicate)
        const holder = list[i - 2]
        // (not when the verb before makes its object do something, and not when this would
        // leave the sentence without any verb)
        const governing = clauses.at(-1)?.verb
        const held = previous?.type === 'entity' && !previous.pronoun && governing && (holder?.type === 'cue' || holder?.type === 'verb') &&
          !lexicon.takesClause(tokens[governing.predicate[0]].word)
        // (not a word in -s that the raw text shows as the verb said of one thing, right after a word that names one thing:
        // "the woman in the red dress exits the scene" agrees)
        const agrees = previous?.type === 'entity' && previous.last + 1 === verb.predicate[0] && lexicon.verbOfOne?.(clause.predicate) &&
          lexicon.number?.(tokens[previous.last].word) === 'singular'
        // (nor a word in -s after things that open their own clause, whose place phrase holds the thing before it: ", next a
        // girl in the green cassket fills the gap")
        const opening = /[^s]s$/u.test(clause.predicate) && opensClause(list, i - 1)
        if (context.kinds !== false && bare && held && kinds.thing >= 3 && !agrees && !opening) doubts.push({position: verb.predicate[0], not: 'verb'})
        // a word never seen as a verb where the frame leaves no doubt, and seen as a thing there,
        // is not stated to be the action ("pie radius smaller")
        else if (context.open !== false && bare && !verb.form && kinds.verb === 0 && kinds.thing >= 3 && !clause.subject?.pronoun && !agrees) doubts.push({position: verb.predicate[0], not: 'verb'})
        // "make runway orange": a bare word right after another verb, never shown to be a verb, is the thing that verb acts on
        if (context.open !== false && bare && !verb.form && previous?.type === 'verb' && kinds.verb === 0 && !clause.subject && tokens[verb.predicate[0]].shape === 'lower') doubts.push({position: verb.predicate[0], not: 'verb'})
        if (stranded && lexicon.thingFirst(clause.predicate)) doubts.push({position: verb.predicate[0], not: 'verb'})
        else if (stranded && list[i - 2]?.type === 'verb') {
          // "make the chart show its gridlines": the thing before it is the one that does it
          clause.role = 'complement'
          clause.subject = previous
          clause.start = i
        }
      }
      // "selected event": a form that says what was done, opening its clause right before a bare noun, describes that noun
      // (not a form of a naming verb before a name written with a capital, which is the name it gives: "…, labelled Step")
      const label = list[i + 1]?.name && !list[i + 1].head && ['capital', 'upper'].includes(tokens[list[i + 1].first].shape) && lexicon.names(clause.predicate)
      if (context.open !== false && bare && verb.form === 'past' && !clause.subject && (i === 0 || ['separator', 'conjunction', 'filler', 'expression'].includes(previous?.type)) &&
          list[i + 1]?.type === 'entity' && !list[i + 1].determiner?.length && !list[i + 1].pronoun && list[i + 1].first === verb.last + 1 && !label) doubts.push({position: verb.predicate[0], not: 'verb'})
      // "leave it tidy": the verb of a clause that completes another verb must have been seen as a verb somewhere
      // (after a verb of the legend's list that makes its object do something, it is enough that the text showed the word more
      // often as a verb than as a thing and never saying how things are: "let it drift", "have everything come out")
      const madeToDo = caused && !lexicon.thingFirst(clause.predicate) && lexicon.kindsOf(clause.predicate).quality === 0
      if (context.open !== false && clause.role === 'complement' && bare && !verb.form && lexicon.kindsOf(clause.predicate).verb === 0 && !madeToDo &&
          tokens[verb.predicate[0]].shape === 'lower') doubts.push({position: verb.predicate[0], not: 'verb'})
      // "keep the axis labels larger": the verb of a clause that completes another verb is never a form in -s
      // (with a word that stands for a thing right before it, the form in -s is the verb of a full clause: "make sure it fits")
      if (context.open !== false && clause.role === 'complement' && bare && lexicon.sForm(clause.predicate) && !previous?.pronoun) doubts.push({position: verb.predicate[0], not: 'verb'})
      clauses.push(clause)
    }
    clauses.forEach((clause, k) => { if (k && clause.start <= clauses[k - 1].index) clause.start = clauses[k - 1].index + 1 })
    // "excuse me", "Sign in a signboard": a command needs its verb. The word that opens a sentence with no verb, or that
    // opens a sentence right before a word that can only be an object ("me", "us", "them"), is the verb when the text
    // showed it often as a verb and never as a thing
    if (context.open !== false) {
      const k = list.findIndex(unit => !['filler', 'expression', 'separator', 'conjunction', 'adverb'].includes(unit.type))
      const opening = list[k], after = list[k + 1]
      const object = after?.type === 'entity' && after.pronoun && after.first === after.last && context.linkOf(tokens[after.first].word) === 'recipient' &&
        !lexicon.canBe(tokens[after.first].word, 'determiner')
      const at = opening?.type === 'entity' && !opening.pronoun && !opening.determiner?.length && tokens[opening.first].shape !== 'number' &&
        (opening.last > opening.first || after) && (!clauses.length || object && opening.first === opening.last) ? opening.first : -1
      const seen = at >= 0 && lexicon.formOf(tokens[at].word) === null ? lexicon.kindsOf(tokens[at].word) : null
      if (seen && seen.verb >= SURELY_A_VERB && seen.thing === 0) doubts.push({position: at, is: 'verb'})
    }

    // ---- clause wires
    const made = []
    const leading = list.slice(0, clauses.length ? clauses[0].start : list.length)
    const strays = []
    const polite = clauses.length ? leading.filter(unit => unit.type === 'filler') : []
    // "with the bigger one on the left, put two clouds": phrases with their own linking words that stand before
    // the first verb belong to its clause
    const phrases = leading.filter(unit => !['separator', 'absorbed', 'filler'].includes(unit.type))
    const fronted = context.open !== false && clauses.length > 0 && clauses[0].role === 'main' && phrases.length >= 2 && phrases.length % 2 === 0 &&
      phrases.every((unit, k) => unit.type === (k % 2 ? 'entity' : 'cue'))
    if (fronted) strays.push(...leading.filter(unit => unit.type === 'separator'))
    else if (leading.some(unit => !['separator', 'absorbed', 'filler'].includes(unit.type)) || leading.length && !clauses.length) {
      const fragment = fragmentClause()
      made.push(fragment, ...fill(fragment, leading))
      polite.length = 0
    } else strays.push(...leading.filter(unit => unit.type === 'separator'))
    clauses.forEach((clause, k) => {
      const verb = clause.verb
      const end = k + 1 < clauses.length ? clauses[k + 1].start : list.length
      let region = list.slice(clause.index + 1, end).filter(unit => unit !== verb.asked && !unit.claimed), returned = [], rest = []
      if (clause.role === 'modifier') {
        // what a participle says about a thing ends at the next separator; the list it stood in goes on
        // (a comma between two numbers lists them; it does not end what the participle says: "a line showing 10, 20 and 30")
        const number = unit => unit?.type === 'entity' && tokens[unit.last].shape === 'number'
        const cut = clause.modifiesHost && !context.trial?.('W') ? -1
          : region.findIndex((unit, at) => unit.type === 'separator' && !(number(region[at - 1]) && number(region[at + 1]) && region[at + 1].first === region[at + 1].last))
        const host = made.findLast(other => other.fragment && !other.gapOf || other.role === 'main')
        if (cut >= 0 && host && region.slice(cut).some(unit => unit.type === 'entity')) { returned = region.slice(cut); region = region.slice(0, cut) }
        clause.returnTo = host
      }
      // "a group called g2": a past form with one bare entity after it is the cue of a relation
      const content = region.filter(unit => unit.type !== 'separator')
      if (clause.role === 'modifier' && !clause.modifiesHost && verb.form === 'past' && !verb.negation.length && !verb.adverb.length &&
          content.length === 1 && content[0].type === 'entity') {
        const cue = {first: verb.predicate[0], last: verb.predicate[1]}
        const placed = clause.modifies.placedBy
        const named = placed && !placed.pronoun && clause.modifies.name && !clause.modifies.head ? placed : clause.modifies
        const relation = relate(entityWire(named), cue, entityWire(content[0]))
        content[0].placedBy = named
        relation.slots[0][1] = context.kindOf('relation', tokens[cue.last].word) ?? relation.slots[0][1]
        strays.push(...region.filter(unit => unit.type === 'separator'))
        if (returned.length) made.push(...fill(clause.returnTo, returned))
        return
      }
      const target = clause.wire = wire('c', 'nlu.clause')
      const question = clause.question
      const last = k === clauses.length - 1
      // "that is how the picture goes", "tell me what it shows": a question word, then a subject in its own right (a word
      // that stands for a thing, or a thing with its determiner; any thing after a question word that asks about no
      // thing: "how", "where", "when", "why"), then the verb: the clause states. A question would have its helping verb
      // before the subject.
      const ownSubject = clause.subject && question && list.indexOf(clause.subject) > list.indexOf(question) &&
        (Boolean(clause.subject.pronoun) || clause.subject.determiner?.length > 0 || lexicon.canBe(word(question), 'adverb'))
      // ("tell me which events are scheduled", "show what I said": a clause that a question word opens right after the verb of
      // another clause or after what that verb acts on belongs to that clause and states; only a clause that opens its
      // sentence with a question word asks, whatever its order)
      // (not where a form of "be" or a finite helping verb stands before the one it is said of: "what colour is the tree",
      // "what values does Sales show" ask)
      const embedded = context.open !== false && Boolean(question) && k > 0 && ['verb', 'entity'].includes(list[list.indexOf(question) - 1]?.type) &&
        !((context.linkOf(clause.predicate) === 'predicative' || context.tagged(clause.predicate, 'finite')) && list[clause.index + 1]?.type === 'entity')
      const stated = context.open !== false && (Boolean(ownSubject) || embedded) && !verb.inverted
      const asks = Boolean(question && !stated || verb.inverted) || !embedded && last && terminator && /\?/u.test(text.slice(tokens[terminator.first].start, tokens[terminator.last].end)) && clause.role === 'main'
      const finite = verb.auxiliary.some(position => !context.tagged(tokens[position].word, 'bare')) || lexicon.sForm(clause.predicate) ||
        Boolean(clause.subject?.pronoun) && context.linkOf(tokens[clause.subject.pronoun[0]].word) === 'subject'
      // "the chart that is already open", "the month that earned the most revenue": a clause that a relative word opens right
      // after a thing says something of that thing; it states, also with a past form and with no subject of its own
      const relativeClause = context.open !== false && clause.marker?.type === 'marker' && context.linkOf(word(clause.marker)) === 'relative' &&
        list[list.indexOf(clause.marker) - 1]?.type === 'entity' && !verb.inverted
      const form = clause.role !== 'main' ? (context.open !== false && clause.role === 'complement' && finite ? 'declarative' : 'nonfinite')
        : relativeClause && (verb.form !== 'progressive' || verb.auxiliary.length) ? 'declarative'
        // a bare form in -ing describes; it makes no statement by itself ("a dog lying down")
        : context.open !== false && verb.form === 'progressive' && !verb.auxiliary.length ? 'nonfinite'
        : asks ? 'interrogative'
        : clause.subject || embedded ? 'declarative'
        // "is it possible", "…, where is the first slot", "i'm wondering is the total four": a form of "be" with the one it is
        // said of right after it asks, when it opens its clause, also right after a verb that asks ("here is the plan", "the
        // first slot that is not the same", "what I want is the lollipop style" state)
        : context.open !== false && !verb.auxiliary.length && context.linkOf(clause.predicate) === 'predicative' && !context.tagged(clause.predicate, 'bare') &&
          list[clause.index + 1]?.type === 'entity' &&
          (!['verb', 'entity'].includes(list[clause.start - 1]?.type) || list[clause.start - 1].type === 'verb' && lexicon.asks(tokens[list[clause.start - 1].predicate[0]].word)) &&
          list.slice(clause.start, clause.index).every(unit => ['filler', 'expression', 'conjunction', 'separator'].includes(unit.type) || unit.type === 'marker' && context.linkOf(word(unit)) !== 'relative') ? 'interrogative'
        : verb.form === 'progressive' && !verb.auxiliary.length ? 'nonfinite'
        // a form that says what was done, with no one doing it, is no command ("as drawn so far")
        : context.open !== false && verb.form === 'past' && !verb.auxiliary.length ? 'nonfinite'
        // a verb in -s is said of something, also when its subject is not in the clause ("a chart that counts users")
        : context.open !== false && !verb.auxiliary.length && lexicon.sForm(clause.predicate) ? 'declarative'
        // a finite form of "be", "have" or "do" never gives a command: opening its clause before a thing it asks ("Does the
        // chart carry a Plan series?"); otherwise it states, also when its subject is not in the clause ("a gantt chart
        // that has one bar per task")
        : context.open !== false && !verb.auxiliary.length && context.tagged(clause.predicate, 'finite')
          ? ((clause.index === 0 || ['separator', 'conjunction', 'filler', 'expression'].includes(list[clause.index - 1]?.type)) && list[clause.index + 1]?.type === 'entity' ? 'interrogative' : 'declarative')
        : 'imperative'
      target.slots.push(['form', form])
      if (clause.marker) {
        // a marker joins two clauses as a relation; otherwise it stays on its own clause
        const anchor = list[list.indexOf(clause.marker) - 1]
        const relative = context.linkOf(word(clause.marker)) === 'relative'
        // "tell me if it fits": after a verb that takes questions the clause is what is asked
        const asker = anchor?.type === 'entity' && anchor.pronoun ? list[list.indexOf(anchor) - 1] : null
        const asked = context.kindOf('relation', word(clause.marker)) === 'condition' && asker?.type === 'verb' && lexicon.asks(tokens[asker.predicate[0]].word)
        const joins = clause.role === 'main' && made.length && !(relative && anchor?.type === 'entity') && anchor?.type !== 'verb' && !asked
        // "while you're there, thin the lines": a clause that opens the sentence with its marker
        // hangs on the clause that follows it.
        // "flip the labels over — while you're at it, give it a title", "while you are at it, a rug", "if it is not too much
        // trouble, a sock": so does a clause that a subordinator opens after a dash, a semicolon or a colon, which begins a new
        // part of the sentence; it never hangs on the clause before the break. With no clause after it, it ends at its comma
        // and hangs on the words after the comma, unless they are a list that "and" closes ("if it covers the box, the circle
        // and the line")
        // ("— so the scene reads the way it should": with no comma after it, a clause after a break hangs on the clause before)
        const breaks = context.open !== false && anchor?.type === 'separator' && /^[—–:;-]$/u.test(tokens[anchor.first].text)
        const opensPart = clause.role === 'main' && !relative && clause.marker.type === 'marker' && (!made.some(other => other.fragment || other.role === 'main') || breaks)
        const next = clauses[k + 1]
        const fronted = opensPart && (breaks ? next?.role === 'main' && !next.marker && !next.relativeTo && next.separator && tokens[next.separator.first].text === ','
          : clauses.slice(k + 1).some(other => other.role === 'main' && !other.marker))
        let cut = -1
        if (context.open !== false && opensPart && !fronted && !(joins && !breaks)) {
          cut = region.findIndex((unit, at) => unit.type === 'separator' && /^[,—–-]$/u.test(tokens[unit.first].text) && ['entity', 'complement'].includes(region[at + 1]?.type))
          const after = cut >= 0 ? region.slice(cut + 1) : []
          if (after.some(unit => unit.type === 'conjunction') && after.every(unit => ['entity', 'complement', 'separator', 'conjunction'].includes(unit.type))) cut = -1
        }
        if (fronted && breaks) clause.fronted = clause.marker
        else if (cut >= 0) {
          clause.fronted = clause.marker
          clause.hung = true
          rest = region.slice(cut + 1)
          strays.push(region[cut])
          region = region.slice(0, cut)
        } else if (joins) clause.joinedBy = clause.marker
        else if (fronted) clause.fronted = clause.marker
        else { put(target, 'marker', clause.marker.first, clause.marker.last); clause.after = asked ? asker : anchor }
      }
      if (question) put(target, 'question', question.first, question.last)
      put(target, 'predicate', ...verb.predicate)
      for (const position of verb.auxiliary) put(target, 'auxiliary', position)
      for (const position of verb.negation) put(target, 'negation', position)
      for (const position of verb.adverb) put(target, 'adverb', position)
      if (verb.negation.length || clause.pre.some(unit => unit.type === 'negation')) target.slots.push(['polarity', 'negative'])
      for (const unit of clause.pre) put(target, unit.type, unit.first, unit.last)
      // ("have the boy in the green hat and the boy in the yellow hat trade hats": the object joined with "and" does it together)
      if (clause.subject) target.slots.push(['subject', '$' + (clause.causedBy && clause.subject.group ? clause.subject.group : entityWire(clause.subject)).id])
      if (clause.asked) { const slot = ['direct_object', '$' + entityWire(clause.asked).id]; target.slots.push(slot); clause.asked.holder = slot }
      for (const [cue, entity, from] of clause.chain ?? []) relate(entityWire(from), cue, entityWire(entity))
      // "Please, create …": a courtesy word before the first clause belongs to it
      while (polite.length) { const unit = polite.shift(); put(target, 'filler', unit.first, unit.last) }
      if (fronted && k === 0) {
        fill(clause, phrases)
        Object.assign(clause.state, {lastEntity: null, tail: null})
        clause.state.frontier.length = 0
      }
      made.push(clause, ...fill(clause, region))
      if (returned.length) made.push(...fill(clause.returnTo, returned))
      if (rest.length) {
        // the words after the comma of a clause that opens the sentence with its subordinator: the part it hangs on
        const part = fragmentClause()
        made.push(part, ...fill(part, rest))
        const relation = relate(part.wire, clause.marker, clause.wire)
        relation.slots[0][1] = context.kindOf('relation', word(clause.marker)) ?? relation.slots[0][1]
      }
    })
    const standing = made.filter(clause => clause.fragment || clause.role === 'main')
    for (const unit of strays) put((standing.findLast(clause => clause.wire.id) ?? made[0] ?? orphan()).wire, 'separator', unit.first, unit.last)
    if (terminator) put((made.at(-1) ?? orphan()).wire, 'terminator', terminator.first, terminator.last)

    // ---- how the clauses of the sentence hang together
    made.forEach((clause, k) => {
      if (clause.fragment) return
      // the clause it is joined to: the nearest one before it that stands on its own
      const before = made.slice(0, k).findLast(other => other.fragment || other.role === 'main')
      if (clause.role === 'modifier') {
        // "a man on the path wearing a cap": the participle describes the thing that was placed,
        // unless the text shows it said of the place more often
        if (clause.modifiesHost) {
          // ", coloured by region": the thing the clause before it is about. A participle describes a thing named in the
          // words, never a pronoun ("give me a bar chart of the spend, broken out by category": the chart, not "me"); with
          // no such thing among what the clause acts on, the nearest one before the comma
          const objects = before?.state?.objects ?? []
          const at = list.indexOf(clause.separator ?? clause.verb)
          const nearest = list.slice(0, at).findLast(unit => unit.type === 'entity' && !unit.pronoun && unit.wire)
          const thing = objects.find(unit => !unit.pronoun) ?? (objects[0]?.pronoun && nearest) ?? objects[0] ?? before?.subject
          if (clause.separator) put((before ?? clause).wire, 'separator', clause.separator.first, clause.separator.last)
          if (!thing) return
          clause.modifies = thing
        }
        let described = clause.modifies
        const placed = described.placedBy
        const said = thing => context.describes(clause.predicate, headWord(thing)) + context.suits(clause.predicate, headWord(thing))
        if (placed && !placed.pronoun && placed !== described && said(placed) >= said(described)) described = placed
        const relation = wire('r', 'nlu.relation')
        relation.slots.push(['kind', context.kindOf('relation', null)], ['from', '$' + entityWire(described).id], ['to', '$' + clause.wire.id])
        return
      }
      if (clause.purposeOf) {
        // what the thing is for
        const relation = wire('r', 'nlu.relation')
        relation.slots.push(['kind', 'purpose'], ['from', '$' + entityWire(clause.purposeOf).id], ['to', '$' + clause.wire.id])
        return
      }
      if (clause.role === 'infinitive' || clause.role === 'complement') {
        // (what an object is made to do completes the verb that makes it do so, also past a participle between them)
        const governor = (clause.causedBy && made.slice(0, k).findLast(other => other.verb === clause.causedBy)) || made.slice(0, k).findLast(other => !other.fragment)
        if (governor) completes(governor.wire, clause.wire)
        return
      }
      if (clause.relativeTo) {
        const relation = wire('r', 'nlu.relation')
        relation.slots.push(['kind', context.kindOf('relation', null)], ['from', '$' + entityWire(clause.relativeTo).id], ['to', '$' + clause.wire.id])
        return
      }
      const opener = made.slice(0, k).find(other => other.fronted && !other.hung)
      if (opener && clause.role === 'main' && !clause.marker) {
        const relation = relate(clause.wire, opener.fronted, opener.wire)
        relation.slots[0][1] = context.kindOf('relation', word(opener.fronted)) ?? relation.slots[0][1]
        opener.hung = true
      }
      if (clause.joinedBy && before) {
        // "add two ducks, keeping everything else where it is": with no comma before its linking word, the clause completes
        // the nearest verb before it, also when that verb is a participle ("keeping"), not only the main verb ("add"). A
        // participle that describes the thing right before it ("a lake ringed by glaciers as I said", "the line connecting
        // Done and Worker if you can") takes the clause only when the linking word follows it at once ("a girl sitting where
        // the path bends")
        const at = list.indexOf(clause.joinedBy)
        const near = made.slice(made.indexOf(before) + 1, k).findLast(other => other.verb && other.wire && list.indexOf(other.verb) < at)
        const between = near ? list.slice(list.indexOf(near.verb) + 1, at) : []
        const host = near && between.every(unit => unit.type !== 'separator') &&
          (near.role !== 'modifier' || near.modifiesHost || between.every(unit => unit.type === 'adverb')) ? near : before
        const relation = relate(host.wire, clause.joinedBy, clause.wire)
        relation.slots[0][1] = context.kindOf('relation', word(clause.joinedBy)) ?? relation.slots[0][1]
        return
      }
      if (clause.marker && clause.role === 'main' && before) {
        if (clause.after?.type === 'entity') {
          const relation = wire('r', 'nlu.relation')
          relation.slots.push(['kind', context.kindOf('relation', null)], ['from', '$' + entityWire(clause.after).id], ['to', '$' + clause.wire.id])
        } else if (clause.after?.type === 'verb' && !before.fragment) {
          // "a girl sitting where the path bends": right after a verb, the clause completes that verb, also a participle
          const own = made.slice(0, k).findLast(other => other.verb === clause.after && other.wire)
          completes((own ?? before).wire, clause.wire)
        }
        return
      }
      if (clause.conjunction && before) {
        // "drag House next to Gate so the flow makes sense, but do not move Pond", "put a tree on the side where the sun rises,
        // and make it smaller": conjuncts are alike. A command that a conjunction joins is listed with the clause that a
        // subordinate clause hangs on, not with that subordinate clause (one with its own linking word, or one that says which
        // thing is meant); not with a part that has no verb ("what if we put a tree there, and leave it": the commands are listed
        // together)
        const subordinate = other => Boolean(other.joinedBy || other.relativeTo || other.wire?.slots.some(slot => slot[0] === 'marker'))
        const command = context.open !== false && !clause.subject && clause.wire.slots.some(slot => slot[0] === 'form' && slot[1] === 'imperative')
        const partner = command && subordinate(before) ? made.slice(0, k).findLast(other => other.role === 'main' && other.verb && !subordinate(other)) ?? before : before
        // "A, B, and C": clauses that only commas separate join the same coordination
        const cue = clause.conjunction
        const join = wire('k', 'nlu.coordination')
        const members = [partner], cues = []
        for (let current = partner; current.commaOnly && !current.commaUsed;) {
          let earlier = made.slice(0, made.indexOf(current)).findLast(other => other.fragment || other.role === 'main')
          // (a clause that its own subordinator ties to the clause before it is no conjunct; the list goes on with the clause it
          // hangs on: "pull the levels apart until each band sits evenly, straighten the trunk, and leave …")
          if (context.open !== false && earlier?.joinedBy) earlier = made.slice(0, made.indexOf(earlier)).findLast(other => other.role === 'main' && other.verb && !subordinate(other))
          // (nor is a clause that opens the sentence with its subordinator, which hangs on the clause after it: "while you're
          // there, go for … and have …")
          if (!earlier || earlier.fragment || context.open !== false && earlier.fronted || !context.kindOf('coordination', word(current.commaOnly), true)) break
          members.unshift(earlier)
          cues.unshift(current.commaOnly)
          current.commaUsed = true
          current = earlier
        }
        join.slots.push(['kind', context.kindOf('coordination', word(cue))], ...members.map(member => ['member', '$' + member.wire.id]), ['member', '$' + clause.wire.id])
        for (const comma of cues) put(join, 'cue', comma.first, comma.last)
        // the comma before the conjunction closes the clause before it
        if (clause.separator) put(before.wire, 'separator', clause.separator.first, clause.separator.last)
        put(join, 'cue', cue.first, cue.last)
      } else if (clause.conjunction) put(clause.wire, 'connective', clause.conjunction.first, clause.conjunction.last)
      else if (clause.separator) {
        // a bare separator between two clauses: a later conjunction may still take it as its cue
        clause.commaOnly = clause.separator
        clause.commaHost = before ?? clause
      }
    })
    for (const clause of made) {
      if (!clause.commaOnly || clause.commaUsed) continue
      // "I cannot see it, drag it to the corner", "join them with an arrow, will you": two clauses with their own verbs that
      // only a comma separates, and that no later conjunction joins, stand side by side in their sentence
      const host = clause.commaHost
      // (not a clause that its own linking word ties to the other: "since they belong together, place them side by side")
      const free = other => !other.marker && !other.fronted && !other.joinedBy && !other.hung
      if (context.open !== false && host !== clause && !host.fragment && host.role === 'main' && clause.role === 'main' && free(host) && free(clause) &&
          context.kindOf('coordination', word(clause.commaOnly), true)) {
        let join = host.commaJoin
        if (!join) {
          join = host.commaJoin = wire('k', 'nlu.coordination')
          join.slots.push(['kind', context.kindOf('coordination', word(clause.commaOnly))], ['member', '$' + host.wire.id])
        }
        join.slots.push(['member', '$' + clause.wire.id])
        put(join, 'cue', clause.commaOnly.first, clause.commaOnly.last)
        clause.commaJoin = join
      } else put(host.wire, 'separator', clause.commaOnly.first, clause.commaOnly.last)
    }

    // What stands before a verb belongs to its clause: its subject (with what hangs on the
    // subject), a helping verb, a question word, and the word that joins it to what precedes.
    function scanLeft(clause, i) {
      const verb = list[i]
      let j = i - 1
      if (verb.inverted) {
        clause.subject = verb.inverted.subject
        for (let k = list.indexOf(verb.inverted.subject) + 1; k < i; k++) clause.pre.push(list[k])
        j = list.indexOf(verb.inverted.aux) - 1
      }
      for (;;) {
        const unit = list[j]
        if (!unit) break
        if (unit.type === 'adverb' || unit.type === 'filler' || unit.type === 'negation') { clause.pre.push(unit); j--; continue }
        // "what values does Sales show": before the helping verb, the thing a question word asks for is what the verb acts on
        if (context.open !== false && unit.type === 'entity' && clause.subject && verb.inverted && !clause.asked && !unit.pronoun &&
            list[j - 1]?.type === 'question' && !clause.question) {
          clause.asked = unit
          clause.question = list[j - 1]
          j -= 2
          continue
        }
        if (unit.type === 'entity' && !clause.subject) {
          let head = j
          const chain = []
          while (list[head - 1]?.type === 'cue' && list[head - 2]?.type === 'entity') {
            chain.unshift([list[head - 1], list[head], list[head - 2]])
            head -= 2
          }
          const before = list[head - 1]
          if (before?.type === 'cue' && !chain.length && lexicon.canBe(word(before), 'marker')) {
            // "as it stood": the cue introduces the clause, the entity is its subject
            clause.subject = unit
            clause.marker = before
            j = head - 2
            break
          }
          // "on Friday I need the chart": a clause whose verb has its own thing after it does not describe the thing
          // before it; the pronoun is its subject and the clause starts there
          if (context.open !== false && before?.type === 'entity' && !chain.length && unit.pronoun && !before.pronoun && list[i + 1]?.type === 'entity') {
            clause.subject = unit
            j = head - 1
            break
          }
          if (before?.type === 'entity' && !chain.length && unit.pronoun && !before.pronoun) {
            // "the positions they began in": a clause that says which thing is meant
            clause.subject = unit
            clause.relativeTo = before
            j = head - 1
            break
          }
          // "until its edge meets the edge": a word that can link a clause as well as a thing links the clause
          // when a verb in -s needs the thing after it as its subject
          if (context.open !== false && before?.type === 'cue' && before.first === before.last && lexicon.canBe(word(before), 'marker') &&
              !verb.auxiliary.length && lexicon.sForm(clause.predicate)) {
            clause.subject = list[head]
            clause.chain = chain
            clause.marker = before
            before.type = 'marker'
            j = list.indexOf(before) - 1
            break
          }
          // "the way the drawing looks": two things in a row before a verb form that needs a subject (a form in -s, or a
          // finite helping verb): the second, opened by a determiner, is that subject, and the clause says which first
          // thing is meant
          const needsSubject = verb.auxiliary.length ? context.tagged(tokens[verb.auxiliary[0]].word, 'finite') : lexicon.sForm(clause.predicate) || context.tagged(clause.predicate, 'finite')
          if (context.open !== false && before?.type === 'entity' && !chain.length && unit.determiner?.length && !before.pronoun && needsSubject && !verb.inverted) {
            clause.subject = unit
            clause.relativeTo = before
            j = head - 1
            break
          }
          if (before && ['verb', 'cue', 'entity', 'complement'].includes(before.type)) break
          clause.subject = list[head]
          clause.chain = chain
          j = head - 1
          continue
        }
        if (unit.type === 'question' && !clause.question) { clause.question = unit; j--; continue }
        if (unit.type === 'marker') { clause.marker = unit; j--; break }
        if (unit.type === 'conjunction') {
          clause.conjunction = unit
          j--
          if (list[j]?.type === 'separator') { clause.separator = list[j]; j-- }
          break
        }
        if (unit.type === 'separator') { clause.separator = unit; j--; break }
        break
      }
      clause.start = j + 1
    }

    function orphan() {
      const fragment = fragmentClause()
      made.push(fragment)
      return fragment
    }
  }

  // An entity opens a clause when nothing before it governs it.
  function opensClause(list, index) {
    let head = index
    while (list[head - 1]?.type === 'cue' && list[head - 2]?.type === 'entity') head -= 2
    const before = list[head - 1]
    return !before || ['separator', 'conjunction', 'marker', 'filler', 'expression', 'adverb'].includes(before.type)
  }

  // ---- the material after a verb (or of a verbless fragment). Returns the clauses it opened.
  function fill(clause, region) {
    const target = clause.wire
    const verb = clause.verb
    const state = clause.state ??= {objects: [], frontier: [], lastEntity: null, tail: null}
    const {objects, frontier} = state
    const opened = []
    let lastEntity = state.lastEntity, pendingCue = null, pendingJoin = [], adverbForCue = null
    // the relation made last, a joiner waiting to join the next relation to it, and a negation waiting for its relation
    let lastRelation = null, relationJoin = null, relationNegation = null
    // a fragment that repeats the pattern of a clause shares that clause's verb
    const acts = verb ?? clause.gapOf?.verb
    const predicative = acts && context.linkOf(tokens[acts.predicate[0]].word) === 'predicative'
    const shapeOf = units => units.map(unit => ({entity: 'E', cue: 'C', complement: 'Q'})[unit.type] ?? (unit.type === 'adverb' ? '' : 'X')).join('')
    // how the segment before a joiner ended: with a quality, or with a relation held by the clause
    let tail = state.tail
    const role = (key, entity) => {
      const slot = [key, '$' + entityWire(entity).id]
      target.slots.push(slot)
      entity.holder = slot
    }
    const settle = () => {
      // joiners that joined nothing stay on the clause
      for (const joiner of pendingJoin) put(target, joiner.type === 'separator' ? 'separator' : 'connective', joiner.first, joiner.last)
      pendingJoin = []
    }
    for (let i = 0; i < region.length; i++) {
      const unit = region[i], next = region[i + 1]
      if (unit.type === 'absorbed') continue
      if (unit.type === 'entity') {
        const made = entityWire(unit)
        if (pendingCue?.setOff) {
          // ", next to the crate, a small black cat": the phrase set off by commas says where the new thing after it is. The
          // relation starts at that new thing, and the joining words before the phrase join the new thing to the list
          const relation = relate(entityWire(region[i + 2]), pendingCue, made, adverbForCue)
          unit.phrase = true
          unit.fronting = true
          unit.holder = relation.slots.find(slot => slot[0] === 'to')
          unit.placedBy = region[i + 2]
          pendingJoin = [...pendingCue.setOff, ...pendingJoin]
          pendingCue = null
          adverbForCue = null
          frontier.push(unit)
          continue
        }
        const joinable = pendingJoin.length && lastEntity && !pendingCue &&
          pendingJoin.every(joiner => context.kindOf('coordination', tokens[joiner.last].word, true))
        if (pendingCue) {
          settle()
          const relation = relate(null, pendingCue, made, adverbForCue)
          unit.phrase = true      // the end of a phrase with its own linking word
          attach(relation, clause, lastEntity, pendingCue, unit)
          if (relationNegation) { put(relation, 'negation', relationNegation.first, relationNegation.last); relationNegation = null }
          if (relationJoin) {
            // "near Ben but not behind Jo": the second phrase starts where the first does, and the two are joined
            const start = relationJoin.with.slots.find(slot => slot[0] === 'from')[1]
            relation.slots.find(slot => slot[0] === 'from')[1] = start
            const mark = relation.slots.findIndex(slot => slot[0] === 'attachment')
            if (mark >= 0 && !relationJoin.with.slots.some(slot => slot[0] === 'attachment')) relation.slots.splice(mark, 1)
            let join = relationJoin.with.group
            if (!join) {
              join = relationJoin.with.group = wire('k', 'nlu.coordination')
              join.slots.push(['kind', null], ['member', '$' + relationJoin.with.id])
            }
            relation.group = join
            join.slots.push(['member', '$' + relation.id])
            for (const joiner of relationJoin.joiners) put(join, 'cue', joiner.first, joiner.last)
            join.slots[0][1] = context.kindOf('coordination', tokens[relationJoin.joiners.at(-1).last].word)
            relationJoin = null
          }
          lastRelation = relation
          // the thing this one is placed by: the entity the relation starts at, or the clause's own thing
          const start = relation.slots.find(slot => slot[0] === 'from')[1]
          unit.placedBy = start === '$' + target.id ? objects[0] ?? clause.subject ?? null
            : frontier.find(thing => thing.wire && '$' + thing.wire.id === start) ?? lastEntity
          tail = relation.slots.find(slot => slot[0] === 'from')[1] === '$' + target.id ? 'held' : null
          pendingCue = null
          adverbForCue = null
          unit.holder = relation.slots.find(slot => slot[0] === 'to')
        } else if (joinable) {
          // a comma alone lists the new thing with the things of the clause, not with the end of a relation
          const commaOnly = context.open !== false && pendingJoin.every(joiner => joiner.type === 'separator')
          const level = commaOnly ? frontier.filter(thing => thing.holder?.[0] !== 'to') : []
          // "book the sync at 16:00, Friday, for 60 minutes": set off by a comma after a phrase with its own linking
          // word, a thing that nothing opens (no "a", no "the") and that is unlike every thing of the clause, in
          // meaning and in build, is not one more of what the verb acts on. It belongs to the clause, and the words
          // do not say how.
          const likeness = Math.max(...(level.length ? level : frontier).map(thing => context.alike(tokens, thing, unit)))
          // (also right after what the verb acts on: "reschedule Review, 2026-11-18 at 10:00")
          const aside = commaOnly && verb && objects.length > 0 && !unit.determiner?.length && !unit.pronoun && likeness < UNLIKE
          // "for Ana, Mihai and me": a series that a joining word closes begins with the thing right before its first comma,
          // also when that thing ends a phrase with a linking word
          let seriesU = false
          if (context.trial?.('U') && commaOnly && !unit.pronoun) {
            let closed = false
            for (let j = i + 1; j < region.length && !closed; j++) {
              if (region[j].type === 'conjunction') closed = region[j + 1]?.type === 'entity' || region[j + 1]?.type === 'complement'
              else if (!['separator', 'entity'].includes(region[j].type)) break
            }
            // (only when the thing before the comma is introduced like the new one: "next to the postbox, a small girl"
            // names a place, then begins a new thing)
            seriesU = closed && region[i - 2] === frontier.at(-1) && frontier.at(-1)?.holder?.[0] === 'to' &&
              context.opener(tokens, frontier.at(-1)) === context.opener(tokens, unit)
          }
          const asideW = false
          // "a boy with a kite, a dog on the grass, and a girl": after things listed by commas alone, the thing that a comma
          // and a conjunction introduce is the last of that same list
          const serial = context.open !== false && !commaOnly && state.listed && pendingJoin.some(joiner => joiner.type === 'separator') &&
            pendingJoin.some(joiner => joiner.type === 'conjunction')
          // "on pages 2 and 3", "set them to 10, 20, 30": a number right after the joining words that follow a number is
          // listed with that number
          const numbers = unit.first === unit.last && tokens[unit.first].shape === 'number' && region[i - 1 - pendingJoin.length] === lastEntity &&
            tokens[lastEntity.last].shape === 'number'
          // "make a house, size 80", "My avatar, an old man, that is the figure I want", "just the scale bar, 5 units": a list
          // of things is closed by a conjunction before its last item ("A, B and C"). One thing that only a comma sets off
          // after a thing the clause holds, introduced otherwise than that thing (another determiner, a count, a value), in a
          // series that no conjunction closes and that no further item continues, is no second item: it says more about the
          // thing before it (what it is, its measure, where it is). Not after the end of a phrase with a linking word, where it
          // may as well say more about the clause or begin the next part ("hold off on the cat for now, hands off", "I paste it
          // into the newsletter; this week, make …"). Things introduced alike still form a list ("draw a circle, a square, a
          // triangle"), and so do lists of several items ("Planning: 2026-11-18 10:00 UTC, 30 minutes, ID planning, notes …").
          // (the items of a list may carry place phrases and participles: "a stall, a vendor, an apron on the vendor, and a boy";
          // the list ends at a new clause or at the end of the sentence)
          let closed = false
          for (let j = units.indexOf(unit) + 1; j > 0 && j < units.length && !closed; j++) {
            const other = units[j]
            if (other.type === 'conjunction') closed = ['entity', 'complement'].includes(units[j + 1]?.type)
            else if (['terminator', 'marker', 'aux'].includes(other.type) || other.type === 'verb' && !other.form) break
          }
          let ahead = units.indexOf(unit) + 1
          while (units[ahead]?.type === 'adverb' || units[ahead]?.type === 'cue' && units[ahead + 1]?.type === 'entity') ahead += units[ahead].type === 'cue' ? 2 : 1
          const further = units[ahead]?.type === 'separator' && units[ahead + 1]?.type === 'entity' && !['verb', 'aux'].includes(units[ahead + 2]?.type)
          let back = i - 1 - pendingJoin.length
          while (region[back]?.type === 'adverb') back--
          // (nor after a thing that is itself an item of a list, "the third and fourth, the odd pairs only", or a measure or a
          // value, "raise five blocks two rows above, the same as the top row")
          const setOff = context.open !== false && commaOnly && !closed && !further && !numbers && !serial && !seriesU && !aside && lastEntity && region[back] === lastEntity &&
            !lastEntity.group && !lastEntity.aside && !lastEntity.quantity?.length && !lastEntity.literal && context.opener(tokens, unit) !== context.opener(tokens, lastEntity) && lastEntity.holder?.[0] !== 'to'
          if (numbers) coordinate(lastEntity, unit, pendingJoin)
          else if (serial) coordinate(state.listed, unit, pendingJoin)
          else if (seriesU) coordinate(frontier.at(-1), unit, pendingJoin)
          else if (setOff) {
            const relation = wire('r', 'nlu.relation')
            relation.slots.push(['kind', 'open'], ['from', '$' + entityWire(lastEntity).id], ['to', '$' + entityWire(unit).id])
            unit.holder = relation.slots[2]
            unit.aside = true
          }
          else if (aside || asideW) {
            const relation = wire('r', 'nlu.relation')
            const before = frontier.at(-1)
            // "a new person, Jamal": a bare name right after a thing that a determiner opens names that thing
            const names = asideW && !aside && before?.holder?.[0] !== 'to' && before?.determiner?.length && unit.name && !unit.head && !unit.determiner?.length
            relation.slots.push(['kind', 'open'], ['from', '$' + (names ? entityWire(before).id : target.id)], ['to', '$' + entityWire(unit).id])
            unit.holder = relation.slots[2]
            unit.aside = true
          } else {
            // (the end of a phrase that says where the new thing is, ", next to the crate, a cat", is not listed with it)
            const candidates = (level.length ? level : frontier).filter(thing => !thing.fronting)
            if (candidates.length) coordinate(partner(unit, candidates), unit, pendingJoin)
            else { role(clause.fragment ? (objects.length ? 'participant' : 'topic') : 'participant', unit); objects.push(unit) }
          }
          if (unit.group && (commaOnly || serial)) state.listed = unit
          pendingJoin = []
        } else {
          const broke = pendingJoin.find(joiner => joiner.type === 'separator')
          settle()
          if (broke && verb && !objects.length && !has(target, 'result_complement')) {
            // "before I forget, a fireplace": after the break the thing is only mentioned
            const mention = fragmentClause()
            opened.push(mention, ...fill(mention, region.slice(i)))
            state.lastEntity = lastEntity
            state.tail = tail
            return opened
          }
          if (broke && objects.length && !context.kindOf('coordination', tokens[broke.last].word, true)) {
            // "a picnic spot: a blanket, a basket": what follows the break spells the thing out
            const relation = wire('r', 'nlu.relation')
            relation.slots.push(['kind', 'elaboration'], ['from', '$' + entityWire(objects.at(-1)).id], ['to', '$' + made.id])
            unit.holder = relation.slots[2]
            objects.push(unit)
            tail = null
            lastEntity = unit
            frontier.length = 0
            frontier.push(unit)
            continue
          }
          const key = clause.fragment && !clause.gapOf ? (objects.length ? null : 'topic')
            // (a thing after "be" is the subject only where a main clause opens with "be": "is the box red")
            : predicative ? (objects.length || clause.subject || context.open !== false && (clause.role !== 'main' || verb?.auxiliary.length) ? 'predicative_entity' : 'subject')
            : objects.length === 0 ? 'direct_object' : objects.length === 1 ? 'predicative_entity' : null
          // Two bare things after a verb: the first receives the second ("give the snowman a
          // smile") or the second says what the first becomes ("make the snowman a hero").
          // The habits of the verb decide; when it has both, the other frame is the doubt.
          let recipient = false
          if (key === 'predicative_entity' && !predicative && objects[0].holder?.[0] === 'direct_object' && acts) {
            const verbWord = tokens[acts.predicate[0]].word
            const person = objects[0].pronoun && context.linkOf(tokens[objects[0].pronoun[0]].word) === 'recipient'
            const hands = lexicon.gives(verbWord), turns = lexicon.takesQuality(verbWord)
            const label = unit.name && !unit.head && !unit.determiner?.length
            recipient = person || hands && !turns && !label
            if (!person && hands && turns && !label) {
              const id = decisions.length
              decisions.push({id, margin: 0.2, cue: 'frame'})
              recipient = flips.has(id)
            }
          }
          // does the verb take a second bare thing: one it gives, names, or turns the first into?
          const verbWord = acts ? tokens[acts.predicate[0]].word : null
          const takesTwo = predicative || verbWord && (lexicon.takesQuality(verbWord) || lexicon.names(verbWord) || lexicon.gives(verbWord))
          const settled = key && !has(target, key) && (key !== 'predicative_entity' || takesTwo)
          const beside = lastEntity && region[i - 1] === lastEntity && !lastEntity.pronoun && !lastEntity.literal
          const value = Boolean(unit.literal) || Boolean(unit.name) && !unit.head && !unit.determiner?.length
          if (recipient) {
            // "give me a hand": the person comes first, the thing given second
            objects[0].holder[0] = 'indirect_object'
            role('direct_object', unit)
          } else if (context.open === false) {
            if (key && !has(target, key)) role(key, unit)
            else {
              // one bare entity more than the clause has places for stands beside the one before
              const relation = wire('r', 'nlu.relation')
              relation.slots.push(['kind', 'apposition'], ['from', '$' + entityWire(objects.at(-1) ?? unit).id], ['to', '$' + made.id])
              unit.holder = relation.slots[2]
            }
          } else if (settled && key === 'predicative_entity' && predicative && clause.question && clause.subject && !objects.length && target.slots.some(slot => slot[0] === 'subject')) {
            // "what colour is the castle": the thing after "be" is what the question is about; the
            // thing asked for stands before it
            target.slots.find(slot => slot[0] === 'subject')[0] = 'predicative_entity'
            role('subject', unit)
          } else if (settled) role(key, unit)
          // (a thing right after a thing that the verb does not take itself stands with that thing: "with blocks one paragraph")
          else if (beside && (value || !(objects.includes(lastEntity) || lastEntity.group && objects.some(other => other.group === lastEntity.group)))) {
            // "x 120", "id Id one": a value right after a thing stands with that thing; no word says how
            const relation = wire('r', 'nlu.relation')
            relation.slots.push(['kind', 'open'], ['from', '$' + entityWire(lastEntity).id], ['to', '$' + made.id])
            unit.holder = relation.slots[2]
            unit.tied = true
          } else role('participant', unit)         // it takes part in the clause; the words do not settle how
          if (!unit.tied) objects.push(unit)
          tail = null
        }
        lastEntity = unit
        frontier.push(unit)
        continue
      }
      if (unit.type === 'conjunction' || unit.type === 'separator') {
        // "make the second box blue and the first one green": when what follows the joiner
        // repeats the pattern of what precedes it, it is a clause of its own that shares the verb
        let j = i
        while (region[j]?.type === 'conjunction' || region[j]?.type === 'separator') j++
        let k = j
        while (k < region.length && region[k].type !== 'conjunction' && region[k].type !== 'separator') k++
        const joiners = region.slice(i, j), segment = region.slice(j, k)
        const after = shapeOf(segment)
        const cue = segment.find(other => other.type === 'cue')
        // the new segment has its own thing and then either its own quality, or its own relation
        // that the verb would hold: the same build as the segment before it
        const host = clause.gapOf ?? clause
        const first = segment[0], model = host.state?.objects[0] ?? objects[0]
        const sameClass = first?.type === 'entity' && model && !first.pronoun && Boolean(first.head) === Boolean(model.head) && Boolean(first.literal) === Boolean(model.literal)
        const mirrors = sameClass && (host.gapJoin && after.startsWith('E') ||
          tail === 'quality' && after.startsWith('EQ') ||
          tail === 'held' && after.startsWith('ECE') &&
            context.attach(host.predicate, headWord(first), tokens[cue.last].word) >= 0)
        const parallel = context.gapping !== false && acts && !pendingCue && mirrors && !after.includes('X') &&
          joiners.every(joiner => context.kindOf('coordination', tokens[joiner.last].word, true)) && !joiners.some(joiner => context.joinsClauses(word(joiner)))
        if (parallel) {
          settle()
          const fragment = fragmentClause()
          fragment.gapOf = host
          // the fragment shares the verb of the clause it mirrors
          fragment.wire.shares = host.wire.id
          fragment.predicate = host.predicate
          let join = host.gapJoin
          if (!join) {
            join = host.gapJoin = wire('k', 'nlu.coordination')
            join.slots.push(['kind', null], ['member', '$' + host.wire.id])
          }
          join.slots.push(['member', '$' + fragment.wire.id])
          for (const joiner of joiners) put(join, 'cue', joiner.first, joiner.last)
          join.slots[0][1] = context.kindOf('coordination', tokens[(joiners.findLast(joiner => joiner.type === 'conjunction') ?? joiners.at(-1)).last].word)
          opened.push(fragment, ...fill(fragment, segment))
          lastEntity = null
          i = k - 1
          continue
        }
        // "…, then the girl to the left": what follows a joiner of clauses is a clause of its own
        const rest = region.slice(i + 1)
        const led = rest.find(other => other.type !== 'separator' && other.type !== 'adverb' && other.type !== 'filler')
        if (unit.type === 'conjunction' && context.joinsClauses(word(unit)) && led && ['entity', 'complement', 'expression'].includes(led.type) && !pendingCue) {
          settle()
          const fragment = fragmentClause()
          const join = wire('k', 'nlu.coordination')
          join.slots.push(['kind', context.kindOf('coordination', word(unit))], ['member', '$' + target.id], ['member', '$' + fragment.wire.id])
          put(join, 'cue', unit.first, unit.last)
          opened.push(fragment, ...fill(fragment, rest))
          return opened
        }
        pendingJoin.push(unit)
        continue
      }
      // ", next to the crate, a small black cat": set off by commas, a phrase whose linking word points at a thing already
      // known (a pronoun, or a thing that a definite determiner opens: "it", "the crate") right before a new thing (counted,
      // or opened by another determiner: "two cats", "a cat") says where that new thing is
      const cueAt = unit.type === 'cue' ? i : unit.type === 'adverb' && unit.first === unit.last && next?.type === 'cue' ? i + 1 : -1
      const known = thing => Boolean(thing.pronoun) || thing.determiner?.length > 0 && context.tagged(tokens[thing.determiner[0]].word, 'definite')
      const fresh = thing => !thing.pronoun && (thing.quantity?.length > 0 || Boolean(thing.literal) || thing.determiner?.length > 0 && !known(thing))
      if (context.open !== false && cueAt >= 0 && !pendingCue && lastEntity && pendingJoin.some(joiner => joiner.type === 'separator') &&
          region[cueAt + 1]?.type === 'entity' && known(region[cueAt + 1]) && region[cueAt + 2]?.type === 'separator' &&
          region[cueAt + 3]?.type === 'entity' && fresh(region[cueAt + 3])) {
        region[cueAt].setOff = pendingJoin
        pendingJoin = []
      }
      // "near Ben but not behind Jo": a conjunction before a phrase with its own cue joins the two relations
      const cueAhead = unit.type === 'cue' ? i : unit.type === 'negation' && next?.type === 'cue' ? i + 1 : -1
      if (context.open !== false && cueAhead >= 0 && lastRelation && !pendingCue && region[cueAhead + 1]?.type === 'entity' &&
          pendingJoin.some(joiner => joiner.type === 'conjunction')) {
        relationJoin = {with: lastRelation, joiners: pendingJoin}
        pendingJoin = []
      }
      settle()
      // "with only the first item checked": the word that grades the phrase goes to the clause; the linking word still
      // points at the thing after it
      if (pendingCue && unit.type === 'adverb' && unit.first === unit.last && next?.type === 'entity' && pendingCue.last + 1 === unit.first) { put(target, 'adverb', unit.first, unit.last); continue }
      if (pendingCue) {
        // a cue with nothing to point at moves with the verb
        put(target, verb ? 'particle' : 'adverb', pendingCue.first, pendingCue.last)
        pendingCue = null
      }
      // "after Thanks": a word that can link a clause or a thing links the thing that follows it when no verb does
      if (context.open !== false && unit.type === 'marker' && unit.first === unit.last && next?.type === 'entity' && lexicon.canBe(word(unit), 'cue')) pendingCue = unit
      else if (unit.type === 'cue') {
        // "sort out the text size": the word moves with the verb and the thing after it is what the verb acts on. Not so
        // after a form of "be", which acts on nothing, nor where the clause already has what is asked about in front
        // ("what meetings do I have on Monday"): there the word links.
        const moves = verb && !objects.length && !clause.asked && !has(target, 'direct_object') && i === 0 && unit.first === unit.last && unit.first > verb.predicate[0] &&
          context.linkOf(clause.predicate) !== 'predicative' && lexicon.phrasal(clause.predicate, tokens[unit.first].word) &&
          // a word that links things as readily as it follows verbs ("focus on the event") moves with the verb only when
          // the pair was seen with its object between the two words ("turn the legend on")
          (!lexicon.linksThings || !lexicon.linksThings(tokens[unit.first].word) || lexicon.separable(clause.predicate, tokens[unit.first].word))
        if (moves && next?.type === 'entity') put(target, 'particle', unit.first, unit.last)      // "sort out the text size"
        // ("with only the first item": a lone word between the linking word and its thing grades the phrase)
        else if (next?.type === 'entity' || next?.type === 'adverb' && next.first === next.last && region[i + 2]?.type === 'entity') pendingCue = unit
        else put(target, verb && (i === 0 || region[i - 1].type === 'entity' && objects.length === 1) ? 'particle' : 'adverb', unit.first, unit.last)
      } else if (unit.type === 'adverb') {
        const moves = verb && context.linkOf(word(unit)) === 'particle' && !has(target, 'particle') &&
          (i === 0 || region[i - 1].type === 'entity' && objects.length === 1 && lastEntity === objects[0])
        if (next?.type === 'cue' && region[i + 2]?.type === 'entity' && i > 0 && !moves) adverbForCue = unit
        else put(target, moves ? 'particle' : 'adverb', unit.first, unit.last)
      } else if (unit.type === 'complement' && context.open !== false && predicative && clause.question && clause.subject && !objects.length &&
                 unit.value[0] === unit.value[1] && !unit.degree.length && !lexicon.saysHow(tokens[unit.value[0]].word)) {
        // "what colour is castle": a bare word after "be" that is not known to say how things are names the thing asked about
        doubts.push({position: unit.value[0], not: 'quality'})
        put(target, 'result_complement', ...unit.value)
      } else if (unit.type === 'complement' && context.open !== false && verb && i === 0 && !objects.length && !predicative && unit.value[0] === unit.value[1] &&
                 !unit.degree.length && tokens[unit.value[0]].shape === 'lower' && lexicon.gives(clause.predicate) && !lexicon.takesQuality(clause.predicate) &&
                 !lexicon.saysHow(tokens[unit.value[0]].word)) {
        // "give neon around the kites": a verb that takes a thing and has none takes the bare word after it
        doubts.push({position: unit.value[0], not: 'quality'})
        put(target, 'result_complement', ...unit.value)
      } else if (unit.type === 'complement' && context.open !== false && acts && objects.length <= 1 && unit.value[0] === unit.value[1] && !unit.degree.length &&
                 lexicon.names(clause.predicate) && (objects.length === 1 || verb?.form === 'past') && tokens[unit.value[0]].shape === 'lower') {
        // "call it robot", "a square called park": what a naming verb gives is a name, a thing
        doubts.push({position: unit.value[0], not: 'quality'})
        put(target, 'result_complement', ...unit.value)
      } else if (unit.type === 'complement') {
        for (const position of unit.degree) put(target, 'degree', position)
        // a quality right after a thing that the verb does not hold describes that thing ("with outline gold")
        const ofClause = lastEntity && (objects.includes(lastEntity) || lastEntity.group && objects.some(other => other.group === lastEntity.group))
        // a verb that takes a quality claims the quality that closes its clause ("do the dots on the line wider")
        const wanted = acts && lexicon.takesQuality(tokens[acts.predicate[0]].word) && !has(target, 'result_complement')
        if ((!acts || context.open !== false && !ofClause && !wanted) && lastEntity && region[i - 1] === lastEntity && !unit.degree.length && !lastEntity.pronoun) {
          for (let position = unit.value[0]; position <= unit.value[1]; position++) put(entityWire(lastEntity), 'modifier', position)
        } else if (!acts || has(target, 'result_complement')) put(target, 'adverb', ...unit.value)
        else { put(target, 'result_complement', ...unit.value); tail = objects.length ? 'quality' : null }
      } else if (unit.type === 'expression') {
        // a detached expression is an act of its own: it gets its own clause
        const own = clause.fragment && !has(target, 'expression') && !has(target, 'topic') ? target : wire('c', 'nlu.clause')
        if (own !== target) own.slots.push(['form', 'fragment'])
        put(own, 'expression', unit.first, unit.last)
        const act = context.kindOf('clause', tokens[unit.last].word)
        if (act) own.slots.push(['speech_act', act])
        if (own !== target && region[i - 1]?.type === 'separator' && target.slots.at(-1)?.[0] === 'separator') own.slots.push(target.slots.pop())
      } else if (unit.type === 'filler') put(target, 'filler', unit.first, unit.last)
      // "black, not grey": after a break, a negation with a thing or a quality is a part of its own that shares the verb
      else if (unit.type === 'negation' && context.open !== false && acts && region[i - 1]?.type === 'separator' && ['complement', 'entity'].includes(next?.type)) {
        const host = clause.gapOf ?? clause
        const fragment = fragmentClause()
        fragment.gapOf = host
        fragment.predicate = host.predicate
        fragment.wire.shares = host.wire.id
        put(fragment.wire, 'negation', unit.first, unit.last)
        opened.push(fragment, ...fill(fragment, region.slice(i + 1)))
        state.lastEntity = lastEntity
        state.tail = tail
        return opened
      }
      // "not behind Jo": a negation right before a phrase with a cue negates that relation alone
      else if (unit.type === 'negation' && context.open !== false && next?.type === 'cue' && region[i + 2]?.type === 'entity') relationNegation = unit
      else if (unit.type === 'negation') put(target, 'negation', unit.first, unit.last)
      else if (unit.type === 'marker' || unit.type === 'question') put(target, has(target, unit.type) ? 'unresolved' : unit.type, unit.first, unit.last)
      else put(target, 'unresolved', unit.first, unit.last)
    }
    if (pendingCue) put(target, verb ? 'particle' : 'adverb', pendingCue.first, pendingCue.last)
    settle()
    state.lastEntity = lastEntity
    state.tail = tail
    return opened
  }

  function relate(from, cue, to, adverb) {
    const relation = wire('r', 'nlu.relation')
    const surface = cue.first === cue.last ? tokens[cue.first].word.toLowerCase() : text.slice(tokens[cue.first].start, tokens[cue.last].end).toLowerCase()
    relation.slots.push(['kind', surface.replace(/[^\p{L}\p{N}]+/gu, '_')], ['from', from ? '$' + from.id : null], ['to', '$' + to.id])
    put(relation, 'cue', cue.first, cue.last)
    if (adverb) put(relation, 'adverb', adverb.first, adverb.last)
    return relation
  }

  // Where a relation starts: at the clause or at the entity just before the cue.
  function attach(relation, clause, entity, cue, target) {
    const slot = relation.slots.find(entry => entry[0] === 'from')
    // "from largest to smallest": the second cue of a pair starts where the first did
    const opener = context.pairOf(tokens[cue.last].word)
    if (opener && entity?.via?.cue === opener) { slot[1] = entity.via.from; relation.cueWord = tokens[cue.last].word; target.via = {cue: tokens[cue.last].word, from: slot[1]}; return }
    const done = () => { target.via = {cue: tokens[cue.last].word, from: slot[1]} }
    const toClause = '$' + clause.wire.id
    if (!entity || entity.pronoun) { slot[1] = toClause; done(); return }
    const toEntity = '$' + entityWire(entity).id
    // "the level of Intro": the cue says what the thing before it is of
    if (context.open !== false && context.linkOf(tokens[cue.last].word) === 'belongs') { slot[1] = toEntity; done(); return }
    if (clause.fragment && !clause.gapOf) {
      let best = entity, bestScore = -Infinity
      const seen = new Set()
      if (context.hosts !== false) for (let thing = entity; thing && !thing.pronoun && !seen.has(thing) && seen.size < 4; thing = thing.placedBy) {
        seen.add(thing)
        const score = context.holds('thing', headWord(thing), tokens[cue.last].word, headWord(target)) - 0.3 * (seen.size - 1)
        if (score > bestScore) { bestScore = score; best = thing }
      }
      slot[1] = '$' + entityWire(best).id
      relation.host = best
      done()
      return
    }
    // "240 by 160": a number placed against a number is one measure
    if (entity.literal && target.literal) { slot[1] = toEntity; done(); return }
    const cueWord = tokens[cue.last].word, aim = headWord(target)
    if (context.hosts === false) {
      const score = context.attach(clause.predicate, headWord(entity), cueWord, aim)
      const id = decisions.length
      decisions.push({id, margin: Math.abs(score), cue: cueWord})
      slot[1] = (score >= 0) !== flips.has(id) ? toClause : toEntity
      done()
      return
    }
    // Every open host competes: the clause, the thing before the cue, and the things that one
    // is itself placed by ("a boy with a happy face next to the table": face, then boy).
    const hosts = [{ref: toClause, score: context.holds('verb', clause.predicate, cueWord, aim)}]
    const seen = new Set()
    for (let thing = entity; thing && !thing.pronoun && !seen.has(thing) && seen.size < 4; thing = thing.placedBy) {
      seen.add(thing)
      const key = headWord(thing)
      if (key) hosts.push({ref: '$' + entityWire(thing).id, score: context.holds('thing', key, cueWord, aim)})
    }
    hosts.sort((a, b) => b.score - a.score)
    // When the evidence does not separate the hosts, the relation is held by the clause and the
    // choice is left open: it places the action or describes one of the clause's things.
    if (context.open !== false && hosts.length > 1 && hosts[0].score - hosts[1].score < context.openBelow) {
      slot[1] = toClause
      relation.slots.push(['attachment', 'open'])
      done()
      return
    }
    const id = decisions.length
    decisions.push({id, margin: hosts.length > 1 ? hosts[0].score - hosts[1].score : Infinity, cue: cueWord})
    slot[1] = (flips.has(id) && hosts[1] ? hosts[1] : hosts[0]).ref
    done()
  }

  // Which earlier entity a new one is listed with: the one most like it, the nearest on a tie.
  function partner(entity, frontier) {
    // "items Plan and Review": a bare name is listed with the name that stands right before the joining word
    const last = frontier.at(-1)
    if (last && entity.name && !entity.head && !entity.determiner?.length && ['capital', 'upper'].includes(tokens[last.last].shape) && last.last < entity.first) return last
    const candidates = frontier.filter((candidate, order, list) => !(candidate.group && candidate !== list.at(-1) && list.slice(order + 1).some(later => later.group === candidate.group)))
    const scored = candidates.map((candidate, order) => ({candidate, score: context.alike(tokens, candidate, entity) + 0.02 * order / frontier.length}))
    const nearest = scored.at(-1), best = scored.reduce((a, b) => b.score >= a.score ? b : a)
    if (context.open === false) return best.candidate
    // Things listed together are introduced alike ("with title Plan and participants Ana": two bare nouns). When the
    // nearest candidate, or the list it stands in, is introduced like the new thing and the one most like it in
    // meaning is not, the nearest is the partner.
    const introduced = thing => context.opener(tokens, thing)
    const opensAlike = ({candidate}) => [candidate, ...frontier.filter(other => candidate.group && other.group === candidate.group)].some(thing => introduced(thing) === introduced(entity))
    if (best !== nearest && opensAlike(nearest) && !opensAlike(best)) return nearest.candidate
    // a thing with its own determiner that is unlike everything before it is no further end of a phrase ("at 10:00
    // and the room to Cedar room"): it is one more of what the clause is about
    if (best.score < UNLIKE && entity.determiner?.length && nearest.candidate.phrase) return (scored.findLast(({candidate}) => !candidate.phrase) ?? nearest).candidate
    // otherwise the one most like the new thing in meaning and build, the nearest on a tie
    return best.candidate
  }

  // "a blanket, a basket and a boy": the entities share the role of the first.
  function coordinate(left, right, joiners) {
    const made = entityWire(right)
    let join = left.group
    if (!join) {
      join = left.group = wire('k', 'nlu.coordination')
      join.slots.push(['kind', null], ['member', '$' + entityWire(left).id])
      if (left.holder) left.holder[1] = '$' + join.id
    }
    right.group = join
    join.slots.push(['member', '$' + made.id])
    for (const joiner of joiners) put(join, 'cue', joiner.first, joiner.last)
    const named = joiners.findLast(joiner => joiner.type === 'conjunction') ?? joiners.at(-1)
    join.slots[0][1] = context.kindOf('coordination', tokens[named.last].word)
  }
}
