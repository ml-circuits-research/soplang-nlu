// Corrections to a dependency parse, made before it is written as a circuit.
//
// A parser trained on edited prose reads a run of short requests ("set the axis, that's the
// tweak; then drop the legend") as one sentence and hangs each clause on the next as its
// complement or its adverbial clause. Each rule below states a fact of English clause syntax,
// checks it on the parser's own tags and relations, and relabels or moves the arc. The only words a
// rule names are function words: the linking words "then", "next" and "so", the articles "a" and "an",
// the negative determiner "no", and the "to" of an infinitive. A
// relabelled clause is `parataxis`: set side by side with the other.
const STRONG = /^[;:—–.!?]+$/u
const SUBJECT = new Set(['nsubj', 'nsubjpass', 'expl', 'csubj', 'csubjpass'])
// the relations that hang a clause on a verb, and those that hang it on a noun
const HUNG = new Set(['ccomp', 'xcomp', 'advcl'])
const DESCRIBING = new Set(['acl', 'relcl'])
// the marks after which a conjunction opens a clause
const CLAUSE_MARK = /^[,;:—–-]+$/u

/**
 * @param units the units of `unitsOf` (strategies/neural-dependencies/syntax-circuit.mjs);
 * their `head` and `dep` are corrected in place.
 * @returns the number of arcs changed
 */
