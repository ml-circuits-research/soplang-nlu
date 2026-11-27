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
  const put = (target, key, first, last = first) => target.slots.push([key, span(first, last)])
  const has = (target, key) => target.slots.some(slot => slot[0] === key)
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
  for (const sentence of sentences) if (sentence.length) linkSentence(sentence)
  return {wires, decisions, doubts}

  function linkSentence(all) {
    const terminator = all.at(-1).type === 'terminator' ? all.at(-1) : null
    const list = terminator ? all.slice(0, -1) : all

    // A helping verb that stands before the subject joins its verb; one with no verb is the verb.
    for (let i = 0; i < list.length; i++) {
      const unit = list[i]
      const helping = unit.type === 'aux' || unit.type === 'verb' && !unit.auxiliary.length && !unit.form &&
        lexicon.canBe(tokens[unit.predicate[0]].word, 'auxiliary') &&
        (list[i + 1]?.pronoun || list[i - 1]?.type === 'question' || list[i - 2]?.type === 'question')
      if (!helping) continue
      const own = unit.type === 'aux' ? unit.auxiliary : [unit.predicate[0]]
      let k = i + 1
      if (list[k]?.type === 'entity') {
        k++
        while (['adverb', 'filler', 'negation'].includes(list[k]?.type)) k++
        if (list[k]?.type === 'verb' && list[k] !== unit) {
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
    }

    // ---- what each verb is to its neighbours, and where its clause starts
    const clauses = []
    for (let i = 0; i < list.length; i++) {
      const verb = list[i]
      if (verb.type !== 'verb') continue
      const previous = list[i - 1], bare = !verb.auxiliary.length
      const clause = {verb, index: i, start: i, pre: [], role: 'main', predicate: tokens[verb.predicate[0]].word}
      if (previous?.type === 'marker' && context.linkOf(word(previous)) === 'infinitive') {
        clause.role = 'infinitive'
        clause.marker = previous
        clause.start = i - 1
        if (list[i - 2]?.type === 'entity' && list[i - 3]?.type === 'verb') { clause.subject = list[i - 2]; clause.start = i - 2 }
      } else if (previous?.type === 'entity' && bare && verb.form && !(verb.form === 'past' && opensClause(list, i - 1))) {
        clause.role = 'modifier'
        clause.modifies = previous
      } else if (previous?.type === 'separator' && bare && verb.form && clauses.some(other => other.role === 'main')) {
        clause.role = 'modifier'
        clause.modifiesHost = true
        clause.separator = previous
        clause.start = i - 1
      } else if (previous?.type === 'entity' && bare && !verb.form && list[i - 2]?.type === 'verb' &&
                 lexicon.takesClause(tokens[list[i - 2].predicate[0]].word)) {
        clause.role = 'complement'
        clause.subject = previous
      } else {
        scanLeft(clause, i)
        // a bare verb right after another verb's object, with nothing to introduce it and no
        // subject of its own, cannot be placed: the word was probably not a verb
        const stranded = bare && !verb.form && !clause.subject && !clause.marker && !clause.conjunction && !clause.separator &&
          previous?.type === 'entity' && !previous.pronoun && clauses.length && list.slice(clauses.at(-1).index + 1, i).every(unit => unit.type === 'entity' || unit.type === 'cue')
        if (stranded && lexicon.thingFirst(clause.predicate)) doubts.push({position: verb.predicate[0], not: 'verb'})
        else if (stranded && list[i - 2]?.type === 'verb') {
          // "make the chart show its gridlines": the thing before it is the one that does it
          clause.role = 'complement'
          clause.subject = previous
          clause.start = i
        }
      }
      clauses.push(clause)
    }
    clauses.forEach((clause, k) => { if (k && clause.start <= clauses[k - 1].index) clause.start = clauses[k - 1].index + 1 })

    // ---- clause wires
    const made = []
    const leading = list.slice(0, clauses.length ? clauses[0].start : list.length)
    const strays = []
    const polite = clauses.length ? leading.filter(unit => unit.type === 'filler') : []
    if (leading.some(unit => !['separator', 'absorbed', 'filler'].includes(unit.type)) || leading.length && !clauses.length) {
      const fragment = fragmentClause()
      made.push(fragment, ...fill(fragment, leading))
      polite.length = 0
    } else strays.push(...leading.filter(unit => unit.type === 'separator'))
    clauses.forEach((clause, k) => {
      const verb = clause.verb
      const end = k + 1 < clauses.length ? clauses[k + 1].start : list.length
      let region = list.slice(clause.index + 1, end), returned = []
      if (clause.role === 'modifier') {
        // what a participle says about a thing ends at the next separator; the list it stood in goes on
        const cut = clause.modifiesHost ? -1 : region.findIndex(unit => unit.type === 'separator')
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
      const asks = Boolean(question || verb.inverted) || last && terminator && /\?/u.test(text.slice(tokens[terminator.first].start, tokens[terminator.last].end)) && clause.role === 'main'
      const form = clause.role !== 'main' ? 'nonfinite'
        : asks ? 'interrogative'
        : clause.subject ? 'declarative'
        : verb.form === 'progressive' && !verb.auxiliary.length ? 'nonfinite' : 'imperative'
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
        // hangs on the clause that follows it
        const fronted = clause.role === 'main' && !made.some(other => other.fragment || other.role === 'main') && !relative &&
          clause.marker.type === 'marker' && clauses.slice(k + 1).some(other => other.role === 'main' && !other.marker)
        if (joins) clause.joinedBy = clause.marker
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
      if (clause.subject) target.slots.push(['subject', '$' + entityWire(clause.subject).id])
      for (const [cue, entity, from] of clause.chain ?? []) relate(entityWire(from), cue, entityWire(entity))
      // "Please, create …": a courtesy word before the first clause belongs to it
      while (polite.length) { const unit = polite.shift(); put(target, 'filler', unit.first, unit.last) }
      made.push(clause, ...fill(clause, region))
      if (returned.length) made.push(...fill(clause.returnTo, returned))
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
          // ", coloured by region": the thing the clause before it is about
          const thing = before?.state?.objects[0] ?? before?.subject
          if (clause.separator) put((before ?? clause).wire, 'separator', clause.separator.first, clause.separator.last)
          if (!thing) return
          clause.modifies = thing
        }
        let described = clause.modifies
        const placed = described.placedBy
        if (placed && !placed.pronoun && placed !== described &&
            context.describes(clause.predicate, headWord(placed)) >= context.describes(clause.predicate, headWord(described))) described = placed
        const relation = wire('r', 'nlu.relation')
        relation.slots.push(['kind', context.kindOf('relation', null)], ['from', '$' + entityWire(described).id], ['to', '$' + clause.wire.id])
        return
      }
      if (clause.role === 'infinitive' || clause.role === 'complement') {
        const governor = made.slice(0, k).findLast(other => !other.fragment)
        if (governor) governor.wire.slots.push(['clausal_complement', '$' + clause.wire.id])
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
        const relation = relate(before.wire, clause.joinedBy, clause.wire)
        relation.slots[0][1] = context.kindOf('relation', word(clause.joinedBy)) ?? relation.slots[0][1]
        return
      }
      if (clause.marker && clause.role === 'main' && before) {
        if (clause.after?.type === 'entity') {
          const relation = wire('r', 'nlu.relation')
          relation.slots.push(['kind', context.kindOf('relation', null)], ['from', '$' + entityWire(clause.after).id], ['to', '$' + clause.wire.id])
        } else if (clause.after?.type === 'verb' && !before.fragment) before.wire.slots.push(['clausal_complement', '$' + clause.wire.id])
        return
      }
      if (clause.conjunction && before) {
        // "A, B, and C": clauses that only commas separate join the same coordination
        const cue = clause.conjunction
        const join = wire('k', 'nlu.coordination')
        const members = [before], cues = []
        for (let current = before; current.commaOnly && !current.commaUsed;) {
          const earlier = made.slice(0, made.indexOf(current)).findLast(other => other.fragment || other.role === 'main')
          if (!earlier || earlier.fragment || !context.kindOf('coordination', word(current.commaOnly), true)) break
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
      if (clause.commaOnly && !clause.commaUsed) put(clause.commaHost.wire, 'separator', clause.commaOnly.first, clause.commaOnly.last)
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
          if (before?.type === 'entity' && !chain.length && unit.pronoun && !before.pronoun) {
            // "the positions they began in": a clause that says which thing is meant
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
        const joinable = pendingJoin.length && lastEntity && !pendingCue &&
          pendingJoin.every(joiner => context.kindOf('coordination', tokens[joiner.last].word, true))
        if (pendingCue) {
          settle()
          const relation = relate(null, pendingCue, made, adverbForCue)
          attach(relation, clause, lastEntity, pendingCue, unit)
          // the thing this one is placed by: the entity the relation starts at, or the clause's own thing
          unit.placedBy = relation.slots.find(slot => slot[0] === 'from')[1] === '$' + target.id ? objects[0] ?? clause.subject : lastEntity
          tail = relation.slots.find(slot => slot[0] === 'from')[1] === '$' + target.id ? 'held' : null
          pendingCue = null
          adverbForCue = null
          unit.holder = relation.slots.find(slot => slot[0] === 'to')
        } else if (joinable) {
          coordinate(partner(unit, frontier), unit, pendingJoin)
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
            : predicative ? (objects.length || clause.subject ? 'predicative_entity' : 'subject')
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
          if (recipient) {
            // "give me a hand": the person comes first, the thing given second
            objects[0].holder[0] = 'indirect_object'
            role('direct_object', unit)
          } else if (key && !has(target, key)) role(key, unit)
          else {
            // one bare entity more than the clause has places for stands beside the one before
            const relation = wire('r', 'nlu.relation')
            relation.slots.push(['kind', 'apposition'], ['from', '$' + entityWire(objects.at(-1) ?? unit).id], ['to', '$' + made.id])
            unit.holder = relation.slots[2]
          }
          objects.push(unit)
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
        if (unit.type === 'conjunction' && context.joinsClauses(word(unit)) && rest.some(other => other.type !== 'separator') && !pendingCue) {
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
      settle()
      if (pendingCue) {
        // a cue with nothing to point at moves with the verb
        put(target, verb ? 'particle' : 'adverb', pendingCue.first, pendingCue.last)
        pendingCue = null
      }
      if (unit.type === 'cue') {
        const moves = verb && !objects.length && i === 0 && unit.first === unit.last && lexicon.phrasal(clause.predicate, tokens[unit.first].word)
        if (moves && next?.type === 'entity') put(target, 'particle', unit.first, unit.last)      // "sort out the text size"
        else if (next?.type === 'entity') pendingCue = unit
        else put(target, verb && (i === 0 || region[i - 1].type === 'entity' && objects.length === 1) ? 'particle' : 'adverb', unit.first, unit.last)
      } else if (unit.type === 'adverb') {
        const moves = verb && context.linkOf(word(unit)) === 'particle' && !has(target, 'particle') &&
          (i === 0 || region[i - 1].type === 'entity' && objects.length === 1 && lastEntity === objects[0])
        if (next?.type === 'cue' && region[i + 2]?.type === 'entity' && i > 0 && !moves) adverbForCue = unit
        else put(target, moves ? 'particle' : 'adverb', unit.first, unit.last)
      } else if (unit.type === 'complement') {
        for (const position of unit.degree) put(target, 'degree', position)
        if (!acts || has(target, 'result_complement')) put(target, 'adverb', ...unit.value)
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
    const toClause = '$' + clause.wire.id
    if (!entity || entity.pronoun) { slot[1] = toClause; return }
    const toEntity = '$' + entityWire(entity).id
    if (clause.fragment && !clause.gapOf) { slot[1] = toEntity; return }
    // "240 by 160": a number placed against a number is one measure
    if (entity.literal && target.literal) { slot[1] = toEntity; return }
    const score = context.attach(clause.predicate, headWord(entity), tokens[cue.last].word, headWord(target))
    const id = decisions.length
    decisions.push({id, margin: Math.abs(score), cue: tokens[cue.last].word})
    slot[1] = (score >= 0) !== flips.has(id) ? toClause : toEntity
  }

  // Which earlier entity a new one is listed with: the one most like it, the nearest on a tie.
  function partner(entity, frontier) {
    let best = frontier.at(-1), bestScore = -Infinity
    frontier.forEach((candidate, order) => {
      if (candidate.group && candidate !== frontier.at(-1) && frontier.slice(order + 1).some(later => later.group === candidate.group)) return
      const score = context.alike(tokens, candidate, entity) + 0.02 * order / frontier.length
      if (score > bestScore) { bestScore = score; best = candidate }
    })
    return best
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
