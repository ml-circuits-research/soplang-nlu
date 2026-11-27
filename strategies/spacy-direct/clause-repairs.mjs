// Corrections to a dependency parse, made before it is written as a circuit.
//
// A parser trained on edited prose reads a run of short requests ("set the axis, that's the
// tweak; then drop the legend") as one sentence and hangs each clause on the next as its
// complement or its adverbial clause. Each rule below states a fact of English clause syntax,
// checks it on the parser's own tags and relations, and relabels or moves the arc. The only words a
// rule names are function words: the linking words "then" and "so" and the "to" of an infinitive. A
// relabelled clause is `parataxis`: set side by side with the other.
const STRONG = /^[;:—–.!?]+$/u
const SUBJECT = new Set(['nsubj', 'nsubjpass', 'expl', 'csubj', 'csubjpass'])
// the relations that hang a clause on a verb, and those that hang it on a noun
const HUNG = new Set(['ccomp', 'xcomp', 'advcl'])
const DESCRIBING = new Set(['acl', 'relcl'])

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

  // 0. "so" after a punctuation mark, at the head of a clause, joins that clause to what stands before
  //    as its result: "nudge the barn next to the tree, so the view stays open", "it is a hierarchy, so
  //    lay out the diagram". The parser may read it as an adverb of the second clause and hang the first
  //    clause on the second; the first is then the main one, and "so" marks the second, hung on it.
  //    (First, since the rules below read the subordinators it sets.)
  for (const so of units) {
    if (!so.word || so.lower !== 'so' || so.dep !== 'advmod' || under(so).length) continue
    const mark = units[so.index - 1], verb = units[so.head]
    if (!mark || mark.word || !/^[,;:—–-]+$/u.test(mark.value) || !verbal(verb) || verb.index < so.index) continue
    const before = under(verb).filter(part => part.index < mark.index)
    if (verb.head === verb.index) {
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
  const first = (unit, depth = 0) => depth > 60 ? unit.index : Math.min(unit.index, ...under(unit).map(part => first(part, depth + 1)))
  const last = (unit, depth = 0) => depth > 60 ? unit.index : Math.max(unit.index, ...under(unit).map(part => last(part, depth + 1)))
  for (const unit of units) {
    if (!unit.word || unit.dep !== 'nsubj' || unit.head === unit.index) continue
    const verb = units[unit.head]
    const base = verb.tag === 'VB' || ['VBD', 'VBN'].includes(verb.tag) && verb.lower === verb.lemma
    if (!verbal(verb) || verb.index < unit.index || !base || auxiliaries(verb).length || introduced(verb)) continue
    if (!between(units[last(unit)], verb).some(mark => !mark.word && mark.value === ',')) continue
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
    const next = units.find(other => other.index > unit.index && other !== governor && first(other) === unit.index + 1 &&
      (verbal(other) && verbal(governor) && ['ROOT', 'conj', 'dep', 'parataxis', 'ccomp', 'advcl'].includes(other.dep) || nominal(other)))
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
  return changed
}