export function repairClauses(units) {
  const under = unit => units.filter(part => part.head === unit.index && part !== unit && part.word)
  const verbal = unit => Boolean(unit.word) && !unit.quoted && (unit.pos === 'VERB' || unit.pos === 'AUX')
  const subjectOf = unit => under(unit).find(part => SUBJECT.has(part.dep))
  const auxiliaries = unit => under(unit).filter(part => (part.dep === 'aux' || part.dep === 'auxpass') && part.lower !== 'to')
  // introduced as a dependent clause: by a subordinator, by the "to" of an infinitive, or by a question or relative word
  const introduced = unit => under(unit).some(part => part.dep === 'mark' || part.lower === 'to' && part.dep === 'aux' ||
    part.index < unit.index && /^W/u.test(part.tag))
  const between = (a, b) => units.slice(Math.min(a.index, b.index) + 1, Math.max(a.index, b.index))
  const strong = (a, b) => between(a, b).some(mark => !mark.word && STRONG.test(mark.value))
  const set = (a, b) => between(a, b).some(mark => !mark.word && (mark.value === ',' || STRONG.test(mark.value)))
  // a verb form that can make a sentence by itself: finite, or a base form with no "to"
  const sentential = unit => !['VBG', 'VBN'].includes(unit.tag) || auxiliaries(unit).length > 0
  // a command or an inverted question takes no clause in front of it as its complement
  const directive = unit => {
    const subject = subjectOf(unit)
    if (!subject) return unit.tag === 'VB' || unit.tag === 'VBP'
    return auxiliaries(unit).some(part => part.index < subject.index) || unit.pos === 'AUX' && unit.index < subject.index
  }
  let changed = 0
  const firstWord = (unit, depth = 0) => depth > 60 ? unit.index : Math.min(unit.index, ...under(unit).map(part => firstWord(part, depth + 1)))
  const first = (unit, depth = 0) => depth > 60 ? unit.index : Math.min(unit.index, ...under(unit).map(part => first(part, depth + 1)))
  const last = (unit, depth = 0) => depth > 60 ? unit.index : Math.max(unit.index, ...under(unit).map(part => last(part, depth + 1)))
  // does a unit hang on another, directly or not?
  const within = (unit, top) => {
    for (let at = unit, steps = 0; steps <= units.length; steps++) {
      if (at === top) return true
      if (at.head === at.index) return false
      at = units[at.head]
    }
    return false
  }

  // 0. A word that joins two clauses stands at the head of the second. "so" after a punctuation mark,
  //    followed directly by the words of a clause, opens that clause, whatever later verb the parser
  //    hung it on: in "…, only with how it reads at a glance, so as a first pass rename the rent series,
  //    then we revisit next week, could you also show the percentages" it opens "rename", not "show".
  //    The clause it opens hangs on the clause before the mark, by "so"; the later clause, left with no
  //    word that subordinates it, stands beside the clause it was hung on.
  for (const so of units) {
    if (!so.word || so.lower !== 'so' || !['mark', 'cc', 'advmod'].includes(so.dep) || under(so).length) continue
    const mark = units[so.index - 1], held = units[so.head]
    if (!mark || mark.word || !/^[,;:—–-]+$/u.test(mark.value) || !units[mark.index - 1]?.word) continue
    // (a clause of its own: no auxiliary of another verb, no gerund that is a subject, "so anchoring it keeps…")
    const opened = units.find(other => verbal(other) && other !== held && firstWord(other) === so.index + 1 && sentential(other) &&
      !['aux', 'auxpass', 'amod', 'compound', ...SUBJECT].includes(other.dep))
    if (!opened || held.word && held.index < opened.index) continue
    // the clause before the mark: the highest word above the last word before it that still stands before it
    let before = units[mark.index - 1]
    for (let steps = 0; before.head !== before.index && units[before.head].index < mark.index && steps < units.length; steps++) before = units[before.head]
    if (!verbal(before) || before === opened) continue
    so.head = opened.index
    so.dep = 'mark'
    opened.head = before.index
    opened.dep = 'advcl'
    if (held.word && held.head === before.index && HUNG.has(held.dep)) held.dep = 'parataxis'
    changed++
  }

  //    "so" after a punctuation mark, at the head of a clause, joins that clause to what stands before
  //    as its result: "nudge the barn next to the tree, so the view stays open", "it is a hierarchy, so
  //    lay out the diagram". The parser may read it as an adverb of the second clause and hang the first
  //    clause on the second; the first is then the main one, and "so" marks the second, hung on it.
  //    (First, since the rules below read the subordinators it sets.)
  //    The parser may also hang "so" by no named relation ("…, so could you turn Survey results into a doughnut
  //    chart?"). And a word it could not place that opens the sentence before the first clause, both hung on the
  //    clause of "so", heads that first clause: in "what if we put a tall tree in front of the stone house, so it
  //    is the first thing seen" the clause of "if" hangs on "what", and the clause of "so" on the clause of "if".
  for (const so of units) {
    if (!so.word || so.lower !== 'so' || !['advmod', 'dep'].includes(so.dep) || under(so).length) continue
    const mark = units[so.index - 1], verb = units[so.head]
    if (!mark || mark.word || !/^[,;:—–-]+$/u.test(mark.value) || !verbal(verb) || verb.index < so.index) continue
    const before = under(verb).filter(part => part.index < mark.index)
    if (verb.head === verb.index) {
      const opening = before.length === 2 && before[0].dep === 'dep' && before[0] === units.find(unit => unit.word) && !under(before[0]).length &&
        verbal(before[1]) && ['advcl', 'ccomp'].includes(before[1].dep) ? before[0] : null
      if (opening) {
        const [, clause] = before
        opening.head = opening.index
        opening.dep = 'ROOT'
        clause.head = opening.index
        verb.head = clause.index
        verb.dep = 'advcl'
        so.dep = 'mark'
        changed++
        continue
      }
      if (before.length !== 1) continue
      const [earlier] = before
      earlier.head = earlier.index
      earlier.dep = 'ROOT'
      // an adjective with a determiner and no noun to describe stands for a thing ("the same for a bush")
      if (earlier.pos === 'ADJ' && under(earlier).some(part => part.dep === 'det')) earlier.pos = 'NOUN'
      verb.head = earlier.index
      verb.dep = 'advcl'
    } else if (before.length) continue
    so.dep = 'mark'
    changed++
  }

  //    "so" that opens a sentence, before a clause with a subject of its own that a comma sets off in front of a
  //    command, says what the command is for: "so it looks windy, spin the crown on the tree", "so they look at each
  //    other, make that girl face right", "so I can edit the right connection, pick arrow a1". It marks the fronted
  //    clause, which hangs on the command as its adverbial clause, whichever of the two the parser hung on the other.
  //    (What a command is for is still to come: a clause in the past tense says why, "so the review step became
  //    approval, update the list", and is left alone.)
  //    "so" that opens a message right before a command joins nothing: a word said to the listener ("so straighten
  //    it"), as "And", "Then" or "So" at the start of a message.
  const opensMessage = unit => !units.slice(0, unit.index).some(other => other.word && other.pos !== 'INTJ' && other.dep !== 'intj')
  const command = unit => verbal(unit) && unit.tag === 'VB' && !subjectOf(unit) && !auxiliaries(unit).length && !introduced(unit)
  for (const so of units) {
    if (!so.word || so.lower !== 'so' || under(so).length || !['advmod', 'cc', 'mark', 'dep'].includes(so.dep)) continue
    const mark = units[so.index - 1]
    if (!opensMessage(so) && !(mark && !mark.word && STRONG.test(mark.value))) continue
    const next = units[so.index + 1], held = units[so.head]
    if (opensMessage(so) && next === held && command(held)) {
      so.dep = 'intj'
      changed++
      continue
    }
    const subject = units.find(unit => unit.word && SUBJECT.has(unit.dep) && first(unit) === so.index + 1)
    const clause = subject && units[subject.head]
    if (!clause || !verbal(clause) || clause.index < subject.index || !sentential(clause) || under(clause).some(part => part.dep === 'mark') ||
      [clause, ...auxiliaries(clause)].some(verb => verb.tag === 'VBD')) continue
    // the comma that ends the clause, and the command right after it
    const comma = units.find(unit => !unit.word && unit.value === ',' && unit.index > clause.index)
    const after = comma && units[comma.index + 1]
    const commanding = !after?.word ? null : command(after) ? after : after.head > after.index && command(units[after.head]) ? units[after.head] : null
    if (!commanding || commanding.head !== clause.index && clause.head !== commanding.index || units.slice(so.index + 1, comma.index).some(unit => unit.word && unit !== clause && !within(unit, clause)) ||
      units.slice(so.index, comma.index).some(unit => !unit.word && STRONG.test(unit.value))) continue
    if (commanding.head === clause.index) {
      const top = clause.head === clause.index
      commanding.head = top ? commanding.index : clause.head
      commanding.dep = top ? 'ROOT' : clause.dep
      for (const part of under(clause)) if (part.index > comma.index && part !== commanding) part.head = commanding.index
      clause.head = commanding.index
    }
    clause.dep = 'advcl'
    so.head = clause.index
    so.dep = 'mark'
    changed++
  }

  for (const unit of units) {
    if (!verbal(unit) || unit.head === unit.index || !HUNG.has(unit.dep) && !DESCRIBING.has(unit.dep)) continue
    const governor = units[unit.head]
    if (introduced(unit) || !sentential(unit)) continue
    // 1. A dependent clause has a subordinator, a relative word, a participle or an infinitive
    //    marker. A base form with none of these and no subject, set off by punctuation from the
    //    word it is hung on, is a command of its own ("a tiny bird near the top, then show a boy").
    const command = set(unit, governor) && !subjectOf(unit) && !auxiliaries(unit).length && (unit.tag === 'VB' || unit.tag === 'VBP')
    if (command) { unit.dep = 'parataxis'; changed++; continue }
    if (!verbal(governor) || !HUNG.has(unit.dep)) continue
    // 2. A semicolon, colon, dash or full stop ends a clause: a clause the parser hung across one,
    //    with no word that subordinates it, stands by itself.
    const acrossStrong = strong(unit, governor)
    // 3. A complement clause follows its verb. A finite clause with its own subject, set off by a
    //    comma in front of a command or an inverted question, is a statement of its own.
    const frontedStatement = unit.index < governor.index && set(unit, governor) && Boolean(subjectOf(unit)) && directive(governor)
    if (acrossStrong || frontedStatement) { unit.dep = 'parataxis'; changed++ }
  }

  //    So does a group of words with no verb that the parser hung across such a mark on a verb after it as the clause
  //    that completes it: "how about a poodle instead? — go on" is a question, then a command.
  for (const unit of units) {
    if (!unit.word || verbal(unit) || !['ccomp', 'xcomp', 'advcl'].includes(unit.dep) || unit.head < unit.index || !verbal(units[unit.head])) continue
    if (!units.slice(last(unit) + 1, unit.head).some(mark => !mark.word && STRONG.test(mark.value))) continue
    unit.head = unit.index
    unit.dep = 'ROOT'
    changed++
  }

  // 4. Only a main clause puts an auxiliary before its subject: "is anything overlapping the house?"
  //    is a question. A clause so inverted that the parser hung across a punctuation mark on a word
  //    before it, as a clause that completes or describes that word, is a question of its own.
  //    A subordinator keeps the order of a statement too: one before such an inverted clause that the
  //    parser hung on a verb before it as an adverbial clause joins the question to what stands before
  //    ("…, so could you also drop the legend"). With no subordinator an inverted adverbial clause is a
  //    condition ("should you need it, …") and is left alone.
  for (const unit of units) {
    if (!verbal(unit) || unit.head === unit.index || !['ccomp', 'xcomp', 'acl', 'relcl', 'advcl'].includes(unit.dep)) continue
    const governor = units[unit.head], subject = subjectOf(unit)
    if (governor.index > unit.index || !set(unit, governor) || !subject) continue
    const inverted = auxiliaries(unit).filter(part => part.index < subject.index)
    if (!inverted.length) continue
    const marks = under(unit).filter(part => part.dep === 'mark' && part.index < inverted[0].index)
    if (unit.dep === 'advcl' && !marks.length) continue
    for (const mark of marks) mark.dep = 'cc'
    unit.dep = 'parataxis'
    changed++
  }

  // 5. An auxiliary stands before the verb it helps. One that the parser hung on a verb before it,
  //    across a comma, with a subject of its own after it, is the verb of a tag ("drop in a tree,
  //    would you"): an elliptical question set beside the clause.
  for (const unit of units) {
    if (!unit.word || unit.dep !== 'aux' || unit.lower === 'to' || unit.head === unit.index) continue
    const verb = units[unit.head]
    if (verb.index > unit.index || !set(verb, unit) || !under(unit).some(part => SUBJECT.has(part.dep) && part.index > unit.index)) continue
    unit.dep = 'parataxis'
    changed++
  }

  // 6. No comma stands between a subject and its verb. A nominal that the parser made the subject of
  //    a base form standing after it across a comma ("a small cat on the bench, then make the boat
  //    blue") is a group of words of its own, and the base form, left with no subject, commands.
  for (const unit of units) {
    if (!unit.word || unit.dep !== 'nsubj' || unit.head === unit.index) continue
    const verb = units[unit.head]
    const base = verb.tag === 'VB' || ['VBD', 'VBN'].includes(verb.tag) && verb.lower === verb.lemma
    // (also a present form equal to the base form, when nothing but the comma and adverbs stand between: "a little blue bird
    // perched up in the top right, then tint the highlights …", "lifelines only, show activation bars")
    const gap = between(units[last(unit)], verb)
    // (not a subject with a renaming set off by commas, whose second comma closes the renaming: "the first and final boxes,
    // the ones at the edges, swap")
    const present = verb.tag === 'VBP' && verb.lower === verb.lemma && gap.some(mark => !mark.word && mark.value === ',') &&
      !units.slice(first(unit), last(unit)).some(mark => !mark.word && mark.value === ',') &&
      gap.every(other => !other.word && other.value === ',' || other.word && other.pos === 'ADV' && other.head === verb.index && !under(other).length)
    // (nor is a nominal set off by a comma the subject of a verb that has a subject of its own after the comma: "a small grey
    // cat sitting in the bottom left corner, then rework the room … — the furniture itself keeps its shape and size")
    const nearer = under(verb).find(part => SUBJECT.has(part.dep) && part !== unit && part.index > unit.index && part.index < verb.index)
    if (verbal(verb) && nearer && units.slice(last(unit) + 1, first(nearer)).some(mark => !mark.word && mark.value === ',')) {
      unit.dep = 'dep'
      changed++
      continue
    }
    if (!verbal(verb) || verb.index < unit.index || !base && !present || auxiliaries(verb).length || introduced(verb)) continue
    if (!gap.some(mark => !mark.word && mark.value === ',')) continue
    unit.dep = 'dep'
    changed++
  }

  // 7. An adverb between a punctuation mark and the first word of a clause belongs to that clause,
  //    whatever earlier word the parser hung it on ("…, then make it red"). So does one before a
  //    group of words with no verb that the parser set beside the earlier words ("…, then a small cat").
  //    The linking word "then" opens the clause it stands before also with no mark before it
  //    ("mirror the boat then blur the waterline").
  const nominal = unit => ['NOUN', 'PROPN', 'PRON', 'NUM'].includes(unit.pos) && ['conj', 'dep', 'appos', 'parataxis'].includes(unit.dep)
  for (const unit of units) {
    if (unit.dep !== 'advmod' || unit.pos !== 'ADV' || !unit.word || under(unit).length) continue
    const governor = units[unit.head], before = units[unit.index - 1]
    if (governor.index > unit.index || !before || before.word && unit.lower !== 'then') continue
    // (a verb the parser hung, as the adverb, on a word of the group before the mark opens a clause too: "a small cat way
    // off on the left, then save the right empty")
    const next = units.find(other => other.index > unit.index && other !== governor && first(other) === unit.index + 1 &&
      (verbal(other) && (verbal(governor) || other.head === governor.index) && ['ROOT', 'conj', 'dep', 'parataxis', 'ccomp', 'advcl'].includes(other.dep) || nominal(other)))
    if (next) { unit.head = next.index; changed++ }
  }

  // 8. A question word opens its clause: no clause goes on past a personal pronoun or the "to" of an
  //    infinitive into a question word. One that follows them and opens a question closed by a question
  //    mark, with its auxiliary before its subject, starts the sentence again: "Could you what values does
  //    Votes show?", "Let us what colour is tree 1?", "I need you to what values does League show?". The
  //    question is a clause of its own, set beside the words before it; those form a clause of their own
  //    (an auxiliary with its subject, a verb with its object), and "to" marks the tie from that verb to
  //    the question.
  const closingMark = unit => units.slice(unit.index + 1).find(other => !other.word && /[.!?]/u.test(other.value))
  for (const wh of units) {
    const before = units[wh.index - 1]
    if (!wh.word || !/^W/u.test(wh.tag) || !before?.word) continue
    const to = before.lower === 'to' && (before.tag === 'TO' || before.pos === 'PART')
    if (!to && before.tag !== 'PRP') continue
    // the verb of the question: the first verb form after the question word on the way up from it
    let verb = wh
    for (let steps = 0; verb.head !== verb.index && !(verbal(verb) && verb.index > wh.index) && steps < units.length; steps++) verb = units[verb.head]
    if (!verbal(verb) || verb.index < wh.index || !closingMark(verb)?.value.includes('?')) continue
    const subject = under(verb).find(part => SUBJECT.has(part.dep) && part.index > wh.index)
    const inverted = subject && (verb.pos === 'AUX' && verb.index < subject.index || auxiliaries(verb).some(part => part.index > wh.index && part.index < subject.index))
    if (!inverted) continue
    if (to) {
      const governor = before.head === verb.index ? units[verb.head] : units[before.head]
      if (!verbal(governor) || governor.index > before.index) continue
      verb.head = governor.index
      verb.dep = 'parataxis'
      // what the parser hung on "to" is a word of the question ("what values" in "…to what values does
      // League show?"): the object of its verb
      for (const part of under(before)) if (part !== verb) { part.head = verb.index; if (['pobj', 'pcomp'].includes(part.dep)) part.dep = 'dobj' }
      before.head = verb.index
      before.dep = 'mark'
      before.pos = 'ADP'
      before.tag = 'IN'
    } else {
      const governor = units[before.head]
      if (verbal(governor) && governor.index < before.index && governor !== verb) {
        verb.head = governor.index
        verb.dep = 'parataxis'
      } else {
        // the pronoun was hung on the verb of the question: the auxiliary before it is the verb of its own clause
        const auxiliary = units[before.index - 1]
        if (before.head !== verb.index || !auxiliary?.word || auxiliary.head !== verb.index || !['aux', 'auxpass'].includes(auxiliary.dep)) continue
        const root = verb.head === verb.index
        auxiliary.head = root ? auxiliary.index : verb.head
        auxiliary.dep = root ? 'ROOT' : verb.dep
        before.head = auxiliary.index
        before.dep = 'nsubj'
        verb.head = auxiliary.index
        verb.dep = 'parataxis'
      }
    }
    changed++
  }

  // 9. The "to" of an infinitive ties the infinitive to a word before it. One that opens the sentence
  //    after nothing but a word said to the listener ("please to place flow along the curve") ties it to
  //    that word: the word said to the listener stands as a clause of its own, and "to" marks the tie
  //    from it to the infinitive.
  for (const verb of units) {
    if (!verbal(verb) || verb.head !== verb.index) continue
    const to = under(verb).find(part => part.lower === 'to' && part.dep === 'aux' && part.index < verb.index)
    const listener = to && under(verb).find(part => part.dep === 'intj' && part.index < to.index)
    if (!listener || units.slice(0, verb.index).some(other => other.word && other !== listener && other !== to)) continue
    listener.head = listener.index
    listener.dep = 'ROOT'
    verb.head = listener.index
    verb.dep = 'xcomp'
    changed++
  }

  // 10. A base form of a verb with no auxiliary and no "to" makes no statement: a noun before it is not
  //     its subject. A noun the parser made the subject of such a verb, right after a subordinator, is
  //     marked by that word as by a preposition, and the verb commands: "so as a first pass rename the
  //     rent series" ("as a first pass", then the command "rename"). A base form that completes another
  //     verb takes a subject ("let the man face left") and is left alone.
  for (const verb of units) {
    if (!verbal(verb) || verb.tag !== 'VB' || auxiliaries(verb).length || ['ccomp', 'xcomp'].includes(verb.dep)) continue
    const subject = under(verb).find(part => part.dep === 'nsubj' && part.index < verb.index && part.pos === 'NOUN')
    const marker = subject && under(verb).find(part => part.dep === 'mark' && part.index === first(subject) - 1)
    if (!marker || under(verb).some(part => part.lower === 'to' && part.dep === 'aux')) continue
    marker.dep = 'prep'
    marker.pos = 'ADP'
    subject.head = marker.index
    subject.dep = 'pobj'
    changed++
  }

  // 11. A semicolon, colon or dash ends a clause, also for the nominals of the clause: a noun set before
  //     one and hung on the verb after it as a bare adverb ("cheeks — add a sideburns, please"), or set
  //     after a semicolon or a dash and hung on the verb before it as its object ("excuse me — the
  //     missing piece: tick marks every five"), is a group of words of its own beside that clause. After
  //     a colon the words may still be what the verb takes ("show me a market street: a stall, …").
  for (const unit of units) {
    if (!unit.word || unit.quoted || !['NOUN', 'PROPN'].includes(unit.pos) || unit.head === unit.index) continue
    const verb = units[unit.head]
    if (!verbal(verb) || !(unit.dep === 'npadvmod' && unit.index < verb.index || unit.dep === 'dobj' && unit.index > verb.index)) continue
    const [from, to] = unit.index < verb.index ? [last(unit), verb.index] : [verb.index, first(unit)]
    // (a question mark may close a name, "make Valid? a rounded rectangle")
    if (!units.slice(from + 1, to).some(mark => !mark.word && /^[;:—–]+$/u.test(mark.value) && (unit.index < verb.index || !mark.value.includes(':')))) continue
    unit.dep = 'dep'
    changed++
  }
  //     So does a comma with a linking adverb of sequence after it, which opens the next clause: a noun that
  //     brings in a new thing (an indefinite article or a numeral) before ", then", hung on the verb after it
  //     as a bare adverb ("a little cat near the bench, then send the whole line one spot right"), is a group
  //     of words of its own, not a measure of that verb.
  for (const unit of units) {
    if (!unit.word || unit.quoted || !['NOUN', 'PROPN'].includes(unit.pos) || unit.dep !== 'npadvmod' || unit.head <= unit.index) continue
    if (!under(unit).some(part => part.index < unit.index && (['a', 'an'].includes(part.lower) || part.dep === 'nummod'))) continue
    const verb = units[unit.head]
    if (!verbal(verb)) continue
    const comma = units.slice(last(unit) + 1, verb.index).find(mark => !mark.word && mark.value === ',')
    const next = comma && units[comma.index + 1]
    if (!next?.word || !['then', 'next'].includes(next.lower) || next.dep !== 'advmod' || under(next).length) continue
    unit.dep = 'dep'
    changed++
  }

  // 12. A conjunction joins what stands on either side of it. A clause the parser made a second root of the
  //     sentence, opened by a conjunction after a comma with no mark between them that ends a sentence
  //     ("a jungle clearing at noon with a large green snake…, and keep the animals in the foreground"),
  //     is joined to the root before it.
  for (const unit of units) {
    if (!verbal(unit) || unit.head !== unit.index) continue
    const opening = under(unit).find(part => part.dep === 'cc' && part.index === first(unit) && !under(part).length)
    if (!opening || units[opening.index - 1]?.value !== ',') continue
    const earlier = units.slice(0, opening.index).reverse().find(other => other.word && other.head === other.index)
    if (!earlier || units.slice(earlier.index, opening.index).some(mark => !mark.word && /[.!?;:]/u.test(mark.value))) continue
    unit.head = earlier.index
    unit.dep = 'conj'
    changed++
  }

  // 13. Verbs joined by a conjunction share their form, as they share their subject and auxiliaries.
  //     A base form with an object and no subject or auxiliary of its own, that the parser joined to a
  //     participle completing a verb before it, is joined to that verb, a base form too: in "picture
  //     the man jumping in the air, and push the whole page into comic book style" the commands are
  //     "picture" and "push"; "jumping" is what the man does. The conjunction between them goes with it.
  //     And a participle with no subject or auxiliary joined to a base form adds no command: it says how
  //     the command is done ("go for y numbers even, starting at 0"), a participle clause of that verb.
  // 14. A subordinator or a relative word makes the clause it opens depend on another. A clause the parser
  //     joined to another as a conjunct, with no conjunction of its own, set off by a punctuation mark and
  //     opened by such a word ("…, because the first one looked wrong", "…, if it's easy", "— exactly where
  //     the picture needs it"), hangs on the clause before it as an adverbial clause, marked by that word.
  for (const unit of units) {
    if (!verbal(unit) || unit.dep !== 'conj' || unit.head > unit.index) continue
    // ("so" also joins two clauses side by side: rule 0 and the writer settle it)
    const opener = under(unit).find(part => (part.dep === 'mark' || /^W/u.test(part.tag) && part.dep === 'advmod') && part.index < unit.index && part.lower !== 'so')
    if (!opener || opener.index < unit.head || units.slice(unit.head + 1, unit.index).some(other => other.dep === 'cc' && [unit.head, unit.index].includes(other.head))) continue
    // before the opener only words that grade it ("exactly where"); before them a punctuation mark
    const start = first(unit), before = units[start - 1]
    if (units.slice(start, opener.index).some(other => other.word && (other.dep !== 'advmod' || other.head !== opener.index && other.head !== unit.index))) continue
    if (!before || before.word || !/^[,;:—–-]+$/u.test(before.value)) continue
    unit.dep = 'advcl'
    changed++
  }

  const baseForm = unit => unit.tag === 'VB' && !auxiliaries(unit).length && !subjectOf(unit)
  const participle = unit => ['VBG', 'VBN'].includes(unit.tag) && !auxiliaries(unit).length
  for (const verb of units) {
    if (!verbal(verb) || verb.dep !== 'conj' || !baseForm(verb) || !under(verb).some(part => part.dep === 'dobj')) continue
    const first = units[verb.head], above = units[first.head]
    if (!verbal(first) || !participle(first) || !['ccomp', 'xcomp'].includes(first.dep) || !verbal(above) || !['VB', 'VBP'].includes(above.tag) || above.index > first.index) continue
    verb.head = above.index
    for (const part of under(first)) if (part.dep === 'cc' && part.index > first.index && part.index < verb.index) part.head = above.index
    changed++
  }
  for (const verb of units) {
    if (!verbal(verb) || verb.dep !== 'conj' || !participle(verb) || subjectOf(verb) || verb.index < verb.head) continue
    const first = units[verb.head]
    if (!verbal(first) || !baseForm(first) || under(verb).some(part => part.dep === 'dobj')) continue
    // set off by a comma, with no conjunction of its own in front of it ("…, and starting…" joins)
    const previous = units.slice(0, verb.index).reverse().find(other => other.word)
    if (!between(first, verb).some(mark => !mark.word && mark.value === ',') || previous?.dep === 'cc') continue
    verb.dep = 'advcl'
    changed++
  }

  // 15. The negative determiner "no" opens a nominal that denies a thing; set after a comma at the end of a clause
  //     ("…, so every gap stays the same, no other change to the scene", "…, then the woman in the red dress exits
  //     the scene, no other change") it measures no verb and renames no nominal: it is a remark of its own beside
  //     the clause before the comma. The parser may hang it on that verb as a bare adverb (a measure), or on a
  //     nominal further back as an apposition; it then hangs on that clause by no named relation, and the writer
  //     sets it beside the clause. (An apposition right after its nominal, "no shed, no car", is left alone.)
  for (const unit of units) {
    if (!unit.word || unit.quoted || !['NOUN', 'PROPN'].includes(unit.pos) || !['npadvmod', 'appos'].includes(unit.dep) || unit.head > unit.index) continue
    const start = first(unit), comma = units[start - 1]
    if (units[start]?.lower !== 'no' || units[start].dep !== 'det' || comma?.value !== ',' || !units[start - 2]?.word) continue
    const held = units[unit.head]
    const reaches = (from, to) => { for (let at = from, steps = 0; steps <= units.length; at = units[at.head], steps++) { if (at === to) return true; if (at.head === at.index) return false } return false }
    if (unit.dep === 'npadvmod' ? !verbal(held) : reaches(units[start - 2], held)) continue
    // the clause before the comma: the highest word above the last word before it that still stands before it
    let before = units[start - 2]
    for (let steps = 0; before.head !== before.index && units[before.head].index < start && steps < units.length; steps++) before = units[before.head]
    if (!verbal(before)) continue
    unit.head = before.index
    unit.dep = 'dep'
    changed++
  }

  // 16. A subordinator opens its clause: no word of the clause stands before it. A nominal that the parser made the
  //     subject of a verb, standing right after the verb above it and before the subordinator of its own verb ("make it
  //     so there is a cloud on top of one per tree": "it" before "so"), is no word of that clause: it is the object of
  //     the verb above. ("there" is then the subject of "is".)
  for (const subject of units) {
    if (!subject.word || !SUBJECT.has(subject.dep) || subject.dep === 'expl' || subject.head === subject.index) continue
    const verb = units[subject.head], above = units[verb.head]
    if (!verbal(verb) || verb.head === verb.index || !verbal(above) || above.index > subject.index || first(subject) !== above.index + 1) continue
    if (!under(verb).some(part => part.dep === 'mark' && part.index > last(subject) && part.index < verb.index)) continue
    subject.head = above.index
    subject.dep = 'dobj'
    changed++
  }

  // 17. A dependent clause set before the clause it belongs to is set off from it by a comma, never by a mark that ends
  //     a sentence. One opened by a subordinator, followed by a comma, that the parser hung on a verb after such a mark
  //     ("while you're there, set the arrows medium, that's the tweak; also try the arrow style curved") belongs to the
  //     clause that opens right after its comma.
  for (const unit of units) {
    if (!verbal(unit) || unit.dep !== 'advcl' || unit.head < unit.index || !under(unit).some(part => part.dep === 'mark' && part.index < unit.index)) continue
    const governor = units[unit.head], comma = units[last(unit) + 1]
    if (!comma || comma.word || comma.value !== ',' || !strong(comma, governor)) continue
    const next = units.find(other => verbal(other) && other !== governor && first(other) === comma.index + 1 && other.index < governor.index &&
      !units.slice(comma.index + 1, other.index).some(mark => !mark.word))
    if (!next) continue
    unit.head = next.index
    changed++
  }

  // 18. Two dashes set a phrase aside inside the clause before them. A phrase with no verb between two dashes that the
  //     parser hung on a word after the second ("spread a few boats across the lake — right there in the picture — that
  //     is how the picture goes") belongs to the clause before the first dash.
  const dash = mark => !mark.word && (/^[—–]$/u.test(mark.value) || /^-{1,2}$/u.test(mark.value) && units[mark.index - 1]?.end < mark.start && units[mark.index + 1]?.start > mark.end)
  const dashes = units.filter(dash)
  for (const [open, close] of dashes.slice(0, -1).map((mark, n) => [mark, dashes[n + 1]])) {
    const words = units.slice(open.index + 1, close.index)
    if (!words.length || words.some(unit => !unit.word || verbal(unit)) || !units[open.index - 1]?.word) continue
    const tops = words.filter(unit => unit.head === unit.index || !words.includes(units[unit.head]))
    if (tops.length !== 1 || tops[0].head === tops[0].index || tops[0].head < close.index) continue
    // the clause before the first dash: the highest word above the last word before it that still stands before it
    let before = units[open.index - 1]
    for (let steps = 0; before.head !== before.index && units[before.head].index < open.index && steps < units.length; steps++) before = units[before.head]
    if (!verbal(before)) continue
    tops[0].head = before.index
    changed++
  }

  // 18b. The second dash closes the phrase set aside, so the words after it go on with the clause before the first ("show
  //     a bird a little smaller than the cat — keeping the rest of the scene as it is — with everything else left where it
  //     is", "there is a cloud bigger than the boat — that is how the picture goes — just like that in the scene"). A phrase
  //     after the second dash, a preposition or an adverb with its words, that the parser hung on a word between the dashes belongs to the clause
  //     before the first; and a clause before the first dash that the parser hung on the clause set aside heads it.
  for (const [open, close] of dashes.slice(0, -1).map((mark, n) => [mark, dashes[n + 1]])) {
    const inside = units.slice(open.index + 1, close.index)
    if (!inside.some(unit => unit.word) || !units[open.index - 1]?.word || !units[close.index + 1]?.word) continue
    // the words after the second dash, up to the next mark that ends a sentence
    const end = units.findIndex(unit => unit.index > close.index && !unit.word && STRONG.test(unit.value))
    const after = units.slice(close.index + 1, end < 0 ? units.length : end).filter(unit => unit.word)
    const aside = unit => unit.index > open.index && unit.index < close.index
    const tops = after.filter(unit => unit.head !== unit.index && aside(units[unit.head]))
    // (a phrase with a preposition or an adverb, not a nominal of its own; and no third dash after it, which would make
    // the words between the first two the content and not a phrase set aside: "correct that — the cloud is small — just
    // like that in the scene — keeping the rest")
    if (!tops.length || tops.some(unit => !['ADP', 'ADV'].includes(unit.pos)) || close !== dashes[dashes.length - 1]) continue
    // the clause before the first dash: the highest word above the last word before it that still stands before it
    let before = units[open.index - 1]
    for (let steps = 0; before.head !== before.index && units[before.head].index < open.index && steps < units.length; steps++) before = units[before.head]
    if (!verbal(before)) continue
    if (before.head !== before.index && aside(units[before.head])) {
      const top = units[before.head]
      if (top.head !== top.index) continue
      before.head = before.index
      before.dep = 'ROOT'
      top.head = before.index
      top.dep = 'parataxis'
    }
    for (const unit of tops) unit.head = before.index
    changed++
  }

  // 19. A determiner determines a noun, never a verb: one that the parser hung on a verb ("two ovals — no wait, undo") is a
  //     word said to the listener. And a verb that the parser hung on another as a word about what is said ("meta":
  //     "no wait") is a clause of its own beside it.
  for (const verb of units) {
    if (!verbal(verb) || verb.dep !== 'meta') continue
    verb.dep = 'parataxis'
    for (const part of under(verb)) if (part.dep === 'det' && part.index < verb.index) { part.dep = 'intj'; part.pos = 'INTJ' }
    changed++
  }

  // 20. A subject stands right before the auxiliary of its verb. The nominal between a conjunction and the auxiliary of a
  //     verb ("erase all the stones but the big one can stay", "out with the trees but the ones beside the house can stay")
  //     is the subject of that verb, whatever the parser made of it, and the conjunction joins the clause of that verb to
  //     the words before it: a command with its object, or a group of words with no verb.
  for (const verb of units) {
    if (!verbal(verb)) continue
    const auxiliary = under(verb).find(part => ['aux', 'auxpass'].includes(part.dep) && part.lower !== 'to' && part.index < verb.index &&
      units.slice(part.index + 1, verb.index).every(other => other.word && (other.pos === 'ADV' || other.dep === 'neg')))
    if (!auxiliary) continue
    const conjunction = units.slice(0, auxiliary.index).reverse().find(other => other.word && other.pos === 'CCONJ')
    if (!conjunction) continue
    const words = units.slice(conjunction.index + 1, auxiliary.index), before = units.slice(0, conjunction.index)
    if (!words.length || words.some(other => !other.word) || !before.length || before.some(other => !other.word)) continue
    const tops = words.filter(other => other.head === other.index || !words.includes(units[other.head]))
    if (tops.length !== 1 || !['NOUN', 'PROPN', 'PRON'].includes(tops[0].pos) || tops[0].dep === 'conj') continue
    const [subject] = tops
    if (subject.head === verb.index && SUBJECT.has(subject.dep)) continue
    // the words before the conjunction: a verb form that opens them heads them, or the one word on which they hang
    const firstTops = before.filter(other => other.head === other.index || !before.includes(units[other.head]))
    const head = firstTops.find(other => other.index === 0 && other.pos === 'VERB' && ['VB', 'VBP'].includes(other.tag)) ?? (firstTops.length === 1 ? firstTops[0] : null)
    if (!head || firstTops.some(other => other !== head && !['NOUN', 'PROPN', 'PRON'].includes(other.pos))) continue
    for (const other of firstTops) if (other !== head) { other.head = head.index; other.dep = verbal(head) ? 'dobj' : 'dep' }
    head.head = head.index
    head.dep = 'ROOT'
    subject.head = verb.index
    subject.dep = 'nsubj'
    for (const other of under(verb)) if (SUBJECT.has(other.dep) && other !== subject) { other.head = head.index; other.dep = verbal(head) ? 'dobj' : 'dep' }
    verb.head = head.index
    verb.dep = 'conj'
    conjunction.head = head.index
    conjunction.dep = 'cc'
    changed++
  }

  // 22. "so" after a comma opens a clause that says what the clause before it is for, and depends on it: in "bigger than
  //     the boat, put a cloud, so the whole scene still reads" the command "put a cloud" heads the sentence, and the clause
  //     of "reads" hangs on it by "so". A clause opened by "so" after a comma that the parser made the head of the
  //     sentence, with a verb before the comma hung on it that has an object and neither subject nor auxiliary and whose
  //     form is its base form ("put", "set"), gives the head to that verb, a command, and hangs on it; the words before
  //     the command that the parser hung on the later clause belong to the command.
  for (const verb of units) {
    if (!verbal(verb) || verb.head !== verb.index || subjectOf(verb) === undefined) continue
    const so = under(verb).find(part => part.lower === 'so' && ['mark', 'advmod'].includes(part.dep) && part.index < verb.index && units[part.index - 1]?.value === ',')
    if (!so) continue
    const command = under(verb).find(part => verbal(part) && part.index < so.index && ['ccomp', 'advcl', 'conj', 'dep'].includes(part.dep) && part.lower === part.lemma &&
      !subjectOf(part) && !auxiliaries(part).length && under(part).some(inner => inner.dep === 'dobj') && last(part) === so.index - 2)
    if (!command) continue
    for (const part of under(verb)) if (part.index < command.index && part !== command) part.head = command.index
    command.head = command.index
    command.dep = 'ROOT'
    command.tag = 'VB'
    verb.head = command.index
    verb.dep = 'advcl'
    so.dep = 'mark'
    changed++
  }

  // 21. A participle with no auxiliary makes no statement, so it takes no subject set off from it by a comma. In "a bird a
  //     little smaller than the cat, keeping everything else where it is" the words before the comma are a part with no
  //     verb, and the participle after it says how that part is to be done: the nominal that the parser made the subject
  //     of a participle that heads the sentence, ending at a comma right before the participle, heads the sentence, and
  //     the participle hangs on it.
  for (const verb of units) {
    if (!verbal(verb) || verb.tag !== 'VBG' || verb.head !== verb.index || auxiliaries(verb).length) continue
    const subject = subjectOf(verb)
    if (!subject || !['NOUN', 'PROPN'].includes(subject.pos) || subject.index > verb.index) continue
    const comma = units[verb.index - 1]
    if (!comma || comma.word || comma.value !== ',' || last(subject) !== comma.index - 1) continue
    subject.head = subject.index
    subject.dep = 'ROOT'
    verb.head = subject.index
    verb.dep = 'advcl'
    for (const part of under(verb)) if (part.index < subject.index || !part.word) part.head = subject.index
    changed++
  }

  // 23. A command cannot stand inside another clause (a settled case: a clause that ends a relation with a marker stands
  //     inside the clause where the relation starts). A base form with neither subject nor auxiliary nor "to" (a
  //     command) that the parser joined to a verb with a subject of its own that a subordinator or a question word
  //     opens ("set Barn beside House so the two stages line up, and leave Pond alone", "i wonder if you could put two
  //     red blocks on top, then copy the red tower") is joined to the clause that clause hangs on. And "so" after a comma
  //     that opens a command ("leave House on the Hill, so move Pond right next to Gate") joins it to the clause before:
  //     a conjunction, not a subordinator.
  const isCommand = unit => verbal(unit) && ['VB', 'VBP'].includes(unit.tag) && unit.lower === unit.lemma && !subjectOf(unit) && !auxiliaries(unit).length && !introduced(unit)
  for (const verb of units) {
    // (the form of a command is the base form: "so they touch and stay level" shares 'they')
    if (!isCommand(verb) || verb.tag !== 'VB' || !['conj', 'dep'].includes(verb.dep) || verb.head > verb.index) continue
    const held = units[verb.head]
    if (!verbal(held) || !subjectOf(held) || !under(held).some(part => part.dep === 'mark' && part.index < held.index || part.index < held.index && /^W/u.test(part.tag))) continue
    // the clause it hangs on, above any verb joined to it
    let top = held
    for (let steps = 0; top.dep === 'conj' && top.head !== top.index && steps < units.length; steps++) top = units[top.head]
    if (top.head === top.index || !HUNG.has(top.dep) || !verbal(units[top.head]) && units[top.head].head !== units[top.head].index) continue
    // (the conjunction before it goes with it: "…, and leave Pond alone")
    const joiner = under(held).filter(part => part.dep === 'cc' && part.index < verb.index && part.index > held.index).pop()
    if (joiner && units.slice(joiner.index + 1, verb.index).every(other => other.head === verb.index)) joiner.head = top.head
    verb.head = top.head
    verb.dep = 'conj'
    changed++
  }
  for (const verb of units) {
    if (!verbal(verb) || !['VB', 'VBP'].includes(verb.tag) || verb.lower !== verb.lemma || subjectOf(verb) || auxiliaries(verb).length || verb.dep !== 'advcl' || verb.head > verb.index) continue
    const so = under(verb).find(part => part.lower === 'so' && ['mark', 'advmod'].includes(part.dep) && part.index === firstWord(verb))
    if (!so || units[so.index - 1]?.word || !CLAUSE_MARK.test(units[so.index - 1]?.value ?? '')) continue
    if (under(verb).some(part => part.dep === 'mark' && part !== so || part.lower === 'to' && part.dep === 'aux')) continue
    verb.dep = 'conj'
    so.dep = 'cc'
    changed++
  }

  // 24. A clause that says what another is for, set before it, is set off from it by a comma (rule 17), and a command
  //     takes no clause above it. An infinitive that opens its sentence (the message, or a part after a semicolon, colon,
  //     dash or full stop) and ends at a comma right before a command ("…; to settle it, set the pie radius small again,
  //     and then try …", "…; to stop the moaning, make the markers diamonds") is the clause the command is done for: the
  //     command takes the place of the infinitive (or of the later verb the parser hung the infinitive on), the
  //     infinitive hangs on it marked by its "to", and the verbs the parser joined to the infinitive after the comma are
  //     joined to the command.
  for (const infinitive of units) {
    if (!verbal(infinitive) || infinitive.tag !== 'VB' || subjectOf(infinitive) || auxiliaries(infinitive).length) continue
    const to = under(infinitive).find(part => part.lower === 'to' && part.dep === 'aux' && part.index === firstWord(infinitive) && part.index === infinitive.index - 1)
    if (!to) continue
    const before = units.slice(0, to.index).reverse().find(unit => unit.word || STRONG.test(unit.value) || unit.value === ',')
    if (before && (before.word || !STRONG.test(before.value))) continue
    // the comma that ends it: the first mark after the infinitive, with only the words of its own phrase before it
    const comma = units.find(unit => unit.index > infinitive.index && !unit.word)
    if (!comma || comma.value !== ',' || units.slice(infinitive.index + 1, comma.index).some(unit => !within(unit, infinitive))) continue
    const command = units[comma.index + 1]
    if (!command || !isCommand(command) || command.tag !== 'VB' || under(command).some(part => part.index < command.index)) continue
    if (command.head === infinitive.index && ['conj', 'dep', 'parataxis', 'ccomp', 'xcomp', 'advcl'].includes(command.dep)) {
      // the place of the infinitive, or of the later verb it was hung on
      const place = infinitive.head > command.index && verbal(units[infinitive.head]) ? units[infinitive.head] : infinitive
      // (across a mark that ends a sentence it is set beside the clause before, at the top of that clause)
      let governor = units[place.head]
      const across = place.head !== place.index && strong(governor, command)
      for (let steps = 0; across && governor.head !== governor.index && steps < units.length; steps++) governor = units[governor.head]
      command.head = place.head === place.index ? command.index : governor.index
      command.dep = place.head === place.index ? 'ROOT' : across ? 'parataxis' : place.dep
      if (place !== infinitive) {
        place.head = command.index
        place.dep = 'conj'
      }
      for (const part of under(infinitive)) if (part.index > comma.index && part !== command) part.head = command.index
      comma.head = command.index
      infinitive.head = command.index
      infinitive.dep = 'advcl'
      changed++
    }
  }

  // 25. A verb has one subject. A verb with two subjects before it, where an auxiliary the parser hung on the verb stands
  //     before the later subject ("Could you which events are on Work 4?", "I'd rather it stopped at bars under 20"),
  //     holds two clauses: the earlier subject goes with that auxiliary, which is the verb of a clause of its own, and the
  //     clause of the later subject is what that clause takes (its complement). Only auxiliaries and adverbs stand
  //     between the two subjects.
  for (const verb of units) {
    // (a participle with its auxiliary is one verb form: "what colour is the note named Payment?")
    if (!verbal(verb) || ['VBN', 'VBG'].includes(verb.tag)) continue
    const subjects = under(verb).filter(part => SUBJECT.has(part.dep) && part.index < verb.index)
    if (subjects.length !== 2) continue
    const [earlier, later] = subjects
    // (also a modal the parser hung by no named relation: "I'd rather it showed the cases …")
    const helping = under(verb).filter(part => (part.dep === 'aux' || part.dep === 'auxpass' || part.dep === 'dep' && part.tag === 'MD') && part.lower !== 'to' && part.index < first(later))
    const auxiliary = helping.at(-1)
    if (!auxiliary || units.slice(last(earlier) + 1, first(later)).some(unit => unit.word && !helping.includes(unit) && !(unit.head === verb.index && unit.dep === 'advmod'))) continue
    if (units.slice(first(later), verb.index).some(unit => unit.word && unit.head === verb.index && (unit.dep === 'aux' || unit.dep === 'auxpass') && unit.lower !== 'to' && unit.index < last(later))) continue
    auxiliary.head = verb.head === verb.index ? auxiliary.index : verb.head
    auxiliary.dep = verb.head === verb.index ? 'ROOT' : verb.dep
    for (const part of under(verb)) if (part.index < first(later) && part !== auxiliary) part.head = auxiliary.index
    verb.head = auxiliary.index
    verb.dep = 'ccomp'
    changed++
  }

  // 26. An auxiliary helps the verb of its own clause, and a semicolon, colon or dash ends a clause (rule 11). An
  //     auxiliary that the parser hung on a verb after such a mark ("do the tick numbers smaller on the orders chart; also
  //     can you make the bar outlines black?", "make a bar chart of …: the count of products … — go on") is the verb of a
  //     clause of its own before the mark: it takes the place of the later verb, with the words before the mark that the
  //     parser hung on that verb, and the later verb is set beside it.
  for (const helper of units) {
    if (!helper.word || helper.quoted || !['aux', 'auxpass'].includes(helper.dep) || helper.lower === 'to') continue
    const verb = units[helper.head]
    if (!verbal(verb) || verb.index < helper.index) continue
    // (a question mark may belong to a name: "what values does Refund approved? show?")
    const mark = units.slice(helper.index + 1, verb.index).find(unit => !unit.word && /^[;:—–]+$/u.test(unit.value))
    if (!mark) continue
    helper.head = verb.head === verb.index ? helper.index : verb.head
    helper.dep = verb.head === verb.index ? 'ROOT' : verb.dep
    // a base form commands ("do the arrows medium"); a modal keeps its form ("would you")
    if (helper.tag !== 'MD') { helper.pos = 'VERB'; helper.tag = 'VB' }
    for (const part of under(verb)) if (part.index < mark.index && part !== helper) part.head = helper.index
    mark.head = helper.index
    verb.head = helper.index
    verb.dep = 'parataxis'
    changed++
  }

  // 27. A comma ends the words of a part. A nominal that heads a part of its own before a comma, which the parser hung on a
  //     verb after the comma by no named relation ("a small cat way off on the left, then could you place a bird …",
  //     "instead, a small dog down at the bottom, next slide the Pepsi block …"), keeps the words that say where it is
  //     between it and the comma: an adverb or a phrase of place there that the parser hung on the later verb hangs on
  //     the nominal.
  for (const nominal of units) {
    if (!nominal.word || nominal.quoted || !['NOUN', 'PROPN'].includes(nominal.pos) || nominal.dep !== 'dep') continue
    const verb = units[nominal.head]
    if (!verbal(verb) || verb.index < nominal.index) continue
    const comma = units.find(unit => unit.index > nominal.index && !unit.word)
    if (!comma || comma.value !== ',' || comma.index > verb.index || units.slice(nominal.index + 1, comma.index).some(unit => unit.word && unit.head !== verb.index && !within(unit, nominal) && !units.slice(nominal.index + 1, comma.index).includes(units[unit.head]))) continue
    const moved = units.slice(nominal.index + 1, comma.index).filter(unit => unit.word && unit.head === verb.index && ['advmod', 'prep', 'npadvmod'].includes(unit.dep))
    for (const unit of moved) unit.head = nominal.index
    if (moved.length) changed++
  }
  // 28. A command cannot stand inside another clause (rule 23). A command after a mark (a comma, a semicolon, a colon or a
  //     dash) that the parser hung on an infinitive, which completes the verb before it ("I need you to add a triangle
  //     labelled Hours per project; then connect Hours per project to Website; then make Hours per project red"), is
  //     the next step after the clause of that verb, not a part of what the infinitive says: it hangs on that verb, as
  //     "then" joins "give" with "move" in "move the star so it sits under the table, then give it a thin outline".
  for (const verb of units) {
    if (!isCommand(verb) || verb.tag !== 'VB' || !['conj', 'dep', 'parataxis'].includes(verb.dep) || verb.head > verb.index) continue
    const infinitive = units[verb.head]
    if (!verbal(infinitive) || !under(infinitive).some(part => part.lower === 'to' && part.dep === 'aux' && part.index < infinitive.index) || infinitive.head === infinitive.index) continue
    const above = units[infinitive.head]
    if (!verbal(above) || above.index > infinitive.index || !HUNG.has(infinitive.dep)) continue
    // a mark between the infinitive's words and the command, and only linking words of the command after it
    const opening = firstWord(verb)
    const mark = units[opening - 1]
    if (!mark || mark.word || !CLAUSE_MARK.test(mark.value) || units.slice(opening, verb.index).some(unit => unit.word && unit.head !== verb.index)) continue
    verb.head = above.index
    changed++
  }
  return changed
}
