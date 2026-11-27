// Corrections to a dependency parse, made before it is written as a circuit.
//
// A parser trained on edited prose reads a run of short requests ("set the axis, that's the
// tweak; then drop the legend") as one sentence and hangs each clause on the next as its
// complement or its adverbial clause. Each rule below states a fact of English clause syntax,
// checks it on the parser's own tags and relations, and relabels the arc. No rule names a
// word of the message. A relabelled clause is `parataxis`: set side by side with the other.
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

  // 4. An adverb between a punctuation mark and the first word of a clause belongs to that clause,
  //    whatever earlier verb the parser hung it on ("…, then make it red").
  const first = (unit, depth = 0) => depth > 60 ? unit.index : Math.min(unit.index, ...under(unit).map(part => first(part, depth + 1)))
  for (const unit of units) {
    if (unit.dep !== 'advmod' || unit.pos !== 'ADV' || !unit.word || under(unit).length) continue
    const governor = units[unit.head], before = units[unit.index - 1]
    if (!verbal(governor) || governor.index > unit.index || !before || before.word) continue
    const next = units.find(other => verbal(other) && other.index > unit.index && other !== governor &&
      ['ROOT', 'conj', 'dep', 'parataxis', 'ccomp', 'advcl'].includes(other.dep) && first(other) === unit.index + 1)
    if (next) { unit.head = next.index; changed++ }
  }
  return changed
}
