// Corrections to a dependency parse, made before it is written as a circuit.
//
// A parser trained on edited prose reads a run of short requests ("set the axis, that's the
// tweak; then drop the legend") as one sentence and hangs each clause on the next as its
// complement or its adverbial clause. Each rule below states a fact of English clause syntax,
// checks it on the parser's own tags and relations, and relabels or moves the arc. No rule names
// a word of the message, except the linking word "then". A relabelled clause is `parataxis`: set
// side by side with the other.
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
  for (const unit of units) {
    if (!verbal(unit) || unit.head === unit.index || !['ccomp', 'xcomp', 'acl', 'relcl'].includes(unit.dep)) continue
    const governor = units[unit.head], subject = subjectOf(unit)
    if (governor.index > unit.index || !set(unit, governor) || !subject) continue
    if (auxiliaries(unit).some(part => part.index < subject.index)) { unit.dep = 'parataxis'; changed++ }
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
  return changed
}
