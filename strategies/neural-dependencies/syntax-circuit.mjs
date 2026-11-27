// A dependency parse written as one circuit of the `syntax` schema.
//
// The parse gives every word a head and a relation to it. This module turns that tree into
// clauses, nominals, relations and coordinations: each word gets one place in one wire, by
// the relation the parser gave it, and the shared writer serialises the wires. Nothing here
// knows what a word means. The rules speak of word classes, of dependency relations and of
// positions only (docs/syntax-schema.md, "How the schema relates to the literature").
import {wordsOf, writeCircuit} from '../../lib/syntax.mjs'

// ---------------------------------------------------------------------------------------------
// Units: the words of the message, each with the parser's evidence
// ---------------------------------------------------------------------------------------------

// A quotation stands in the sentence as one name, whatever it contains.
const QUOTATION = /(?<![\p{L}\p{N}])"[^"\n]+"(?![\p{L}\p{N}])|“[^”\n]+”|«[^»\n]+»|(?<![\p{L}\p{N}])‘[^’\n]+’(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu
const HYPHEN = /^[-‐‑]$/u
const LETTERS = /^[\p{L}\p{M}]+$/u
const ALPHANUMERIC = /^[\p{L}\p{M}\p{N}]+$/u

/**
 * The units of a message: every word of `wordsOf(text)` in one unit, and every punctuation
 * token of the parser as a unit without words. A unit is one word, or a run of words that
 * the sentence treats as one: a quotation, a hyphenated compound ("x-axis"), or several
 * words the parser kept as one token. Each unit carries the parser's evidence for its main
 * token: {index, word: [first, last] | null, start, end, value, lower, pos, tag, dep, lemma,
 * head, quoted}. `head` is the index of the unit it depends on, or its own index for a root.
 */
export function unitsOf(text, tokens) {
  const words = wordsOf(text)
  const joined = new Array(words.length).fill(false) // word i continues the unit of word i - 1
  const quoted = new Array(words.length).fill(null)
  for (const match of text.matchAll(QUOTATION)) {
    const from = match.index + 1, to = match.index + match[0].length - 1
    const inside = words.map((_, index) => index).filter(index => words[index].start >= from && words[index].end <= to && !quoted[index])
    if (!inside.length) continue
    const range = [match.index, match.index + match[0].length]
    for (const index of inside) { quoted[index] = range; if (index > inside[0]) joined[index] = true }
  }
  let lettered = false
  for (let index = 1; index < words.length; index++) {
    if (joined[index] || quoted[index] || quoted[index - 1]) { lettered = false; continue }
    const starts = joined[index - 1] ? lettered : LETTERS.test(words[index - 1].text)
    lettered = false
    if (HYPHEN.test(text.slice(words[index - 1].end, words[index].start)) && starts && ALPHANUMERIC.test(words[index].text)) joined[index] = lettered = true
  }
  const real = tokens.filter(token => token.text.trim())
  for (const token of real) {
    const inside = words.map((_, index) => index).filter(index => words[index].start < token.end && words[index].end > token.start)
    for (const index of inside.slice(1)) if (!quoted[index] && !quoted[index - 1]) joined[index] = true
  }
  const units = []
  for (let index = 0; index < words.length; index++) {
    if (joined[index]) { units.at(-1).word[1] = index; continue }
    units.push({word: [index, index], range: quoted[index], quoted: Boolean(quoted[index]), tokens: []})
  }
  for (const unit of units) {
    unit.start = words[unit.word[0]].start
    unit.end = words[unit.word[1]].end
    unit.range ??= [unit.start, unit.end]
  }
  const marks = []
  for (const token of real) {
    const owner = units.find(unit => token.start < unit.range[1] && token.end > unit.range[0])
    if (owner) owner.tokens.push(token)
    else marks.push({word: null, quoted: false, tokens: [token], start: token.start, end: token.end})
  }
  const all = [...units, ...marks].sort((a, b) => a.start - b.start)
  const unitOf = new Map()
  all.forEach((unit, index) => { unit.index = index; for (const token of unit.tokens) unitOf.set(token.i, unit) })
  for (const unit of all) {
    const own = new Set(unit.tokens.map(token => token.i))
    const outer = unit.tokens.filter(token => token.head === token.i || !own.has(token.head))
    // the token that ties the unit to the rest; a fused negation ("cannot") counts as the negation
    const main = outer.find(token => token.dep === 'neg') ?? outer.find(token => token.pos !== 'PUNCT') ?? outer[0] ?? unit.tokens[0]
    unit.value = text.slice(unit.start, unit.end)
    unit.lower = unit.value.toLowerCase().replaceAll('’', "'")
    unit.pos = unit.quoted ? 'PROPN' : main?.pos ?? 'X'
    unit.tag = main?.tag ?? ''
    unit.dep = main?.dep ?? 'dep'
    unit.lemma = (main?.lemma ?? unit.value).toLowerCase()
    // the unit of the token it depends on; a token outside every unit (white space) is passed over
    let up = main, steps = 0
    while (up && up.head !== up.i && !unitOf.has(up.head) && steps++ < tokens.length) up = tokens[up.head]
    const head = up && up.head !== up.i ? unitOf.get(up.head) : null
    unit.head = head && head !== unit ? head.index : unit.index
    delete unit.range
  }
  // merged tokens can close a loop between two units: the later unit then stands as a root
  for (const unit of all) {
    const seen = new Set([unit.index])
    for (let at = all[unit.head]; at.head !== at.index; at = all[at.head]) {
      if (seen.has(at.index)) { at.head = at.index; at.dep = 'ROOT'; break }
      seen.add(at.index)
    }
  }
  for (const unit of all) if (unit.head === unit.index && unit.word) unit.dep = 'ROOT'
  return all
}

// ---------------------------------------------------------------------------------------------
// The dependency relations behind each key
// ---------------------------------------------------------------------------------------------

const SUBJECT = new Set(['nsubj', 'nsubjpass', 'expl', 'csubj', 'csubjpass'])
// objects and predicative complements of a verb
const OBJECT = new Set(['dobj', 'obj', 'iobj', 'dative', 'attr', 'oprd'])
// positions only a nominal fills
const ARGUMENT = new Set([...SUBJECT, ...OBJECT, 'pobj'])
// relations that hang a clause on another word
const CLAUSAL = new Set(['advcl', 'ccomp', 'xcomp', 'relcl', 'acl', 'pcomp', 'parataxis', 'csubj', 'csubjpass'])
// relations that make a clause part of another: every clausal relation but the one that sets it beside
const EMBEDDED = new Set([...CLAUSAL].filter(dep => dep !== 'parataxis'))
// dependents only a verb governs: a verb form that has one heads a clause wherever it stands
const GOVERNED = new Set([...SUBJECT, ...OBJECT, 'aux', 'auxpass', 'agent', 'ccomp', 'xcomp', 'advcl', 'prt', 'acomp', 'neg'])
// what a preposition governs
const GOVERNED_BY_MARKER = new Set(['pobj', 'pcomp', 'obj'])
// the relations of the words inside a nominal
const WITHIN = new Set(['det', 'predet', 'amod', 'nummod', 'compound', 'quantmod', 'nmod', 'poss', 'neg', 'advmod', 'case'])
const NOMINAL = new Set(['NOUN', 'PROPN', 'PRON', 'NUM'])
// The two-word prepositions of English: an adverb, adjective or participle with a preposition
// that together mark as one preposition does. A closed class of function words, as listed in the
// reference grammars (Quirk et al. 1985, A Comprehensive Grammar of the English Language, §9.10;
// Huddleston and Pullum 2002, ch. 7). No tag tells "next to" from "back to", where "back" is a
// modifier (Rule 5) and "to" the marker, so the class is given by its members. The longer ones
// ("in front of", "on top of") need no entry: the parse reads them as a preposition, a noun
// and "of".
export const TWO_WORD_PREPOSITIONS = new Set(['according to', 'ahead of', 'along with', 'apart from', 'as for', 'as of', 'as per', 'as to', 'aside from',
  'away from', 'because of', 'but for', 'close to', 'contrary to', 'due to', 'except for', 'inside of', 'instead of', 'irrespective of',
  'near to', 'next to', 'off of', 'out of', 'outside of', 'owing to', 'prior to', 'regardless of', 'subsequent to', 'such as', 'thanks to',
  'together with'])
const INTERROGATIVE = new Set(['WDT', 'WP', 'WP$', 'WRB'])
// the linking adverbs that put the next item of a sequence after the one before ("…, then one kite")
const SEQUENCE = new Set(['then', 'next'])
const TERMINAL = new Set(['.', '!', '?'])
const BOUNDARY = new Set([';', ':', '—', '–', '.', '!', '?'])

/**
 * The wires of the circuit, built from the units of a parse.
 * @returns {wires, loose, relations}: `wires` as `writeCircuit` takes them; `loose` the words
 * the parse gave no grammatical place (they are held by the nearest clause); `relations`
 * what a caller needs to compare the attachment of marked relations across parses:
 * [{id, marker: [first, last], from, fromType, start, clause, clauseVerb, unsettled}].
 */
export function wiresOf(units) {
  const kids = Map.groupBy(units.filter(unit => unit.head !== unit.index), unit => unit.head)
  const under = unit => (kids.get(unit.index) ?? []).filter(part => part.word)
  const wires = [], loose = [], pendingJoiners = []
  const placed = new Map(), reserved = new Set()
  const clauseOf = new Map(), nominalOf = new Map(), relationOf = new Map(), intoClause = new Map()
  const groupOf = new Map(), joinedFor = new Map()

  // A verb form; and the root of a sentence, or a word joined to a verb, that governs a direct
  // object is a verb whatever tag it got ("restyle the first link").
  const verbal = unit => !unit.quoted && (unit.pos === 'VERB' || unit.pos === 'AUX' ||
    ['NOUN', 'PROPN', 'X', 'ADJ', 'ADV', 'INTJ'].includes(unit.pos) && under(unit).some(part => part.dep === 'dobj') &&
    (unit.head === unit.index || unit.dep === 'conj' && verbal(units[unit.head])))
  const taken = unit => placed.has(unit.index) || reserved.has(unit.index)
  // the "to" of an infinitive
  const infinitiveTo = unit => unit.lower === 'to' && (unit.tag === 'TO' || unit.pos === 'PART') && (unit.dep === 'aux' || unit.dep === 'mark')
  // a word of thanks standing by itself, not as the object of a verb or of a preposition
  const thanks = unit => unit.lower === 'thanks' && !unit.quoted && !under(unit).some(part => part.dep === 'det' || part.dep === 'amod' || part.dep === 'poss') &&
    (!ARGUMENT.has(unit.dep) || apart(unit))
  // "thank you" said as a formula: no subject, no auxiliary; governed by a preposition it is words mentioned, what
  // the paragraph says ("rewrite the paragraph as Thank you for your patience"), not words said to the listener
  const thanking = unit => verbal(unit) && unit.lemma === 'thank' && !under(unit).some(part => SUBJECT.has(part.dep) || part.dep === 'aux') &&
    under(unit).some(part => part.lower === 'you' && part.index === unit.index + 1) && !(GOVERNED_BY_MARKER.has(unit.dep) && prepositionLike(units[unit.head]))
  const apart = unit => (!units[unit.index - 1] || !units[unit.index - 1].word) && (!units[unit.index + 1] || !units[unit.index + 1].word)
  // a word said to the listener; a word in the place of a subject or an object is a nominal whatever its
  // tag, and one the parser hung as an adverb says how or when ("facing right?", "now the adjacent two")
  const interjection = unit => !unit.quoted && (unit.dep === 'intj' || unit.pos === 'INTJ' && !ARGUMENT.has(unit.dep) && unit.dep !== 'advmod' || thanks(unit))

  // A negation that stands directly before a preposition and hangs on a preposition, or governs
  // one, negates the relation of the preposition it stands before ("near Ben but not behind Jo").
  // A negation hung on a verb negates the clause.
  const negator = unit => unit.word && !unit.quoted && (unit.dep === 'neg' || unit.pos === 'PART' && unit.tag === 'RB')
  const prepositionLike = unit => unit.word && (unit.dep === 'prep' || unit.pos === 'ADP')
  const negationOf = new Map(), negates = new Set()
  for (const unit of units) {
    const next = units[unit.index + 1]
    if (!negator(unit) || !next || !prepositionLike(next) || unit.head === unit.index && next.head !== unit.index) continue
    if (next.head === unit.index || unit.head === next.index || prepositionLike(units[unit.head])) { negationOf.set(next.index, unit); negates.add(unit.index) }
  }

  /** Does this unit head a clause of its own? */
  function heads(unit) {
    if (!unit.word) return false
    if (unit.head === unit.index) return true
    if (!verbal(unit)) return false
    if (CLAUSAL.has(unit.dep)) return true
    if (['aux', 'auxpass', 'prep', 'mark', 'cc', 'case', 'det'].includes(unit.dep)) return false
    const governs = under(unit).some(part => GOVERNED.has(part.dep))
    // a joined or loosely attached verb form is a clause when it stands with a clause or governs like one
    if (unit.dep === 'conj' || unit.dep === 'dep') return governs || clauseOf.has(unit.head) || heads(units[unit.head])
    return governs
  }
  /** Does this word stand where a noun could? */
  function nominalHere(unit) {
    if (unit.quoted) return true
    const alone = !under(unit).length
    // a bare noun used as an adverb ("left", "today") modifies; a measure ("two inches") is a nominal
    if (NOMINAL.has(unit.pos)) return !(unit.pos === 'NOUN' && alone && (unit.dep === 'npadvmod' || unit.dep === 'advmod'))
    if (!ARGUMENT.has(unit.dep)) return false
    if (unit.pos !== 'ADJ' && unit.pos !== 'ADV') return true
    // an adjective or adverb in the place of an object says how, unless a determiner makes it a nominal
    // ("the red"), or it is a subject or object with a phrase of its own ("how many of those")
    return under(unit).some(part => part.dep === 'det' || part.dep === 'poss' || part.dep === 'prep' && unit.dep !== 'attr' && unit.dep !== 'oprd')
  }

  const make = (type, home) => {
    const wire = {type, slots: [], home}
    if (type === 'clause') wire.home = wire
    wires.push(wire)
    return wire
  }
  /** Give the units a place in a wire. Adjacent units given together form one value. */
  function put(wire, key, ...parts) {
    let run = null
    for (const part of parts.filter(part => part.word && !placed.has(part.index)).sort((a, b) => a.index - b.index)) {
      if (run && part.word[0] === run.span[1] + 1) run.span[1] = part.word[1]
      else wire.slots.push(run = {key, span: [...part.word]})
      placed.set(part.index, wire)
    }
  }
  const refer = (wire, key, to, role = false) => { if (!wire.slots.some(slot => slot.key === key && slot.to === to)) wire.slots.push({key, to, role}) }
  // a nominal the clause takes; a nominal introduced by a marker of its own ends a relation from the clause instead
  const complement = (wire, nominal) => nominal.marker && !placed.has(nominal.marker.index)
    ? void relation(wire, nominal, [nominal.marker], wire)
    : refer(wire, 'complement', nominal, true)
  const has = (wire, key) => wire.slots.some(slot => slot.key === key)

  function relation(from, to, markers, home, rest = true) {
    const wire = make('relation', home)
    refer(wire, 'from', from)
    refer(wire, 'to', to, true)
    put(wire, 'marker', ...markers)
    if (to.type === 'clause' && !intoClause.has(to)) intoClause.set(to, wire)
    // a word that grades the marker ("even if", "how about") modifies the clause the relation stands in
    if (rest) for (const marker of markers) for (const part of under(marker)) describeChild(home, marker, part)
    return wire
  }
  /** Put two wires of one type side by side. */
  function join(a, b) {
    if (a === b || a.type !== b.type) return null
    const ka = groupOf.get(a), kb = groupOf.get(b)
    const group = ka ?? kb ?? make('coordination', a.home)
    group.members ??= []
    if (ka && kb && ka !== kb) {
      for (const member of kb.members) { ka.members.push(member); groupOf.set(member, ka) }
      ka.slots.push(...kb.slots)
      wires.splice(wires.indexOf(kb), 1)
      for (const [unit, other] of joinedFor) if (other === kb) joinedFor.set(unit, ka)
      return ka
    }
    for (const wire of [a, b]) if (!group.members.includes(wire)) { group.members.push(wire); groupOf.set(wire, group) }
    return group
  }

  // ----- the form of a clause ----------------------------------------------------------------

  /**
   * A verb form joined to another with no subject or auxiliary of its own shares those of the first.
   * One with a word said to the listener in front of it ("…, so please reset it") addresses the
   * listener by itself: a command, not a second verb of the first clause.
   */
  function bare(unit) {
    const first = units[unit.head]
    const finite = tag => tag === 'VBP' || tag === 'VBZ' || tag === 'VBD'
    // the same verb form as the first: both stand under its auxiliary, its "to" or its subject
    return unit.dep === 'conj' && verbal(unit) && verbal(first) && (unit.tag === first.tag || finite(unit.tag) && finite(first.tag)) &&
      !under(unit).some(part => SUBJECT.has(part.dep) || part.dep === 'aux' || part.dep === 'auxpass' || part.dep === 'mark' || part.dep === 'intj' && part.index < unit.index)
  }
  const independent = unit => verbal(unit) && (unit.head === unit.index || ['conj', 'parataxis', 'dep'].includes(unit.dep)) && heads(unit)
  /** Does a question mark close this clause? It closes the last independent clause before it. */
  function questionMarked(unit) {
    if (!independent(unit)) return false
    // a mark between a capitalised word and a small letter that goes on with the sentence ends no
    // sentence: it belongs to a name ("connect Valid? to it")
    const inName = mark => /^\p{Lu}/u.test(units[mark.index - 1]?.value ?? '') && units[mark.index + 1]?.word && /^\p{Ll}/u.test(units[mark.index + 1].value) &&
      !['cc', 'intj'].includes(units[mark.index + 1].dep)
    const mark = units.slice(unit.index + 1).find(other => !other.word && [...other.value].some(sign => TERMINAL.has(sign)) && !inName(other))
    if (!mark?.value.includes('?')) return false
    // a group of words joined to the clause that opens with a question word of its own asks by itself
    // ("I'd like the title start with a capital letter plus how about x axis on top?"): the mark is its own
    return !units.slice(unit.index + 1, mark.index).some(other => other.word && (independent(other) && !bare(other) || asksByItself(other)))
  }
  /** A verbless conjunct with a question word of its own before its main word: "…, plus how about x axis on top?" */
  const asksByItself = unit => unit.dep === 'conj' && !verbal(unit) && under(unit).some(part => part.index < unit.index && INTERROGATIVE.has(part.tag))
  /** The index of the first and of the last word that hang on this unit, directly or not. */
  const firstOf = (unit, depth = 0) => depth > 60 ? unit.index : Math.min(unit.index, ...under(unit).map(part => firstOf(part, depth + 1)))
  const lastOf = (unit, depth = 0) => depth > 60 ? unit.index : Math.max(unit.index, ...under(unit).map(part => lastOf(part, depth + 1)))
  /** Is there a question word among the words of this clause that stand before its verb? */
  function questionWordBefore(unit) {
    const search = part => INTERROGATIVE.has(part.tag) || !heads(part) && under(part).some(search)
    return under(unit).some(part => part.index < unit.index && search(part))
  }
  /** The only verb form of a clause whose main word is no verb: its auxiliary ("are the dots wider"). */
  const loneAuxiliary = unit => verbal(unit) ? null : under(unit).find(part => (part.dep === 'aux' || part.dep === 'auxpass' || part.dep === 'cop') && !infinitiveTo(part) && !taken(part)) ?? null
  const verbOf = unit => verbal(unit) ? unit : loneAuxiliary(unit)
  /**
   * Only auxiliaries, modals and the verb "be" stand before their subject in a command or a
   * question. A nominal the parser calls the subject of any other main verb, standing after a
   * form of it that is or may be the base form, is its complement ("do the last action once more").
   */
  const afterMainVerb = (part, verb) => SUBJECT.has(part.dep) && part.index > verb.index && verb.lemma !== 'be' &&
    (verb.tag === 'VB' || verb.tag === 'VBP' || verb.tag !== 'MD' && verb.tag !== 'VBZ' && verb.lower === verb.lemma) &&
    // unless an auxiliary of the clause stands between them: a tag ("drop in a headstone, would you")
    !under(units[part.head]).some(other => (other.dep === 'aux' || other.dep === 'auxpass') && other.index > verb.index && other.index < part.index)
  /** The tag of a verb form. A form equal to its base form may be the base form whatever tag it got ("set", "put"). */
  function formTag(verb, subject, auxiliaries) {
    if (!/^(?:VB|MD)/u.test(verb.tag)) return 'VB' // a verb by what it governs, not by its tag
    if ((verb.tag === 'VBD' || verb.tag === 'VBN') && !subject && !auxiliaries.length && verb.lower === verb.lemma) return 'VB'
    return verb.tag
  }
  /** The relation of a clause to what it hangs on; a joined clause stands as the first of its coordination does. */
  const standing = unit => { let at = unit; for (let steps = 0; at.dep === 'conj' && steps++ < units.length;) at = units[at.head]; return at.dep }
  function formOf(unit) {
    const verb = verbOf(unit)
    if (!verb || thanking(unit)) return 'fragment'
    const parts = under(unit).filter(part => part !== verb)
    const auxiliaries = parts.filter(part => (part.dep === 'aux' || part.dep === 'auxpass') && !infinitiveTo(part))
    const subject = parts.find(part => SUBJECT.has(part.dep) && !afterMainVerb(part, verb))
    if (parts.some(infinitiveTo)) return 'nonfinite'
    const tag = formTag(verb, subject, auxiliaries)
    // the first verb form of the group
    const lead = [...auxiliaries, verb].sort((a, b) => a.index - b.index)[0]
    const leading = lead === verb ? tag : lead.tag
    // a participle with no auxiliary, a bare infinitive that completes another verb, also with an
    // auxiliary in the base form ("let limousines be parked"), and a verb form that describes a noun
    // with no subject of its own ("a calendar called Work")
    if ((tag === 'VBG' || tag === 'VBN') && !auxiliaries.length) return 'nonfinite'
    if (leading === 'VB' && (unit.dep === 'ccomp' || unit.dep === 'xcomp') && verbal(units[unit.head])) return 'nonfinite'
    if (unit.dep === 'acl' && !subject && !auxiliaries.length) return 'nonfinite'
    // a clause opened by a question word that is the subject of another clause, or what a form of
    // "be" equates its subject with, is a relative clause without a noun ("what I want is…"): no question
    const fused = unit.dep === 'csubj' || unit.dep === 'ccomp' && units[unit.head].pos === 'AUX' && questionWordBefore(unit)
    if (!['relcl', 'advcl', 'acl'].includes(standing(unit)) && !opener(unit) && !fused) {
      // inversion: a tensed or modal verb form before the subject. A base form before it is no question ("let us go").
      if (subject && lead.index < subject.index && leading !== 'VB') {
        // what opens the clause: joining and discourse words, and a clause set beside it ("drop in a tree, would you")
        const opening = parts.filter(part => part.index < lead.index).every(part => ['intj', 'cc', 'mark', 'parataxis'].includes(part.dep))
        // an auxiliary inverts anywhere; of main verbs only a modal or "be" does, at the head of its clause or after a question word
        if (lead !== verb || (verb.tag === 'MD' || verb.lemma === 'be') && (opening || questionWordBefore(unit))) return 'interrogative'
      }
      // An embedded question keeps the order of a statement and asks nothing by itself: "tell me where
      // it is", "put them back where they were". A question word asks in a clause that stands by itself,
      // also when the parser hung it across a colon and a question mark closes it ("next ask: who leads
      // on profit?"). Even there, with the order of a statement (its subject, which holds no question
      // word, before the verb) and no question mark, it opens a relative clause ("— right where it was —").
      const closing = units.slice(unit.index + 1).find(other => !other.word && [...other.value].some(sign => TERMINAL.has(sign)))
      const asked = closing?.value.includes('?')
      const embedded = EMBEDDED.has(standing(unit)) && !(BOUNDARY.has(units[firstOf(unit) - 1]?.value) && asked)
      const asks = part => INTERROGATIVE.has(part.tag) || under(part).some(asks)
      const statementOrder = subject && subject.index < lead.index && !asks(subject)
      if (questionWordBefore(unit) && !embedded && !(statementOrder && !asked) || questionMarked(unit)) return 'interrogative'
    }
    if (subject && subject.index < lead.index) return 'declarative'
    // no subject before the verb: a base form commands ("move it", "do not move it", "get rid of
    // it", "let us go"); a modal or a tensed form states ("would love a tree")
    return leading === 'VB' || leading === 'VBP' ? 'imperative' : 'declarative'
  }

  // ----- clauses -----------------------------------------------------------------------------

  function clause(unit, sharedForm) {
    let wire = clauseOf.get(unit.index)
    if (wire) return wire
    wire = make('clause')
    wire.unit = unit
    clauseOf.set(unit.index, wire)
    wire.form = sharedForm ?? formOf(unit)
    if (wire.form === 'fragment') fragment(wire, unit)
    else if (verbal(unit)) {
      wire.verb = unit
      put(wire, 'verb', unit)
      for (const part of under(unit)) clauseChild(wire, unit, part)
    } else {
      // the auxiliary is the verb; the main word is what the clause says of its subject
      const verb = loneAuxiliary(unit)
      wire.verb = verb
      put(wire, 'verb', verb)
      if (nominalHere(unit)) complement(wire, nominal(unit, wire, 'complement'))
      else {
        put(wire, 'modifier', unit)
        for (const part of under(unit)) clauseChild(wire, unit, part)
      }
      for (const part of under(verb)) clauseChild(wire, unit, part)
    }
    return wire
  }
  /** A group of words with no verb: what its main word is decides where it stands. */
  function fragment(wire, unit) {
    if (thanking(unit)) {
      put(wire, 'discourse', unit, units[unit.index + 1])
      for (const part of under(unit)) clauseChild(wire, unit, part)
    } else if (interjection(unit)) {
      put(wire, 'discourse', unit)
      for (const part of under(unit)) clauseChild(wire, unit, part)
    } else if (opensMarker(unit)) prepositional(unit, wire, wire)
    else if (nominalHere(unit) || ['DET', 'X', 'SYM'].includes(unit.pos)) complement(wire, nominal(unit, wire, 'complement'))
    else if (['CCONJ', 'SCONJ', 'PART', 'PUNCT'].includes(unit.pos)) {
      put(wire, 'discourse', unit)
      for (const part of under(unit)) clauseChild(wire, unit, part)
    } else describe(wire, unit, true)
  }
  /** The words that introduce a dependent clause: subordinators, the "to" of an infinitive, and the relative or question word that opens a relative or adverbial clause. */
  function markersOf(unit) {
    const markers = under(unit).filter(part => !taken(part) && (part.dep === 'mark' || infinitiveTo(part)))
    const first = opener(unit)
    if (first && !taken(first)) markers.push(first)
    return markers
  }
  /** The relative or question word that opens a clause which hangs on another word as a relative or adverbial clause. */
  function opener(unit) {
    if (!['relcl', 'advcl', 'dep'].includes(unit.dep)) return null
    // the parser may hang the word on any of the clauses joined here: it opens them all
    const clauses = [unit]
    for (const clause of clauses) clauses.push(...under(clause).filter(part => part.dep === 'conj' && verbal(part)))
    const parts = clauses.flatMap(clause => under(clause))
    // (a word that grades it may stand before it: "exactly where the picture needs it")
    const first = parts.find(part => part.index < unit.index && INTERROGATIVE.has(part.tag) && part.tag !== 'WP$' && part.dep !== 'mark' &&
      under(part).every(inner => inner.dep === 'advmod' && inner.index < part.index && !under(inner).length))
    return first && !parts.some(part => part.index < first.index && part.dep !== 'mark' && part.dep !== 'cc') ? first : null
  }
  /** "then" as the first word of a clause that no conjunction joins to the clause before it: the joining word. */
  function openingThen(first, unit) {
    if (units.slice(first.index + 1, unit.index).some(other => other.dep === 'cc' && (other.head === first.index || other.head === unit.index))) return null
    const then = under(unit).find(part => part.lower === 'then' && part.dep === 'advmod' && part.index < unit.index && !under(part).length && !taken(part))
    return then && !under(unit).some(part => part.index < then.index && part !== first) ? then : null
  }
  /** A clause that depends on a wire: a relation ties it, marked by the words that introduce it. */
  function subordinate(from, unit, home) {
    const markers = markersOf(unit)
    for (const marker of markers) reserved.add(marker.index)
    // a clause set beside another with no word that subordinates it stands side by side with it; so does
    // a clause the parser hung on a word of greeting or thanks ("right-align the lot, thank you")
    const courtesy = from.type === 'clause' && from.form === 'fragment' && (interjection(from.unit) || thanking(from.unit))
    const beside = from.type === 'clause' && !markers.length && (unit.dep === 'parataxis' || unit.dep === 'dep' || courtesy) && !['nonfinite', 'fragment'].includes(formOf(unit))
    const [early, late] = beside && from.unit.index > unit.index ? [unit, from.unit] : [from.unit, unit]
    const then = beside ? openingThen(early, late) : null
    if (then) reserved.add(then.index)
    // an adverb directly before the word that introduces the clause grades that word ("exactly as I
    // said", "right where it was"): as a word that grades a marker, it modifies the clause the relation stands in
    const opening = Math.min(...markers.map(marker => marker.index))
    const grading = !beside && home.type === 'clause' ? under(unit).find(part => part.index === opening - 1 && part.dep === 'advmod' && !under(part).length && !taken(part)) : null
    if (grading) put(home, 'modifier', grading)
    const wire = clause(unit)
    if (!beside) return void relation(from, wire, markers, home)
    const group = join(from, wire)
    if (!group) return
    joinedFor.set(unit.index, group)
    if (then) put(group, 'conjunction', then)
    // a subordinator between two clauses that stand side by side joins them ("…, so set the box")
    put(group, 'conjunction', ...under(late).filter(part => part.dep === 'mark' && !taken(part) && part.index > early.index && part.index < late.index))
  }
  function subjectOf(wire, unit) {
    const other = wire.form === 'fragment' || has(wire, 'subject') || wire.verb && afterMainVerb(unit, wire.verb)
    const group = nominal(unit, wire, other ? 'complement' : 'subject')
    if (other) complement(wire, group)
    else refer(wire, 'subject', group, true)
  }
  /** A joining word waits for its coordination; what hangs on it ("and also") is placed in the clause. */
  function joiner(unit, of, wire, key, home) {
    // an adverb hung on the joining word and standing next to it is part of it ("rather than")
    const beside = under(unit).filter(part => !taken(part) && !under(part).length && Math.abs(part.index - unit.index) === 1 && ['advmod', 'cc', 'dep'].includes(part.dep))
    for (const part of beside) reserved.add(part.index)
    pendingJoiners.push({unit, of, wire, key, beside})
    for (const part of under(unit)) describeChild(home, unit, part)
  }
  /** A word with a fixed place in the clause; what the parser hung on it belongs to the same clause. */
  function fixed(wire, key, head, unit) {
    put(wire, key, unit)
    for (const part of under(unit)) clauseChild(wire, head, part)
  }
  function discourse(wire, unit) {
    put(wire, 'discourse', unit)
    for (const part of under(unit)) describeChild(wire, unit, part)
  }
  function clauseChild(wire, head, part) {
    if (taken(part)) return
    const dep = part.dep
    if (dep === 'cc' || dep === 'preconj') return joiner(part, head, wire, 'discourse', wire)
    if (dep === 'conj') return conjunct(head, wire, part, wire, 'modifier')
    if (dep === 'mark' || infinitiveTo(part)) return // read by the relation that ends at this clause
    // a clause that hangs on this one, also as its subject (`subject` names nominals only): a relation ties it
    if (heads(part)) return subordinate(wire, part, wire)
    if (interjection(part)) return discourse(wire, part)
    if (SUBJECT.has(dep)) return subjectOf(wire, part)
    if (dep === 'aux' || dep === 'auxpass') return fixed(wire, wire.form === 'fragment' ? 'modifier' : 'auxiliary', head, part)
    if (dep === 'neg') return fixed(wire, 'negation', head, part)
    if (dep === 'prt') return fixed(wire, 'modifier', head, part)
    if (dep === 'prep' || dep === 'agent' || dep === 'dative' && part.pos === 'ADP') return prepositional(part, wire, wire)
    // a clause without a verb that hangs on this one by a subordinator ("if possible")
    if (dep === 'advcl' || dep === 'parataxis') {
      const markers = markersOf(part)
      if (markers.length || dep === 'parataxis') {
        for (const marker of markers) reserved.add(marker.index)
        const other = clause(part)
        return void (markers.length ? relation(wire, other, markers, wire) : join(wire, other))
      }
    }
    // a nominal the parser hangs on the verb by no named relation, set off from it by punctuation, is
    // no complement of that verb: a fragment beside the clause ("a small dog at the bottom, then drape…")
    if (dep === 'dep' && nominalHere(part) && wire.form !== 'fragment' &&
        units.slice(Math.min(part.index, head.index) + 1, Math.max(part.index, head.index)).some(mark => !mark.word)) {
      if (part.index > head.index && contrast(wire, part)) return
      const then = part.index < head.index ? openingThen(part, head) : null
      if (then) reserved.add(then.index)
      const other = clause(part)
      // opened by a linking word of sequence after the verb, such a group of words is the next thing the
      // verb does and shares it, as a conjunct does (Rule 3): "place one bird on the tree, then one kite on
      // top of it", "add a crown to the girl, next, a red cape". Before the verb it shares nothing ("a small
      // dog at the bottom, then drape…"), nor does a remark set after it with no such word ("…, hands off").
      // So does one that opens with a phrase with a marker set before its nominal, saying where the next
      // thing goes: "put a swing next to the tree, above it, three small red balloons".
      const lender = wire.ellipsis ?? (has(wire, 'verb') && wire.form !== 'nonfinite' ? wire : null)
      const opening = units.slice(head.index + 1, firstOf(part)).reverse().find(unit => unit.word)
      const linked = [opening, units[firstOf(part)]].some(word => word?.word && SEQUENCE.has(word.lower) && word.dep === 'advmod' && !under(word).length) ||
        under(part).some(inner => inner.dep === 'prep' && inner.index === firstOf(part) && under(inner).some(object => GOVERNED_BY_MARKER.has(object.dep)) && units.slice(lastOf(inner) + 1, part.index).some(mark => !mark.word))
      if (part.index > head.index && lender && linked && other.form === 'fragment') { other.ellipsis = lender; refer(other, 'ellipsis', lender) }
      const group = join(wire, other)
      if (group) { joinedFor.set(part.index, group); if (then) put(group, 'conjunction', then) }
      return
    }
    // what is left stands by what it is: a nominal is a complement, any other word a modifier
    if (nominalHere(part)) {
      // a nominal with a subject of its own under a verb ("call it Item 4"): both are complements of that verb
      for (const inner of under(part)) if (SUBJECT.has(inner.dep) && !taken(inner)) complement(wire, nominal(inner, wire, 'complement'))
      return complement(wire, nominal(part, wire, 'complement'))
    }
    describe(wire, part)
  }

  // ----- words that modify a clause --------------------------------------------------------------

  /** Does this word open a marker with something to govern: a preposition, or the first word of a two-word preposition? */
  function opensMarker(unit) {
    const chain = markerChain(unit)
    if (!chain.object) return false
    return negates.has(unit.index) || chain.words.length > 1 || unit.dep === 'prep' || unit.pos === 'ADP' || unit.pos === 'SCONJ'
  }
  /** A word that says how: a modifier of the clause, with the words that grade it. `plain`: it is known to open no marker. */
  function describe(wire, unit, plain = false) {
    if (taken(unit)) return
    if (!plain && opensMarker(unit)) return void prepositional(unit, wire, wire)
    put(wire, 'modifier', unit)
    for (const part of under(unit)) describeChild(wire, unit, part)
  }
  function describeChild(wire, head, part) {
    if (taken(part)) return
    const dep = part.dep
    if (dep === 'cc' || dep === 'preconj') return joiner(part, head, wire, 'modifier', wire)
    if (dep === 'conj') return conjunct(head, null, part, wire, 'modifier')
    if (heads(part)) return subordinate(wire, part, wire)
    if (interjection(part)) return discourse(wire, part)
    // the subject of a describing word under a verb ("make it red"): a complement of that verb
    if (SUBJECT.has(dep)) return complement(wire, nominal(part, wire, 'complement'))
    if (dep === 'prep' || dep === 'agent') return prepositional(part, wire, wire)
    if (dep === 'mark' || infinitiveTo(part)) return
    if (nominalHere(part)) return complement(wire, nominal(part, wire, 'complement'))
    describe(wire, part)
  }

  // ----- nominals ----------------------------------------------------------------------------

  function nominal(unit, home, role) {
    let wire = nominalOf.get(unit.index)
    if (wire) return wire
    wire = make('nominal', home)
    // a marker before a nominal that completes no verb ("how about a painting"): the nominal ends a
    // relation marked by it, and the words before the marker modify the clause
    wire.marker = under(unit).find(part => part.dep === 'mark' && part.index < unit.index && !taken(part))
    if (wire.marker) reserved.add(wire.marker.index)
    wire.role = wire.marker ? 'marked' : role
    nominalOf.set(unit.index, wire)
    put(wire, 'head', unit)
    // a negation directly before a nominal set beside this one negates that relation alone ("ten, not six")
    wire.negated = new Map()
    for (const part of under(unit)) {
      if (part.dep !== 'appos') continue
      const first = Math.min(part.index, ...under(part).map(inner => inner.index))
      const negation = [...under(unit), ...under(part)].find(inner => inner.dep === 'neg' && !taken(inner) && inner.index < first &&
        !units.slice(inner.index + 1, first).some(between => between.word))
      if (negation) { reserved.add(negation.index); wire.negated.set(part.index, negation) }
    }
    for (const part of under(unit)) nominalChild(wire, unit, part, home)
    return wire
  }
  /** A word of the nominal, with the words that depend on it: one dependent per word. */
  function inside(wire, unit) {
    if (taken(unit)) return
    if (opensMarker(unit)) return void prepositional(unit, wire, wire.home)
    put(wire, 'dependent', unit)
    for (const part of under(unit)) {
      if (taken(part)) continue
      if (part.dep === 'cc' || part.dep === 'preconj') joiner(part, unit, wire, 'dependent', wire.home)
      else if (part.dep === 'conj') conjunct(unit, null, part, wire.home, 'dependent', wire)
      else if ((part.dep === 'prep' || part.dep === 'agent') && markerChain(part).object) prepositional(part, wire, wire.home)
      else if (heads(part)) subordinate(wire, part, wire.home)
      else if (interjection(part)) discourse(wire.home, part)
      else inside(wire, part)
    }
  }
  function nominalChild(wire, head, part, home) {
    if (taken(part)) return
    const dep = part.dep, before = part.index < head.index
    if (dep === 'cc' || dep === 'preconj') return joiner(part, head, home, 'discourse', home)
    if (dep === 'conj') return conjunct(head, wire, part, home, 'dependent')
    if (dep === 'prep' || dep === 'agent' || dep === 'dative' && part.pos === 'ADP') {
      // the phrases that describe a noun follow it: one set before it by a punctuation mark opens the clause ("From now on, data
      // labels on"), unless the noun is a later item of a list, which the phrase places ("…, above the sailboat, two small gulls")
      const fronted = before && units.slice(lastOf(part) + 1, head.index).some(other => !other.word)
      const item = ['conj', 'appos'].includes(head.dep) && head.head < head.index
      return prepositional(part, fronted && !item ? home : wire, home)
    }
    // a clause that describes the nominal hangs on it; an adverbial clause hangs on the clause the nominal stands in
    // In a group of words with no verb, joined nominals each keep the adverbial clause that follows them ("how many
    // removals until the row is down to half its length, and how many removals until half of the row is gone?")
    const own = dep === 'advcl' && part.index > head.index && home.form === 'fragment' && (head.dep === 'conj' || under(head).some(other => other.dep === 'conj'))
    if (heads(part)) return subordinate((dep === 'advcl' || dep === 'parataxis' || dep === 'dep') && !own ? home : wire, part, home)
    if (markedFragment(part, home)) return
    if (interjection(part)) return discourse(home, part)
    if (dep === 'poss') {
      // a possessive determiner is a word of the nominal; a possessor is a nominal, tied by "'s" when written
      if (part.tag === 'PRP$' || part.tag === 'WP$') return inside(wire, part)
      const mark = under(part).find(inner => inner.dep === 'case')
      if (mark) reserved.add(mark.index)
      return void relation(wire, nominal(part, home, mark ? 'marked' : 'beside'), mark ? [mark] : [], home)
    }
    // a nominal set beside the head ("an object Status"): a relation with no marker. One set after a
    // comma with "not" in front of it is set against what the clause says ("i meant blue, not green").
    // An adjective right after the nominal, with no determiner of its own, names no thing ("change a
    // heart head yellow big"): it says how the thing is, and goes by Rule 5 below
    if (dep === 'appos' && contrast(home, part)) return
    const describing = part.pos === 'ADJ' && units[firstOf(part) - 1]?.word && !under(part).some(inner => inner.dep === 'det' || inner.dep === 'poss')
    if (dep === 'appos' && !describing) {
      const tie = relation(wire, nominal(part, home, 'beside'), [], home)
      if (wire.negated.has(part.index)) put(tie, 'negation', wire.negated.get(part.index))
      return
    }
    if (dep === 'mark' || infinitiveTo(part)) return
    if (wire.marker && part.index < wire.marker.index && dep === 'advmod') return describe(home, part)
    // a nominal the parser made the subject of this one: both stand in the clause
    if (SUBJECT.has(dep)) return complement(home, nominal(part, home, 'complement'))
    // an adverb that opens the nominal and is set off from it by punctuation modifies the clause
    // ("instead, a yellow column"); "then" after a punctuation mark joins the nominal to what stands before ("…, then a small cat")
    // A determiner opens a nominal: an adverb that opens a message of no verb before the determiner of its
    // nominal is a word of the clause, not of the thing ("now a second wooden boat in the same little pond")
    if (before && dep === 'advmod' && !under(part).length && firstOf(head) === part.index) {
      const mark = step => units[part.index + step]?.word === null
      if (part.lower === 'then' && (mark(-1) || mark(1))) return joiner(part, head, home, 'modifier', home)
      const next = units[part.index + 1]
      const opening = head.head === head.index && !units.slice(0, part.index).some(other => other.word) && next?.word && next.head === head.index && next.dep === 'det'
      if (mark(1) || opening) return describe(home, part, true)
    }
    // "else" after the pronoun or question word it belongs to is a word of that nominal ("everything else")
    if (WITHIN.has(dep) && (before || dep === 'det' || dep === 'predet' || dep === 'case' || part.lower === 'else')) return inside(wire, part)
    // before the head, hung on it by no relation of a nominal ("no shed, no car — a barn"): a nominal of its own in the clause
    if (before) return nominalHere(part) ? complement(home, nominal(part, home, 'complement')) : inside(wire, part)
    // after the head: a number or a name is a nominal of its own ("x 120"), tied with no marker
    if (nominalHere(part)) return void relation(wire, nominal(part, home, 'beside'), [], home)
    if (opensMarker(part)) return void prepositional(part, wire, home)
    // a word that says how the nominal is, after it: a modifier of the clause when the nominal is its
    // subject or complement, a dependent when the nominal ends a relation (Rule 5)
    if (wire.role === 'subject' || wire.role === 'complement') return describe(home, part)
    inside(wire, part)
  }

  // ----- relations with a marker ---------------------------------------------------------------

  /**
   * The words of a marker and what it governs. A marker is one preposition; or a two-word
   * preposition ("next to"), whichever of its words the parser made the head; or a preposition
   * that governs another directly after it ("from behind").
   */
  function markerChain(unit) {
    // a negation that governs the preposition it stands before: the marker starts at the preposition
    if (negates.has(unit.index)) {
      const next = units[unit.index + 1]
      return next.head === unit.index ? markerChain(next) : {words: [unit], object: null}
    }
    const words = [unit]
    for (let at = unit; ;) {
      const object = governedBy(at)
      if (object) return {words, object}
      const next = units[at.index + 1]
      if (!next?.word || taken(next) || words.length > 3) return {words, object: null}
      const twoWords = TWO_WORD_PREPOSITIONS.has(at.lower + ' ' + next.lower) && (next.head === at.index || at.head === next.index || next.head === at.head)
      const stacked = at.dep === 'prep' && next.head === at.index && (next.dep === 'prep' || next.pos === 'ADP' && next.dep === 'pcomp')
      if (!twoWords && !stacked) return {words, object: null}
      words.push(next)
      at = next
    }
  }
  /** What a preposition governs: its object; or, when the parser named none, the one word that hangs on it and follows it ("to happy"). */
  function governedBy(unit) {
    const object = under(unit).find(part => GOVERNED_BY_MARKER.has(part.dep) && !taken(part))
    if (object || unit.dep !== 'prep') return object ?? null
    const after = under(unit).filter(part => part.index > unit.index && !taken(part))
    return after.length === 1 && !heads(after[0]) && !prepositionLike(after[0]) && after[0].dep !== 'cc' && after[0].dep !== 'conj' ? after[0] : null
  }
  /**
   * English may leave a preposition without its object at the end of a relative clause or a question,
   * where the object is what the clause is about (preposition stranding): "the place he started from"
   * (from the place), "the one chart everyone waits for", "the order the two steps happen in", "what is
   * link e4 between?" (between what). A preposition that governs nothing, in a clause that describes a
   * noun, governs that noun; in a clause with a question word that stands for a thing, before the
   * preposition, it governs that word.
   */
  function strandedObject(unit) {
    if (unit.dep !== 'prep' || under(unit).length || unit.head === unit.index) return null
    let clause = units[unit.head]
    for (let steps = 0; !verbal(clause) && clause.head !== clause.index && steps < units.length; steps++) clause = units[clause.head]
    if (!verbal(clause)) return null
    if (clause.dep === 'relcl' && clause.head !== clause.index && clause.index < unit.index && NOMINAL.has(units[clause.head].pos)) return units[clause.head]
    const asks = under(clause).find(part => part.index < unit.index && (part.tag === 'WP' || part.tag === 'WDT' && part.pos === 'PRON') && ARGUMENT.has(part.dep))
    return asks ?? null
  }
  /** A preposition with what it governs: a relation from `from` to that nominal or clause. */
  function prepositional(unit, from, home, unsettled = false) {
    if (taken(unit)) return null
    if (negates.has(unit.index) && units[unit.index + 1].head === unit.index) {
      // the negation governs the preposition: the relation is that of the preposition
      const wire = prepositional(units[unit.index + 1], from, home, unsettled)
      if (wire) relationOf.set(unit.index, wire)
      for (const part of under(unit)) if (!taken(part)) (part.dep === 'cc' || part.dep === 'preconj') ? joiner(part, unit, home, 'discourse', home) : describe(home, part)
      return wire
    }
    const chain = markerChain(unit)
    const {object} = chain
    if (!object) {
      // a preposition left at the end of a relative clause or a question governs what that clause is about
      const stranded = strandedObject(unit)
      if (stranded) {
        reserved.add(unit.index)
        const wire = relation(from, nominal(stranded, home, 'marked'), [unit], home, false)
        relationOf.set(unit.index, wire)
        return wire
      }
      // nothing governed: a particle or a direction, a modifier of the clause (Rule 5)
      describe(home, unit, true)
      return null
    }
    // the first word of a two-word preposition that the parser hung on the second ("next" on "to")
    const lead = units[unit.index - 1]
    const words = lead?.word && !taken(lead) && lead.head === unit.index && TWO_WORD_PREPOSITIONS.has(lead.lower + ' ' + unit.lower) ? [lead, ...chain.words] : chain.words
    for (const word of words) reserved.add(word.index)
    let start = from
    // a measure directly before the marker belongs with it: the relation starts at the measure (Rule 4)
    const previous = units[unit.index - 1]
    const measure = previous?.word && nominalOf.get(previous.index)
    if (from.type === 'clause' && measure && previous.dep === 'npadvmod' && measure.home === home &&
        (previous.pos === 'NUM' || under(previous).some(part => part.dep === 'nummod' || part.pos === 'NUM'))) start = measure
    for (const word of words) for (const part of under(word)) {
      if (part.dep !== 'npadvmod' || part.index > unit.index || !nominalHere(part) || taken(part)) continue
      start = nominal(part, home, 'complement')
      complement(home, start)
    }
    const target = heads(object) ? clause(object) : nominal(object, home, 'marked')
    const wire = relation(start, target, words, home, false)
    relationOf.set(unit.index, wire)
    if (negationOf.has(unit.index)) put(wire, 'negation', negationOf.get(unit.index))
    if (unsettled && start === from && from.type === 'clause') wire.slots.push({key: 'attachment', value: 'ambiguous'})
    const last = (at, depth = 0) => depth > 50 ? at.index : Math.max(at.index, ...under(at).map(part => last(part, depth + 1)))
    for (const word of words) for (const part of under(word)) {
      // a negation that stands before another preposition is left for the relation of that one
      if (taken(part) || negates.has(part.index) && units[part.index + 1].head !== part.index) continue
      if (part.dep === 'neg') put(wire, 'negation', part)
      else if (part.dep === 'cc' || part.dep === 'preconj') joiner(part, unit, home, 'discourse', home)
      else if (part.dep === 'conj') conjunct(unit, wire, part, home, 'modifier')
      else if (heads(part)) subordinate(home, part, home)
      else if (markedFragment(part, home)) continue
      // a second nominal under the same marker, directly after the first ("at x 120") or after a comma ("to 260,
      // 240", a pair of numbers): it stands beside the first
      else if (GOVERNED_BY_MARKER.has(part.dep) && nominalHere(part) && target.type === 'nominal' && (part.index === last(object) + 1 ||
          part.index > last(object) + 1 && units.slice(last(object) + 1, part.index).every(mark => !mark.word && mark.value === ','))) relation(target, nominal(part, home, 'beside'), [], home)
      // a second preposition hung on this one ("at x 120, at y 90"): a second relation from the same start
      else if ((part.dep === 'prep' || part.pos === 'ADP') && markerChain(part).object) prepositional(part, start, home)
      else if (nominalHere(part)) complement(home, nominal(part, home, 'complement'))
      // a word that grades the relation ("just below", "right next to") stands before its marker and says
      // how near the relation holds, not what the thing is: a modifier of the clause the relation stands in,
      // also when the relation starts at a nominal that ends another relation ("with a bear just behind the
      // pine"). Any other word after a nominal follows Rule 5: a modifier of the clause when the relation
      // starts at the clause or at its subject or complement, a dependent of the nominal otherwise.
      else if (start.type === 'nominal' && start.role !== 'subject' && start.role !== 'complement' && part.index > words[0].index) inside(start, part)
      else describe(home, part)
    }
    return wire
  }

  // ----- coordination ----------------------------------------------------------------------------

  /**
   * A unit joined to another by the parser.
   * @param first the unit it is joined to
   * @param wire the wire `first` stands for, or null when `first` is a single word held under `key`
   * @param home the clause they stand in
   * @param holder the nominal that holds `first` when it is a dependent
   */
  function conjunct(first, wire, part, home, key, holder) {
    if (taken(part)) return
    if (contrast(home, part)) return
    const noted = group => { if (group) { joinedFor.set(first.index, group); joinedFor.set(part.index, group) } return group }
    const paired = under(part).some(inner => SUBJECT.has(inner.dep))
    // the clause whose verb a verbless conjunct shares: "make A blue and B green"
    const lender = home.ellipsis ?? (has(home, 'verb') ? home : null)
    // a word of greeting or thanks shares nothing ("move the box, and thanks")
    const shares = other => {
      if (lender && other.form === 'fragment' && other !== lender && !interjection(part) && !thanking(part) && !asksByItself(part)) { other.ellipsis = lender; refer(other, 'ellipsis', lender) }
      return other
    }
    if (heads(part)) {
      // a clause: beside the clause of the first conjunct
      const markers = markersOf(part)
      for (const marker of markers) reserved.add(marker.index)
      const beside = wire?.type === 'clause' ? wire : home
      const strong = units.slice(first.index + 1, part.index).some(unit => !unit.word && BOUNDARY.has(unit.value))
      const then = openingThen(first, part)
      if (then) reserved.add(then.index)
      const other = clause(part, bare(part) && wire?.type === 'clause' && !strong && ['interrogative', 'declarative', 'nonfinite'].includes(wire.form) ? wire.form : undefined)
      const group = noted(join(beside, other))
      if (markers.length) {
        // the words that introduce a joined clause mark the relation into the first one; with none, they join
        const into = intoClause.get(beside)
        if (into) put(into, 'marker', ...markers)
        else if (group) put(group, 'conjunction', ...markers)
      }
      if (group && then) put(group, 'conjunction', then)
      return
    }
    if (wire?.type === 'relation' && markerChain(part).object) {
      // a second preposition with its own nominal: a second relation from the same start
      const start = wire.slots.find(slot => slot.key === 'from').to
      const other = prepositional(part, start, home)
      if (other) noted(join(wire, other))
      return
    }
    // like joins like: a word joined to a nominal is a nominal ("sketch and plan"), unless it brings a
    // preposition and its own nominal
    if (wire?.type === 'nominal' && !paired && !opensMarker(part)) {
      const other = nominal(part, home, wire.role)
      return void (other.marker ? complement(home, other) : noted(join(wire, other)))
    }
    if (wire?.type === 'clause' && wire.form === 'fragment' && interjection(part)) return discourse(wire, part)
    // a verbless conjunct beside a clause, or one with a subject of its own beside a describing word:
    // a fragment that shares the verb (Rule 3)
    if (wire?.type === 'clause' || paired) {
      const beside = wire?.type === 'clause' ? wire : home
      const other = shares(clause(part))
      return void noted(join(beside, other))
    }
    // a word joined to a word: both stand in the same wire under the same key
    if (key === 'dependent' && holder) return inside(holder, part)
    if (wire?.type === 'nominal' && wire.role !== 'subject' && wire.role !== 'complement') return inside(wire, part)
    if (markerChain(part).object && (part.dep === 'prep' || part.pos === 'ADP')) return void prepositional(part, home, home)
    if (nominalHere(part)) return complement(home, nominal(part, home, 'complement'))
    describe(home, part)
  }

  /**
   * A word or a group of words set after a comma with "not" in front of it ("the cloud is small, not
   * big", "have the woman take the next turn, not the man") is set against what the clause says: a
   * fragment that shares the verb of the clause (Rule 3), with the negation as its own.
   * @returns the fragment, or null when the part is no such contrast
   */
  function contrast(home, part) {
    const negation = under(part).find(inner => inner.dep === 'neg' && inner.index === firstOf(part) && !taken(inner))
    if (!negation || units[negation.index - 1]?.value !== ',' || home.type !== 'clause' || formOf(part) !== 'fragment') return null
    const lender = home.ellipsis ?? (has(home, 'verb') ? home : null)
    if (!lender) return null
    reserved.add(negation.index)
    const other = clause(part)
    put(other, 'negation', negation)
    other.ellipsis = lender
    refer(other, 'ellipsis', lender)
    const group = join(home, other)
    if (group) joinedFor.set(part.index, group)
    return other
  }

  /**
   * A group of words with no verb that a subordinator introduces ("with the gate still reachable", "if
   * possible") is a clause of its own, tied by that word to the clause it stands in, wherever the parser
   * hung it: under a clause it is so written already (clauseChild), under a nominal or a preposition the
   * subordinator would be left with no place.
   * @returns the relation, or null when the part is no such group
   */
  function markedFragment(part, home) {
    if (part.dep !== 'advcl' || home.type !== 'clause' || verbal(part)) return null
    const markers = markersOf(part).filter(marker => marker.dep === 'mark')
    if (!markers.length) return null
    for (const marker of markers) reserved.add(marker.index)
    return relation(home, clause(part), markers, home)
  }

  // ----- words the parse gave no grammatical place ----------------------------------------------

  function loosely(home, unit) {
    if (taken(unit)) return
    loose.push(unit)
    if (heads(unit)) return void clause(unit)
    if ((unit.dep === 'prep' || unit.pos === 'ADP') && markerChain(unit).object) return void prepositional(unit, home, home, true)
    if (interjection(unit)) return discourse(home, unit)
    if (nominalHere(unit) || NOMINAL.has(unit.pos) || ['DET', 'X'].includes(unit.pos)) return complement(home, nominal(unit, home, 'complement'))
    if (['CCONJ', 'SCONJ', 'PART', 'PUNCT', 'SYM'].includes(unit.pos)) {
      put(home, 'discourse', unit)
      for (const part of under(unit)) loosely(home, part)
      return
    }
    describe(home, unit, true)
  }
  function homeOf(unit) {
    for (let at = unit, steps = 0; at.head !== at.index && steps++ < units.length;) {
      at = units[at.head]
      const wire = placed.get(at.index) ?? clauseOf.get(at.index)
      if (wire?.home) return wire.home
    }
    const clauses = wires.filter(wire => wire.type === 'clause')
    return clauses.findLast(wire => wire.unit.index <= unit.index) ?? clauses[0]
  }

  // ----- the message -----------------------------------------------------------------------------

  for (const unit of units) if (unit.word && unit.head === unit.index) clause(unit)
  // words the parse left unplaced: the highest one of each group first, so that what hangs on it follows it
  const waits = unit => unit.word && !placed.has(unit.index) && !pendingJoiners.some(pending => pending.unit === unit || pending.beside.includes(unit))
  for (const unit of units) {
    while (waits(unit)) {
      let top = unit
      for (let steps = 0; top.head !== top.index && waits(units[top.head]) && steps < units.length; steps++) top = units[top.head]
      reserved.delete(top.index)
      loosely(homeOf(top), top)
      if (!placed.has(top.index)) { put(homeOf(top), 'discourse', top) }
    }
  }

  const firstWord = (wire, depth = 0) => {
    const own = Math.min(...wire.slots.filter(slot => slot.span).map(slot => slot.span[0]), Infinity)
    if (own < Infinity || depth > 4) return own
    if (wire.type === 'coordination') return Math.min(...(wire.members ?? []).map(member => firstWord(member, depth + 1)), Infinity)
    return Math.min(...wire.slots.filter(slot => slot.to).map(slot => firstWord(slot.to, depth + 1)), Infinity)
  }
  // a conjunction belongs to the coordination of the unit it hangs on; with no coordination it is
  // a word of discourse (a clause), or stays with the words it stands among
  for (const {unit, of, wire, key, beside} of pendingJoiners) {
    if (placed.has(unit.index)) continue
    const group = joinedFor.get(of.index) ?? groupOf.get(nominalOf.get(of.index)) ?? groupOf.get(relationOf.get(of.index)) ?? groupOf.get(clauseOf.get(of.index))
    const opens = group && Math.min(...group.members.map(member => firstWord(member))) > unit.word[0]
    if (group && (unit.dep === 'preconj' || !opens)) put(group, 'conjunction', unit, ...beside)
    else {
      const holder = group ? group.home ?? wire : wire
      // a conjunction is a linking word, never a word that says how: between two words that modify one
      // clause ("turn the path slick and reflective", "up and left of Draft") the schema has no wire for
      // the pair, and the conjunction is a word of discourse of that clause
      put(holder, group || key === 'modifier' && holder.type === 'clause' && unit.pos === 'CCONJ' ? 'discourse' : key, unit)
      for (const part of beside) put(holder.type === 'clause' ? holder : holder.home ?? holder, holder.type === 'clause' ? 'modifier' : key, part)
    }
  }
  for (const unit of units) if (unit.word && !placed.has(unit.index)) { loose.push(unit); put(homeOf(unit), 'discourse', unit) }

  // ----- from wires to the writer's input -----------------------------------------------------------

  const live = wires.filter(wire => wire.type !== 'coordination' || wire.members.length > 1)
  const order = live.map(wire => [wire, firstWord(wire)]).sort((a, b) => a[1] - b[1]).map(pair => pair[0])
  const letters = {clause: 'c', nominal: 'n', relation: 'r', coordination: 'k'}, counts = {}
  for (const wire of order) wire.id = letters[wire.type] + (counts[wire.type] = (counts[wire.type] ?? 0) + 1)
  // a wire named as subject, complement or end of a relation is named through its coordination
  const through = (wire, slot) => {
    const group = slot.role && groupOf.get(slot.to)
    if (!group || group.members.includes(wire)) return slot.to
    // a wire tied to two members of one coordination names each of them
    return wire.slots.some(other => other !== slot && other.to && group.members.includes(other.to)) ? slot.to : group
  }
  const out = order.map(wire => {
    const slots = []
    if (wire.type === 'clause') slots.push({key: 'form', value: wire.form})
    for (const slot of wire.slots) {
      if (slot.span) slots.push({key: slot.key, span: slot.span})
      else if (slot.to) slots.push({key: slot.key, ref: through(wire, slot).id})
      else slots.push({key: slot.key, value: slot.value})
    }
    if (wire.type === 'coordination') for (const member of [...wire.members].sort((a, b) => firstWord(a) - firstWord(b))) slots.push({key: 'conjunct', ref: member.id})
    // one mention of each wire under a key is enough
    return {id: wire.id, type: 'syntax.' + wire.type, slots: slots.filter((slot, index) => !slot.ref || slots.findIndex(other => other.key === slot.key && other.ref === slot.ref) === index)}
  })
  // a wire is known across parses of one message by the place of its main word
  const anchor = wire => wire.type === 'clause' ? wire.unit.word[0] : wire.type === 'nominal' ? wire.slots.find(slot => slot.key === 'head').span[0] : firstWord(wire)
  const relations = order.filter(wire => wire.type === 'relation' && has(wire, 'marker')).map(wire => {
    const from = wire.slots.find(slot => slot.key === 'from').to
    return {id: wire.id, marker: wire.slots.find(slot => slot.key === 'marker').span, from: from.id, fromType: from.type, start: anchor(from),
      clause: wire.home?.id ?? null, clauseVerb: wire.home ? anchor(wire.home) : null, unsettled: has(wire, 'attachment')}
  })
  return {wires: out, loose: loose.map(unit => unit.value), relations}
}

/**
 * One `syntax` circuit for a message, from its dependency parse.
 * @param tokens the parser's tokens: [{i, text, start, end, pos, tag, dep, head, lemma}]
 * @param prepare an optional step of the calling strategy that corrects the units before they are written
 * @returns {sop, loose, relations, wires}
 */
export function circuitOf(text, tokens, prepare) {
  const units = unitsOf(text, tokens)
  if (!units.some(unit => unit.word)) throw new Error('The message has no words.')
  prepare?.(units)
  const built = wiresOf(units)
  return {sop: writeCircuit(text, built.wires), ...built}
}
