// Corrections to the word classes and the arcs of a dependency parse, made before it is written
// as a circuit.
//
// A tagger trained on edited prose reads a short request by the habits of that prose: a word
// that opens a message and can be a noun or a verb is taken for a noun ("book Room 1 for
// Planning"), and a capitalised name that can be a verb is taken for one ("link Plan to Build").
// Each rule below states a fact of English grammar or spelling, checks it on the parser's own
// tags, relations, word order, punctuation, capitals and endings, and corrects the units in place.
// The only words a rule names are function words ("of", "else", "in", "to", pronouns, determiners,
// numerals, the auxiliaries "do" and "have" and the closed class of auxiliaries, the linking adverbs
// of sequence "then" and "next", the two-word prepositions of the writer) and "left", the past form
// of the common verb "leave"; none names a noun, an adjective or a word particular to these messages.
// Some rules also read counts learned from the raw text of the messages: how often a word that opens
// a sentence is followed by a determiner or a pronoun (command-openers.mjs, written by
// learn-openers.mjs), and how a word stands after a determiner, after "to", a subject pronoun or a
// modal, and alone after "it" or "is" (describing-words.mjs, written by learn-describing.mjs).
import {LEAST_OPENINGS, NOMINAL_PAIRS, OPENER_SHARE, OPENINGS} from './command-openers.mjs'
import {LEAST_USES, USES} from './describing-words.mjs'
import {TWO_WORD_PREPOSITIONS} from '../neural-dependencies/syntax-circuit.mjs'

const SUBJECT = new Set(['nsubj', 'nsubjpass', 'expl', 'csubj', 'csubjpass'])
// the marks that end a sentence, and those that end a clause
const SENTENCE_END = new Set([';', ':', '—', '–', '.', '!', '?', '...', '…'])
const CLAUSE_END = new Set([...SENTENCE_END, ','])
// the dependents that only a nominal takes before its head, and those that only a verb takes
const NOMINAL_INSIDE = new Set(['det', 'predet', 'nummod', 'amod', 'compound', 'poss', 'quantmod', 'nmod'])
const VERB_ONLY = new Set([...SUBJECT, 'dobj', 'dative', 'aux', 'auxpass', 'neg', 'prt', 'ccomp', 'xcomp', 'acomp', 'oprd'])
// the relations by which a parser hangs a word inside a nominal or beside it, not as a verb of its own
const NOT_A_CLAUSE = new Set(['ROOT', 'dep', 'compound', 'amod', 'nmod', 'npadvmod', 'appos', 'intj', 'dobj', 'nsubj', 'poss', 'det'])
// the relations by which a parser hangs on a verb a name that follows its object
const NAMING = new Set(['dobj', 'npadvmod', 'dep', 'appos', 'oprd', 'attr', 'nsubj'])
const NOMINAL = new Set(['NOUN', 'PROPN', 'PRON', 'NUM', 'X'])
// the object forms of the personal pronouns that are no subject forms; "'s" is "us" in "let's"
const OBJECT_FORM = new Set(['me', 'us', 'him', 'them', "'s"])
// the determiners that bring a new thing into the talk
const INDEFINITE = new Set(['a', 'an', 'another', 'some', 'any'])
// the auxiliaries: forms of "be", "have" and "do", the modals (with their clipped forms), the "to" of an
// infinitive, and the verbs a parser also hangs as auxiliaries: "get" of the passive ("get rid of it"), "let"
// of "let's", "going" and "used" before "to"
const AUXILIARY = new Set(['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being', "'m", "'re", "'s", 'have', 'has', 'had', 'having', "'ve", "'d",
  'do', 'does', 'did', 'will', 'would', "'ll", 'wo', 'can', 'ca', 'could', 'may', 'might', 'shall', 'should', 'must', 'ought', 'need', 'dare', 'to',
  'get', 'gets', 'got', 'gotten', 'getting', 'let', 'going', 'gon', 'used'])
// the pronouns that stand for one thing and take "does" and "has", not "do" and "have"
const SINGULAR_PRONOUN = new Set(['it', 'this', 'that', 'he', 'she', 'one', 'each', 'everything', 'something', 'anything', 'nothing',
  'everyone', 'everybody', 'someone', 'somebody', 'anyone', 'anybody', 'nobody'])
// the linking adverbs that put the next item of a sequence after the one before ("…, then make it red")
const SEQUENCE = new Set(['then', 'next'])
// A word opens commands when, of the sentences it opens in the raw text (at least LEAST_OPENINGS of
// them), a determiner or an object pronoun follows it in at least half (OPENER_SHARE): "plot" (251 of
// 358), "slide" (303 of 357), but not "legend" (0 of 343) or "line" (82 of 260).
const opensCommands = word => {
  const [first, before] = OPENINGS[word] ?? [0, 0]
  return first >= LEAST_OPENINGS && before >= OPENER_SHARE * first
}
// A word is an adjective by where the raw text puts it (describing-words.mjs, learn-describing.mjs):
// between a determiner and its noun in at least nine of ten of its uses after a determiner, with a
// plural in no more than one of twenty of its uses, and alone after "it", "them" or a form of "be" at
// least three times: "orange" (1,628 before a noun, 27 ending the nominal, 39 alone, plural 1 in
// 4,167), "olive", "amber"; not "bar" (no use alone, 3,200 plurals), "font" or "heading" (none alone).
const DESCRIBING_SHARE = 0.9, PLURAL_SHARE = 0.05, LEAST_ALONE = 3
const describes = word => {
  const [before, ending, alone, all, plural] = USES[word] ?? [0, 0, 0, 0, 0]
  return before + ending >= LEAST_USES && before >= DESCRIBING_SHARE * (before + ending) && plural <= PLURAL_SHARE * all && alone >= LEAST_ALONE
}
// A word is a noun by where the raw text puts it: after a determiner at least nine times for each time it
// stands after "to", a subject pronoun or a modal ("heading" 1,887 to 1; not "move", 99 to 658).
const NOUN_RATIO = 9
const names = word => {
  const [, , , , , determined, verbal] = USES[word] ?? [0, 0, 0, 0, 0, 0, 0]
  return determined >= LEAST_USES && determined >= NOUN_RATIO * verbal
}
// Commands rarely follow "to" or a pronoun, so a command verb may pass that test ("colour": 1,694 to 30). A
// word opens no command when, besides, a determiner or an object pronoun follows it in fewer than one in
// twenty of the sentences it opens (NOUN_OPENER_SHARE): "node" (0 of 20), "rectangle" (0 of 10), "legend"
// (0 of 343); not "colour" (120 of 419) or "book" (22 of 186).
const NOUN_OPENER_SHARE = 0.05
const opensNouns = word => {
  const [first, before] = OPENINGS[word] ?? [0, 0]
  return names(word) && first >= LEAST_OPENINGS && before < NOUN_OPENER_SHARE * first
}

/**
 * @param units the units of `unitsOf` (strategies/neural-dependencies/syntax-circuit.mjs);
 * their `pos`, `tag`, `lemma`, `head` and `dep` are corrected in place.
 * @returns the number of units changed
 */
export function repairWords(units) {
  const under = unit => units.filter(part => part.head === unit.index && part !== unit && part.word)
  // the first and the last word that hang on a unit, directly or not
  const lastOf = (unit, depth = 0) => depth > 60 ? unit.index : Math.max(unit.index, ...under(unit).map(part => lastOf(part, depth + 1)))
  const firstOf = (unit, depth = 0) => depth > 60 ? unit.index : Math.min(unit.index, ...under(unit).map(part => firstOf(part, depth + 1)))
  // does a unit hang on another, directly or not?
  const within = (unit, top) => {
    for (let at = unit, steps = 0; steps <= units.length; steps++) {
      if (at === top) return true
      if (at.head === at.index) return false
      at = units[at.head]
    }
    return false
  }
  const capitalised = unit => /^\p{Lu}/u.test(unit.value) && !/^\p{Lu}+$/u.test(unit.value)
  const verbal = unit => unit.pos === 'VERB' || unit.pos === 'AUX'
  // the mark directly before a word, if any
  const markBefore = unit => units[unit.index - 1] && !units[unit.index - 1].word ? units[unit.index - 1] : null
  // a mark that ends a sentence; a hyphen or two with a space on each side is a dash
  const dash = mark => /^-{1,2}$/u.test(mark.value) && units[mark.index - 1]?.end < mark.start && units[mark.index + 1]?.start > mark.end
  const ends = (mark, signs) => Boolean(mark) && !mark.word && ([...mark.value].some(sign => signs.has(sign)) || signs.has(mark.value) || dash(mark))
  // the first word of a sentence: the first of the message after any words said to the listener
  // ("hey, Move it"), or the first after a mark that ends a sentence
  const opensSentence = unit => !units.slice(0, unit.index).some(other => other.word && other.pos !== 'INTJ' && other.dep !== 'intj') ||
    ends(markBefore(unit), SENTENCE_END)
  let changed = 0

  // 1. English writes a verb or an adjective with a small letter inside a sentence; a capital marks a
  //    name. A word tagged as the base form of a verb, or as an adjective that describes no noun,
  //    that is capitalised, does not open its sentence and takes nothing a verb takes is a name:
  //    "from Start to Review", "link Plan to Build", "make Valid? a rounded rectangle". One with an
  //    object of its own opens words that are quoted without quotation marks ("notes Bring draft"). So is
  //    a capitalised participle that the parser hung where a nominal stands ("book Room 2 for Planning").
  const NOMINAL_PLACE = new Set(['pobj', 'dobj', 'nsubj', 'nsubjpass', 'attr', 'appos', 'compound', 'npadvmod'])
  for (const unit of units) {
    const verbForm = unit.pos === 'VERB' && (['VB', 'VBP'].includes(unit.tag) || ['VBG', 'VBN', 'VBD'].includes(unit.tag) && NOMINAL_PLACE.has(unit.dep))
    const adjective = unit.pos === 'ADJ' && !['amod', 'compound', 'nmod', 'conj'].includes(unit.dep)
    if (!unit.word || unit.quoted || !verbForm && !adjective) continue
    if (!capitalised(unit) || opensSentence(unit)) continue
    // The "to" of an infinitive alone makes no verb of a capitalised word: "to" is then the preposition
    // before a name ("draw an arrow from Draft to Review", "link Plan to Build").
    const parts = under(unit)
    const to = parts.length === 1 && verbForm && parts[0].index === unit.index - 1 && parts[0].lower === 'to' && parts[0].tag === 'TO' && parts[0].dep === 'aux' && unit.head !== unit.index ? parts[0] : null
    if (!to && parts.some(part => VERB_ONLY.has(part.dep))) continue
    unit.pos = 'PROPN'
    unit.tag = 'NNP'
    unit.lemma = unit.lower
    if (to) {
      to.pos = 'ADP'
      to.tag = 'IN'
      to.dep = 'prep'
      to.head = unit.head
      unit.head = to.index
      unit.dep = 'pobj'
    }
    changed++
  }
  // A particle is one short word written apart from its verb ("set up the chart"). Words joined by a
  // hyphen form a compound word, a noun or a name, never a particle: "change a circle Follow-up", where
  // the parser read the "up" of the compound as the particle of "change". With a capital inside a
  // sentence the compound is a name, which rule 3 ties to the noun before it.
  for (const unit of units) {
    if (!unit.word || unit.quoted || unit.word[1] === unit.word[0] || unit.dep !== 'prt') continue
    const name = capitalised(unit) && !opensSentence(unit)
    unit.pos = name ? 'PROPN' : 'NOUN'
    unit.tag = name ? 'NNP' : 'NN'
    unit.dep = 'dep'
    unit.lemma = unit.lower
    changed++
  }

  // 2. A command opens with its verb. A sentence or a clause after a comma that has no verb, and
  //    whose first word stands directly before a word that a noun cannot be followed by inside one
  //    nominal (a determiner, a pronoun, a name), opens with a verb that the tagger read as a noun:
  //    "tint the Intro node orange", "dissolve Process", "scrap End and e1". A word the tagger
  //    did read as a base form of a verb opens a command whatever follows it ("set r1 width 180").
  //    A plural is no base form ("lines Revenue"): a word that ends in a single -s ("series") is
  //    left alone, as is a capitalised first word before a capitalised one, which opens a name
  //    ("Roadmap Rough — add a document"). After a colon or a semicolon a word before a name is a
  //    label with its value ("Budget table: header Item, Cost; row Paper, 12").
  for (const first of units) {
    if (!first.word || first.quoted || !NOT_A_CLAUSE.has(first.dep) || first.head === first.index && verbal(first)) continue
    // a clause after a comma may open with a linking word of sequence before its verb ("…, next coat every edge")
    const linking = other => other.word && SEQUENCE.has(other.lower) && other.dep === 'advmod' && !under(other).length && ends(markBefore(other), CLAUSE_END)
    const before = units.slice(0, first.index).reverse().find(other => other.word && !(linking(other) && other.index === first.index - 1) || ends(other, CLAUSE_END))
    if (before?.word) continue
    if (/^\p{Lu}/u.test(first.value) && !opensSentence(first)) continue
    // the clause: the words up to the next mark that ends a clause; a participle that describes a noun
    // ("with cracked ice") is no verb of the clause
    const end = units.findIndex(other => other.index > first.index && ends(other, CLAUSE_END))
    const stretch = units.slice(first.index, end < 0 ? units.length : end).filter(other => other.word)
    if (stretch.some(other => other !== first && verbal(other) && other.dep !== 'amod')) continue
    const next = units[first.index + 1]
    const baseVerb = first.pos === 'VERB' && (first.tag === 'VB' || first.tag === 'VBP' || first.lower === first.lemma)
    const nounLike = ['NOUN', 'PROPN', 'X', 'ADJ'].includes(first.pos) && !['NNS', 'NNPS'].includes(first.tag) && !/(?<![sui])s$/u.test(first.lower)
    // A word that the raw text shows opening commands is the verb before the noun that would be its
    // object, as a base form is: "plot sales by month", "slide box n2 x 670", "trade places for the boy",
    // also with the capital that opens a sentence ("Chart revenue against order date"); and alone ("flip"),
    // it is a command of one word. A pair the raw text writes after a determiner is
    // one nominal ("the chart title"), and an adjective before a noun describes it ("empty box").
    const learned = nounLike && first.pos !== 'ADJ' && opensCommands(first.lower) && (stretch.length === 1 && first.head === first.index && opensSentence(first) ||
      next?.word && ['NOUN', 'PROPN'].includes(next.pos) && (!capitalised(first) || opensSentence(first) && !capitalised(next)) && !NOMINAL_PAIRS.has(first.lower + ' ' + next.lower))
    if (learned && stretch.length === 1) {
      first.pos = 'VERB'
      first.tag = 'VB'
      first.lemma = first.lower
      changed++
      continue
    }
    if (!next?.word || stretch.length < 2) continue
    // a numeral written as a word before a small-lettered noun counts that noun and opens its nominal
    // ("position one circle Proposal"); a number after a noun, written in figures, labels it ("block 2")
    const after = units[first.index + 2]
    const counts = next.pos === 'NUM' && /^\p{Ll}+$/u.test(next.value) && after?.word && after.pos === 'NOUN' && !capitalised(after)
    const closes = ['DT', 'PDT', 'PRP$'].includes(next.tag) || next.pos === 'PRON' && !SUBJECT.has(next.dep) || counts ||
      capitalised(next) && next.pos !== 'VERB' && !/^\p{Lu}/u.test(first.value) && !/[:;]/u.test(markBefore(first)?.value ?? '')
    if (!baseVerb && !(nounLike && closes) && !learned || opensNouns(first.lower)) continue
    // the word the clause hangs from in the parse: the verb takes its place, and it becomes the object
    const inside = new Set(stretch)
    let top = first
    for (let steps = 0; top.head !== top.index && inside.has(units[top.head]) && steps < units.length; steps++) top = units[top.head]
    first.pos = 'VERB'
    first.tag = 'VB'
    first.lemma = first.lower
    // a determiner or numeral the parser hung on the first word belongs to the noun right after it
    // ("position one doughnut Second Pass"): a verb takes neither before its object
    for (const part of under(first)) {
      if (part.index <= first.index || !NOMINAL_INSIDE.has(part.dep) || under(part).length) continue
      const noun = under(first).find(other => other.index === part.index + 1 && NOMINAL.has(other.pos) && NOT_A_CLAUSE.has(other.dep))
      if (noun) part.head = noun.index
    }
    if (top === first) {
      // the object is the nominal that follows the verb; a bare noun right after it still belongs to it
      // ("undo the last document edit")
      const run = []
      for (const part of under(first).filter(part => part.index > first.index).sort((a, b) => a.index - b.index)) {
        if (firstOf(part) !== (run.length ? lastOf(run.at(-1)) : first.index) + 1 || !NOMINAL.has(part.pos) || !NOT_A_CLAUSE.has(part.dep) && part.dep !== 'pobj') break
        if (run.length && firstOf(part) !== part.index) break
        run.push(part)
      }
      const object = run.at(-1)
      if (object) object.dep = 'dobj'
      for (const part of run.slice(0, -1)) { part.head = object.index; part.dep = 'compound' }
    } else {
      // a nominal the parser already hung on the first word is an object of its own (rule 3 ties a name after it)
      const object = under(first).find(part => part.index > first.index && part.index < top.index && NOT_A_CLAUSE.has(part.dep) && NOMINAL.has(part.pos))
      first.head = top.head === top.index ? first.index : top.head
      first.dep = top.head === top.index ? 'ROOT' : top.dep
      top.head = first.index
      top.dep = 'dobj'
      if (object) object.dep = 'dobj'
      // the words a verb cannot take before a noun belong to that noun
      else for (const part of under(first)) if (part.index > first.index && part.index < top.index && NOMINAL_INSIDE.has(part.dep)) part.head = top.index
    }
    changed++
  }

  // 3. A name or a number right after a noun names or numbers that noun ("add a person Hub Core",
  //    "an object Draft 400"; docs/syntax-schema.md, Rule 5.5). A group of capitalised words and
  //    numbers, with no determiner, that directly follows a nominal headed by a common noun and that
  //    the parser hung on the same verb, is tied to that noun when that nominal brings in a new
  //    thing (an indefinite article or a numeral). After a thing already known ("name the object
  //    Findings", "make the bar spacing 0.8") the name or number is what the verb gives it, and both
  //    stay complements of the verb.
  const named = (unit, depth = 0) => depth < 60 && unit.word && !unit.quoted && (capitalised(unit) || unit.pos === 'NUM') && !verbal(unit) &&
    under(unit).every(part => named(part, depth + 1))
  for (const verb of units) {
    if (!verb.word || !verbal(verb)) continue
    const parts = under(verb)
    for (const noun of parts) {
      if (noun.pos !== 'NOUN' || capitalised(noun) || !['dobj', 'dative', 'nsubj', 'attr', 'oprd'].includes(noun.dep)) continue
      if (!under(noun).some(part => INDEFINITE.has(part.lower) || part.dep === 'nummod')) continue
      // directly after the noun's last word, with no mark between
      const name = parts.find(part => part !== noun && firstOf(part) === lastOf(noun) + 1 && NAMING.has(part.dep) && named(part))
      if (!name) continue
      name.head = noun.index
      name.dep = 'appos'
      changed++
    }
  }

  //    English puts a name after the common noun it names, and the determiner before that noun ("a
  //    person Hub Core"). A nominal whose head is a name or a number, whose words before the head are a
  //    determiner or numeral, then one small-lettered word, then only capitalised words and numbers, is
  //    that word with its name: "add a cirrcle Rough Take 2", "make one quote Plan Backup", "add a fihs
  //    260 400". The small-lettered word is the head, tied to the name after it; a word the tagger read
  //    as an adjective ("a new Draft") describes the name and is left alone.
  for (const head of units) {
    // (a plural is no name: "the part IDs")
    if (!head.word || head.quoted || !(capitalised(head) || head.pos === 'NUM') || ['NNS', 'NNPS'].includes(head.tag) || head.head === head.index && !under(head).length) continue
    const before = under(head).filter(part => part.index < head.index).sort((a, b) => a.index - b.index)
    const [determiner, noun, ...rest] = before
    if (!determiner || !noun || !['DT', 'CD'].includes(determiner.tag) || determiner.index !== firstOf(head) || noun.index !== determiner.index + 1) continue
    if (noun.quoted || capitalised(noun) || !/^\p{L}+$/u.test(noun.value) || !['NOUN', 'X', 'INTJ'].includes(noun.pos) || under(noun).length) continue
    if (rest.some(part => !named(part)) || units.slice(noun.index + 1, head.index).some(other => !other.word || !named(other))) continue
    noun.pos = 'NOUN'
    noun.tag = 'NN'
    noun.head = head.head === head.index ? noun.index : head.head
    noun.dep = head.head === head.index ? 'ROOT' : head.dep
    determiner.head = noun.index
    head.head = noun.index
    head.dep = 'appos'
    changed++
  }

  // 4. A preposition is no word of a nominal: between two numbers it marks how the second stands to
  //    the first ("180 by 90", "characters 4 to 9"). The parser may hang the three words together as
  //    one quantity; the first number then stands where the second stood, and the preposition marks
  //    a relation from it to the second. Numbers that count a noun after them ("3 by 5 inches") are
  //    left as they are.
  for (const marker of units) {
    const left = units[marker.index - 1], right = units[marker.index + 1]
    if (!marker.word || !['ADP', 'PART'].includes(marker.pos) || !left?.word || !right?.word || left.pos !== 'NUM' || right.pos !== 'NUM') continue
    if (marker.head !== right.index || ![right.index, right.head].includes(left.head) || right.head === right.index) continue
    if (NOMINAL_INSIDE.has(right.dep) && right.head > right.index) continue
    left.head = right.head
    left.dep = right.dep
    marker.head = left.index
    marker.dep = 'prep'
    right.head = marker.index
    right.dep = 'pobj'
    changed++
  }
  //    A preposition that governs an object marks a relation, whatever relation the parser hung it by:
  //    "keep the birds on the fence", where "on" was hung on "keep" as the predicate of its object. One
  //    the parser hung by no named relation on the nominal right after it marks that nominal: "how about
  //    small marker size?".
  for (const marker of units) {
    if (!marker.word || marker.quoted || marker.pos !== 'ADP' || marker.head === marker.index) continue
    if (['oprd', 'attr', 'acomp', 'dobj'].includes(marker.dep) && under(marker).some(part => part.dep === 'pobj' && part.index > marker.index)) {
      marker.dep = 'prep'
      changed++
    } else if (marker.dep === 'dep' && !under(marker).length && marker.head > marker.index && NOMINAL.has(units[marker.head].pos) &&
        units.slice(marker.index + 1, marker.head).every(other => other.word && within(other, units[marker.head]))) {
      marker.dep = 'mark'
      changed++
    }
  }

  // 5. "of" completes the word directly before it: "left of the hill", "two of them". A phrase marked
  //    "of" that the parser hung past that word, on the word that word itself describes, belongs to
  //    it ("a boy just left of the woman": "of the woman" goes with "left", not with "a boy"). And
  //    "left", the past form of "leave", is no verb there: "leave" takes no phrase marked "of", so
  //    "left" before one is the word of direction ("a gazelle left of the hill").
  for (const unit of units) {
    const next = units[unit.index + 1]
    if (!unit.word || unit.lower !== 'left' || unit.pos !== 'VERB' || !next?.word || next.lower !== 'of' || next.head !== unit.index) continue
    unit.pos = 'ADV'
    unit.tag = 'RB'
    unit.lemma = unit.lower
    if (unit.dep === 'acl' || unit.dep === 'relcl') unit.dep = 'advmod'
    changed++
  }
  //    Nor is "left" a verb when the word of motion before it is one the tagger read as a noun: a word
  //    that the parser hung on "left" by no named relation, directly before it or first in its sentence
  //    ("let the man face left", "shift the first and second figures left"), or a bare noun that opens
  //    its clause and on which the parser hung "left" ("the big cat: face left"), is the verb, and "left"
  //    says where it goes. The verb takes the place of "left" in the parse; a nominal before "left" that
  //    the parser made its subject is the object of the verb, and the noun "left" was said to describe
  //    ("make the bird ... face left") is the subject of the verb, which completes the verb above.
  for (const left of units) {
    if (!left.word || left.lower !== 'left' || left.pos !== 'VERB' || !['VBD', 'VBN'].includes(left.tag)) continue
    if (under(left).some(part => part.dep === 'aux' || part.dep === 'auxpass' || part.dep === 'mark' || part.pos === 'PRON' && SUBJECT.has(part.dep))) continue
    const previous = units[left.index - 1]
    const unplaced = under(left).find(part => part.dep === 'dep' && part.index < left.index && !part.quoted && ['NOUN', 'X', 'VERB'].includes(part.pos) &&
      (part === previous || firstOf(part) === part.index && opensSentence(part)))
    const bare = !unplaced && previous?.word && left.head === previous.index && ['acl', 'relcl'].includes(left.dep) && previous.pos === 'NOUN' &&
      !under(previous).some(part => part !== left) && ends(markBefore(previous), SENTENCE_END)
    const verb = unplaced ?? (bare ? previous : null)
    if (!verb) continue
    verb.pos = 'VERB'
    verb.tag = 'VB'
    verb.lemma = verb.lower
    if (bare) {
      // the bare noun was set beside the nominal before the mark: it opens a clause of its own
      verb.dep = 'parataxis'
    } else {
      const described = ['acl', 'relcl'].includes(left.dep) && left.head !== left.index ? units[left.head] : null
      if (described && described.head !== described.index && verbal(units[described.head])) {
        verb.head = described.head
        verb.dep = described.dep === 'dobj' ? 'ccomp' : described.dep
        described.head = verb.index
        described.dep = 'nsubj'
      } else {
        verb.head = left.head === left.index ? verb.index : left.head
        verb.dep = left.head === left.index ? 'ROOT' : left.dep
      }
      for (const part of under(left)) if (part !== verb && part.index < left.index) { part.head = verb.index; if (SUBJECT.has(part.dep)) part.dep = 'dobj' }
      // a noun the parser hung on the verb as a word of its nominal, before it, names who moves when the
      // verb completes another ("let the man face left"): its subject
      for (const part of under(verb)) if (part.index < verb.index && part.dep === 'compound' && NOMINAL.has(part.pos)) part.dep = ['ccomp', 'xcomp'].includes(verb.dep) ? 'nsubj' : 'dobj'
    }
    left.head = verb.index
    left.dep = 'advmod'
    left.pos = 'ADV'
    left.tag = 'RB'
    left.lemma = left.lower
    changed++
  }
  for (const marker of units) {
    const before = units[marker.index - 1]
    if (!marker.word || marker.lower !== 'of' || marker.dep !== 'prep' || !before?.word || marker.head === before.index) continue
    if (before.head !== marker.head || !['ADV', 'ADJ'].includes(before.pos)) continue
    marker.head = before.index
    changed++
  }

  // 6. "me", "us", "him", "them" and the "'s" of "let's" are the object forms of the personal
  //    pronouns: none is a subject. One that the parser made the subject of a verb that completes the
  //    verb before the pronoun ("let's go", "make them stay") is the object of that verb.
  for (const pronoun of units) {
    if (!pronoun.word || pronoun.tag !== 'PRP' || !OBJECT_FORM.has(pronoun.lower) || !SUBJECT.has(pronoun.dep)) continue
    const verb = units[pronoun.head], governor = units[verb.head]
    if (!['ccomp', 'xcomp'].includes(verb.dep) || !verbal(governor) || !(governor.index < pronoun.index && pronoun.index < verb.index)) continue
    pronoun.head = governor.index
    pronoun.dep = 'dobj'
    changed++
  }

  // 7. "else" belongs to the pronoun or question word directly before it: "everything else", "what else".
  for (const unit of units) {
    const before = units[unit.index - 1]
    if (!unit.word || unit.lower !== 'else' || !before?.word || !(before.pos === 'PRON' || /^W/u.test(before.tag)) || unit.head === before.index) continue
    unit.head = before.index
    unit.dep = 'amod'
    changed++
  }

  // 8. In "from now on", "from here on" the preposition governs the adverb after it, and the particle
  //    that closes the phrase stays with the preposition, as a word that grades it. The parser may
  //    make the particle the object, with the adverb hung on it.
  for (const marker of units) {
    const adverb = units[marker.index + 1], particle = units[marker.index + 2]
    if (!marker.word || marker.pos !== 'ADP' || !adverb?.word || !particle?.word || marker.head === marker.index) continue
    if (particle.head !== marker.index || !['pobj', 'pcomp'].includes(particle.dep) || !['ADV', 'ADP'].includes(particle.pos) || under(particle).length !== 1) continue
    if (adverb.head !== particle.index || adverb.dep !== 'advmod') continue
    adverb.head = marker.index
    adverb.dep = 'pobj'
    particle.dep = 'advmod'
    changed++
  }

  //    A word describes the word after it only with nothing between them. A word right before a comma
  //    that the parser hung on the word after ", not" ("the cloud is small, not big", "keep the corner
  //    rounded, not sharp") is what the clause says, and the negated word after it is set against it:
  //    the first takes the place of the second, and the second is joined to it.
  for (const negation of units) {
    const comma = units[negation.index - 1], word = units[negation.index + 1], first = units[negation.index - 2]
    if (!negation.word || negation.dep !== 'neg' || !word?.word || negation.head !== word.index || comma?.value !== ',' || !first?.word) continue
    if (first.head !== word.index || !['amod', 'advmod', 'compound'].includes(first.dep) || first.pos !== word.pos || !['ADJ', 'ADV'].includes(word.pos)) continue
    first.head = word.head === word.index ? first.index : word.head
    first.dep = word.head === word.index ? 'ROOT' : word.dep
    for (const part of under(word)) if (part.index < first.index) part.head = first.index
    word.head = first.index
    word.dep = 'conj'
    changed++
  }

  //    A determiner opens a nominal that runs to the word it determines: a word between the two that
  //    the parser hung on that word as an interjection or by no named relation ("change a teaar cheek
  //    purple big", "change a scra cheek tiny") is a word of the nominal, a noun when it was read as an
  //    interjection or a foreign word.
  for (const unit of units) {
    if (!unit.word || unit.quoted || !['dep', 'intj'].includes(unit.dep) || unit.head <= unit.index || under(unit).length) continue
    const head = units[unit.head]
    if (!under(head).some(part => part.dep === 'det' && part.index < unit.index) || units.slice(unit.index + 1, head.index).some(other => !other.word)) continue
    if (['INTJ', 'X'].includes(unit.pos)) { unit.pos = 'NOUN'; unit.tag = 'NN' }
    if (!['NOUN', 'PROPN', 'ADJ', 'NUM'].includes(unit.pos)) continue
    unit.dep = unit.pos === 'ADJ' ? 'amod' : 'compound'
    changed++
  }

  // 9. The head of a nominal is a noun, and an adjective stands before the noun it describes. An
  //    adjective that the parser made the head of the nouns directly before it ("a pipe neck tiny",
  //    "bar border thin") says how the thing those nouns name is: the last noun is the head, and the
  //    adjective is said of it, as a word of the clause when a verb takes the nominal (Rule 5). After
  //    a preposition a noun before an adjective names a shade or a kind of it ("down to moss green")
  //    and is left alone. The tagger may read such an adjective as a noun ("tint the Intro node
  //    orange", "change a dott eye blue"); the raw text shows it to be one (describing-words.mjs).
  for (const adjective of units) {
    const describing = adjective.pos === 'ADJ' && /^JJ/u.test(adjective.tag) || adjective.pos === 'NOUN' && adjective.tag === 'NN' && describes(adjective.value)
    if (!adjective.word || adjective.quoted || !describing || adjective.head === adjective.index || adjective.dep === 'pobj') continue
    const noun = units[adjective.index - 1]
    if (!noun?.word || noun.head !== adjective.index || noun.dep !== 'compound' || !['NOUN', 'PROPN'].includes(noun.pos)) continue
    const governor = units[adjective.head]
    noun.head = adjective.head
    noun.dep = adjective.dep
    for (const part of under(adjective)) if (part.index < adjective.index) part.head = noun.index
    if (verbal(governor)) { adjective.head = governor.index; adjective.dep = 'oprd' } else { adjective.head = noun.index; adjective.dep = 'amod' }
    if (adjective.pos === 'NOUN') { adjective.pos = 'ADJ'; adjective.tag = 'JJ' }
    changed++
  }

  // 10. A noun has no subject, and a determiner opens a nominal that runs to its last noun. A common
  //     noun that the parser made the subject of the common noun directly after it, which has no
  //     determiner of its own, forms one nominal with it when that noun is itself a subject or is
  //     followed by the adjective said of it: "the marker borders should be thicker", "make the title
  //     colour olive". Alone after the first noun the second may be what the first is made ("make the
  //     style dashes"), and the two are left apart.
  for (const noun of units) {
    const next = units[noun.index + 1]
    if (!noun.word || noun.pos !== 'NOUN' || noun.dep !== 'nsubj' || !next?.word || noun.head !== next.index || next.pos !== 'NOUN') continue
    if (capitalised(noun) || capitalised(next) || under(next).some(part => ['det', 'poss', 'nummod'].includes(part.dep) && part.index < next.index)) continue
    if (!SUBJECT.has(next.dep) && !under(next).some(part => part.pos === 'ADJ' && part.index > next.index)) continue
    noun.dep = 'compound'
    changed++
  }

  // 11. A clause has a verb. A noun with no verb that the parser hung on a verb as the clause it takes
  //     ("make Cake orange": "orange" a clausal complement of "make", "Cake" its subject or a word of it)
  //     is the second of the two words such a verb takes: the noun before it is the object, and the last
  //     word, small-lettered and with nothing after it, says what the object is made, as "red" does in
  //     "make the box red" (a modifier of the clause).
  for (const word of units) {
    // (a word with a digit is a label: "make the line e1 to look better")
    if (!word.word || word.quoted || word.pos !== 'NOUN' || capitalised(word) || !/^\p{L}+$/u.test(word.value) || !['ccomp', 'xcomp'].includes(word.dep)) continue
    const verb = units[word.head], object = units[word.index - 1]
    if (!verbal(verb) || verb.index > word.index || under(word).some(part => part.index > word.index)) continue
    if (!object?.word || object.head !== word.index || !['compound', 'nsubj'].includes(object.dep) || !NOMINAL.has(object.pos)) continue
    // the words before the object are words of it ("make the flag orange"); a second nominal there makes
    // the last word a noun said of a thing ("make it an artillery shell") and the parse is left as it is
    const others = under(word).filter(part => part !== object)
    if (others.some(part => !NOMINAL_INSIDE.has(part.dep) || NOMINAL.has(part.pos) || part.index > object.index)) continue
    for (const part of others) part.head = object.index
    object.head = verb.index
    object.dep = 'dobj'
    word.pos = 'ADJ'
    word.tag = 'JJ'
    word.dep = 'oprd'
    changed++
  }

  // 12. A singular common noun needs a determiner to name a thing ("a box", "the box"); one standing
  //     bare, with nothing of its own, right after the object of a verb, is no second thing the verb
  //     takes but what the object is made, as an adjective is: "change a raised eyebrow pink", "now
  //     switch the colour of it black" (a modifier of the clause, Rule 5). After a pronoun the bare noun
  //     is the name a verb of naming gives ("call it bird"); that, a plural ("make the style dashes"), a
  //     name, or a word with a figure ("make the line e1") is left alone.
  for (const word of units) {
    if (!word.word || word.quoted || word.pos !== 'NOUN' || word.tag !== 'NN' || capitalised(word) || !/^\p{L}+$/u.test(word.value) || under(word).length) continue
    const verb = units[word.head]
    if (!verbal(verb) || !['dobj', 'oprd', 'attr', 'appos'].includes(word.dep) || verb.index > word.index) continue
    const object = under(verb).find(part => part !== word && part.dep === 'dobj' && part.index < word.index && lastOf(part) === word.index - 1)
    // the last word of its clause: before a phrase of its own it names a thing ("replace Sales table with …")
    if (!object || !NOMINAL.has(object.pos) || object.pos === 'PRON' || units[word.index + 1]?.word) continue
    word.pos = 'ADJ'
    word.tag = 'JJ'
    word.dep = 'oprd'
    changed++
  }

  //    A numeral, like a determiner, opens the nominal of the thing it counts. A numeral the parser made
  //    the object of a verb, with only adjectives after it, directly followed by the words of a nominal
  //    that the parser hung on the same verb, counts that nominal: "make one dotted Status Summary
  //    Follow-up" is one nominal, not "one" and "Status Summary Follow-up" side by side.
  for (const number of units) {
    if (!number.word || number.pos !== 'NUM' || number.dep !== 'dobj' || !verbal(units[number.head])) continue
    const parts = under(number)
    if (!parts.length || parts.some(part => part.index < number.index || part.pos !== 'ADJ' || part.dep !== 'amod' || under(part).length)) continue
    const end = lastOf(number), verb = units[number.head]
    const noun = under(verb).find(part => part !== number && firstOf(part) === end + 1 && ['NOUN', 'PROPN'].includes(part.pos) && part.index > end && ['dep', 'dobj', 'npadvmod', 'appos', 'oprd'].includes(part.dep))
    if (!noun || units.slice(end + 1, noun.index).some(other => !other.word || !within(other, noun))) continue
    noun.dep = 'dobj'
    number.head = noun.index
    number.dep = 'nummod'
    for (const part of parts) part.head = noun.index
    changed++
  }

  // 13. An apposition renames the nominal before it ("the node Intro", "Ana, my friend"), so it brings in
  //     no new thing. A nominal set after a comma that brings in a new thing (an indefinite article or a
  //     numeral), after a nominal that brings in a new thing too, renames nothing: it is the next item of
  //     a list, joined to the one before ("draw four sandboxes in the corners, four small kids facing
  //     right, a medium coach…"). It follows the words of that nominal directly; after a colon or a dash
  //     the words say what the thing before is made of ("a bakery at dawn: a dough ball, a rolling pin…",
  //     "one more thing — a tire") and stay apart. One opened by a linking adverb of sequence ("start with
  //     a large stove on the left, then a medium chef facing left") is the next thing the clause does: it
  //     hangs on the verb of that clause beside it, as the later items of such a series do.
  const newThing = unit => under(unit).some(part => part.index < unit.index && (INDEFINITE.has(part.lower) || part.dep === 'nummod' || part.pos === 'NUM'))
  const sequenceBefore = unit => {
    const word = units[firstOf(unit) - 1]
    return word?.word && SEQUENCE.has(word.lower) && word.dep === 'advmod' && !under(word).length && ends(markBefore(word), CLAUSE_END) ? word : null
  }
  // the word before the comma is a word of the nominal, not of a clause the parser hung on it ("a cat near
  // the bench, then creep the man…, barely a movement"); a participle that describes it is part of it
  const follows = (word, item) => {
    for (let at = word, steps = 0; at && steps <= units.length; at = units[at.head], steps++) {
      if (at === item) return true
      if (at.head === at.index || verbal(at) && !['acl', 'relcl', 'amod', 'advcl'].includes(at.dep)) return false
    }
    return false
  }
  for (const unit of units) {
    if (!unit.word || unit.quoted || unit.dep !== 'appos' || !['NOUN', 'PROPN'].includes(unit.pos) || unit.head > unit.index) continue
    const item = units[unit.head]
    if (!['NOUN', 'PROPN', 'NUM'].includes(item.pos)) continue
    if (sequenceBefore(unit)) {
      let verb = item
      for (let steps = 0; verb.head !== verb.index && !(verbal(verb) && !['acl', 'relcl', 'amod'].includes(verb.dep)) && steps < units.length; steps++) verb = units[verb.head]
      if (verbal(verb) && !['acl', 'relcl', 'amod'].includes(verb.dep)) { unit.head = verb.index; unit.dep = 'dep' } else unit.dep = 'conj'
      changed++
    } else if (markBefore(units[firstOf(unit)])?.value === ',' && newThing(unit) && newThing(item) && follows(units[firstOf(unit) - 2], item)) {
      unit.dep = 'conj'
      changed++
    }
  }
  //     Like joins like. A participle with a subject of its own that the parser joined to a noun ("with the
  //     legend in the corner and the callout pointing at the front layer") joins its subject to that noun,
  //     and describes the subject.
  for (const unit of units) {
    if (!unit.word || unit.dep !== 'conj' || !verbal(unit) || !['VBG', 'VBN'].includes(unit.tag) || unit.head > unit.index) continue
    const noun = units[unit.head], subject = under(unit).find(part => SUBJECT.has(part.dep) && part.index < unit.index && ['NOUN', 'PROPN'].includes(part.pos))
    if (!['NOUN', 'PROPN'].includes(noun.pos) || !subject || under(unit).some(part => part.dep === 'aux' || part.dep === 'auxpass')) continue
    subject.head = noun.index
    subject.dep = 'conj'
    unit.head = subject.index
    unit.dep = 'acl'
    changed++
  }
  //     A phrase that places a thing may stand before it, set off by commas, when the thing is the next item
  //     of a list: in "a large white sailboat in the middle, above the sailboat, two small white gulls" the
  //     gulls are above the sailboat, and in "…, next to the gate, a medium brown bench" the bench is next
  //     to the gate. The parser hangs such a phrase on the item before it. A phrase with a marker (a
  //     preposition, or a two-word preposition: "next to") set between a comma, or a comma
  //     and a conjunction, and the comma before a nominal that brings in a new thing and is the next item
  //     of the list belongs to that item.
  for (const item of units) {
    if (!item.word || item.quoted || !['NOUN', 'PROPN'].includes(item.pos) || !['conj', 'appos'].includes(item.dep) || item.head > item.index || !newThing(item)) continue
    const start = firstOf(item), comma = units[start - 1]
    if (comma?.value !== ',' || !units[start - 2]?.word) continue
    // the words between the comma before the item and the mark before them, after a conjunction there
    const open = units.slice(0, start - 1).findLast(other => !other.word)
    if (open?.value !== ',') continue
    const conjunction = units[open.index + 1]?.dep === 'cc' ? units[open.index + 1] : null
    const words = units.slice(open.index + (conjunction ? 2 : 1), start - 1)
    // one phrase: one word on which all the others hang
    const tops = words.filter(other => !words.includes(units[other.head]) || other.head === other.index)
    if (tops.length !== 1) continue
    const [phrase] = tops
    const marks = phrase.pos === 'ADP' && ['prep', 'conj'].includes(phrase.dep) && under(phrase).some(part => part.dep === 'pobj') ||
      phrase.dep === 'advmod' && under(phrase).some(part => part.dep === 'prep' && part.index === phrase.index + 1 && TWO_WORD_PREPOSITIONS.has(phrase.lower + ' ' + part.lower))
    if (!marks || phrase.head === phrase.index || phrase.head === item.index) continue
    phrase.head = item.index
    if (phrase.pos === 'ADP') phrase.dep = 'prep'
    changed++
  }
  //     A preposition governs a nominal, also when a word that says how that thing is follows it ("with her
  //     arms outstretched", "with campaign as the legend"), where the parser may make the nominal the
  //     subject of that word, and the word the object of the preposition or the preposition its
  //     subordinator. The nominal is what the preposition governs, and the word after it is said of it: an
  //     adjective describes it ("with outline gold", Rule 5), a second preposition marks a relation from
  //     it. (A participle with its subject is a clause, "with the man scowling", and a subordinator before
  //     a word that is no preposition opens a group of words of its own, "with the rest of the scene
  //     unchanged".)
  for (const marker of units) {
    if (!marker.word || marker.pos !== 'ADP' && marker.pos !== 'SCONJ' || !['mark', 'prep'].includes(marker.dep) || marker.head === marker.index) continue
    const said = marker.dep === 'mark' ? units[marker.head] : under(marker).find(part => part.dep === 'pcomp' && part.index > marker.index)
    if (!said || said.head === said.index || said.index < marker.index || marker.dep === 'mark' && said.pos !== 'ADP') continue
    const thing = under(said).find(part => SUBJECT.has(part.dep) && part.index > marker.index && part.index < said.index && ['NOUN', 'PROPN', 'PRON'].includes(part.pos))
    const kind = said.pos === 'ADJ' ? 'amod' : said.pos === 'ADP' ? 'prep' : null
    if (!thing || !kind || units.slice(marker.index + 1, said.index).some(other => !other.word)) continue
    // A word with a subject and a clause of its own heads a clause: it is a participle whatever its tag
    // ("with everything else left where it is"), and the group of words a clause the preposition governs.
    if (said.pos === 'ADJ' && under(said).some(part => ['advcl', 'ccomp', 'xcomp', 'relcl'].includes(part.dep))) {
      said.pos = 'VERB'
      said.tag = 'VBN'
      changed++
      continue
    }
    if (marker.dep === 'mark') { marker.head = said.head; marker.dep = 'prep'; marker.pos = 'ADP'; marker.tag = 'IN' }
    // what is joined to the word said of the first thing is a second such thing ("with the subject low and the title space clear")
    for (const part of under(said)) if (part.dep === 'conj' && ['NOUN', 'PROPN'].includes(part.pos) || part.dep === 'cc') part.head = thing.index
    thing.head = marker.index
    thing.dep = 'pobj'
    said.head = thing.index
    said.dep = kind
    changed++
  }
  //     The parser may also hang the earlier item, by no named relation, on the later one that "then" opens
  //     ("a red kite high in the sky, then in front of the tree a large boy facing left"): the earlier
  //     item takes the place of the later, and the later is joined to it.
  for (const unit of units) {
    if (!unit.word || unit.quoted || unit.dep !== 'dep' || !NOMINAL.has(unit.pos) || unit.head < unit.index) continue
    const later = units[unit.head]
    if (!['NOUN', 'PROPN'].includes(later.pos) || verbal(later)) continue
    const then = under(later).find(part => SEQUENCE.has(part.lower) && part.dep === 'advmod' && !under(part).length && part.index > lastOf(unit) &&
      ends(markBefore(part), CLAUSE_END) && units.slice(lastOf(unit) + 1, part.index).every(other => !other.word))
    if (!then) continue
    unit.head = later.head === later.index ? unit.index : later.head
    unit.dep = later.head === later.index ? 'ROOT' : later.dep
    later.head = unit.index
    later.dep = 'conj'
    changed++
  }

  // 14. An auxiliary agrees with its subject: "does" and "has" go with a singular subject, "do" and "have"
  //     with a plural one or with "I", "you", "we", "they"; and the auxiliary "do" takes the base form of a
  //     verb. A "do" or "have" that opens a sentence before a singular subject ("do that swap again", "do
  //     the callout arrow head bigger", "Have the legend switched on"), or a "do" before a verb form that is
  //     no base form ("do the callout arrows curved"), is no auxiliary there: it is the main verb of a
  //     command, and the nominal the parser made the subject is what it takes. After "do", which takes no
  //     verb with its object, the word the parser made the verb is the noun that ends that nominal when it
  //     follows it directly in its base form ("swap", "head"), and otherwise, a participle, what the object
  //     is made ("curved", as "thicker" in "do the grid lines thicker"); after "have" it stays the verb of
  //     the clause that "have" takes ("have everything come out", as "have the car face the house").
  for (const auxiliary of units) {
    if (!auxiliary.word || auxiliary.dep !== 'aux' || !['do', 'have'].includes(auxiliary.lower) || !opensSentence(auxiliary)) continue
    const verb = units[auxiliary.head]
    const subject = under(verb).find(part => part.dep === 'nsubj' && part.index > auxiliary.index)
    if (!verbal(verb) || verb.index < auxiliary.index || !subject || subject.index > verb.index) continue
    const singular = ['NN', 'NNP'].includes(subject.tag) && subject.pos !== 'PRON' || SINGULAR_PRONOUN.has(subject.lower)
    const base = verb.lower === verb.lemma
    if (!singular && !(auxiliary.lower === 'do' && !base)) continue
    const noun = auxiliary.lower === 'do' && base && lastOf(subject) === verb.index - 1
    if (auxiliary.lower === 'do' && base && !noun) continue
    auxiliary.pos = 'VERB'
    auxiliary.tag = 'VB'
    auxiliary.head = verb.head === verb.index ? auxiliary.index : verb.head
    auxiliary.dep = verb.head === verb.index ? 'ROOT' : verb.dep
    if (auxiliary.lower === 'have') {
      verb.head = auxiliary.index
      verb.dep = 'ccomp'
    } else {
      // what hangs on the word after it goes with "do": a word that says how the thing is made is said of it
      for (const part of under(verb)) {
        if (part === subject || part === auxiliary || part.index < verb.index) continue
        part.head = auxiliary.index
        if (part.dep === 'dobj' && part.pos === 'ADJ') part.dep = 'oprd'
      }
      if (noun) {
        for (const part of under(subject)) if (part.index < subject.index && ['det', 'predet', 'poss'].includes(part.dep)) part.head = verb.index
        verb.pos = 'NOUN'
        verb.tag = 'NN'
        verb.lemma = verb.lower
        verb.head = auxiliary.index
        verb.dep = 'dobj'
        subject.head = verb.index
        subject.dep = subject.pos === 'PRON' || subject.tag === 'DT' ? 'det' : 'compound'
        if (subject.dep === 'det') subject.pos = 'DET'
      } else {
        verb.pos = 'ADJ'
        verb.tag = 'JJ'
        verb.head = auxiliary.index
        verb.dep = 'oprd'
        subject.head = auxiliary.index
        subject.dep = 'dobj'
      }
    }
    changed++
  }

  // 14b. A command opens with its verb. A word that the raw text shows to open no commands (opensNouns), which
  //     the tagger read as a verb at the head of its sentence with nothing a verb takes after it, is a noun,
  //     and its sentence a group of words with no verb: "rectangle around the Alpha branch, please"
  //     ("rectangle": 777 after a determiner, 14 after "to", a pronoun or a modal; no determiner after it in
  //     the 10 sentences it opens). Rule 2 leaves such a word a noun before a name ("node Intro to 260, 240").
  for (const unit of units) {
    if (!unit.word || unit.quoted || unit.pos !== 'VERB' || !['VB', 'VBP'].includes(unit.tag) || unit.head !== unit.index || !opensSentence(unit)) continue
    if (!opensNouns(unit.lower) || under(unit).some(part => VERB_ONLY.has(part.dep))) continue
    unit.pos = 'NOUN'
    unit.tag = 'NN'
    unit.lemma = unit.lower
    changed++
  }

  // 15. The auxiliaries of English are a closed class: the forms of "be", "have" and "do", the modals and
  //     the "to" of an infinitive. A word outside it that the parser made the auxiliary of a verb, standing
  //     first in its sentence before that verb, is a word said to the listener: "Please make the legend
  //     moved right the standard choice". (A word tagged as a modal is one, however spelt: "couldy ou".)
  for (const unit of units) {
    if (!unit.word || unit.quoted || !['aux', 'auxpass'].includes(unit.dep) || unit.tag === 'MD' || unit.tag === 'TO' || unit.head < unit.index) continue
    if (AUXILIARY.has(unit.lemma) || AUXILIARY.has(unit.lower) || !opensSentence(unit) || under(unit).length) continue
    unit.pos = 'INTJ'
    unit.tag = 'UH'
    unit.dep = 'intj'
    changed++
  }

  // 16. "in" is a preposition and also the particle of a verb that brings a thing into the picture ("pop
  //     in", "bring in", "throw in"). The preposition places a thing the verb already takes ("drop the key
  //     in a box"); with no object of the verb before it, at the head of a command, before a nominal that
  //     brings in a new thing, "in" is the particle and that nominal is what the verb takes: "drop in a navy
  //     box under Load", "drop in a restaurant, would you".
  for (const verb of units) {
    if (!verb.word || !verbal(verb) || verb.tag !== 'VB' || !opensSentence(verb) || under(verb).some(part => ['dobj', 'dative', 'prt', ...SUBJECT].includes(part.dep))) continue
    const particle = units[verb.index + 1]
    if (!particle?.word || particle.lower !== 'in' || particle.head !== verb.index || particle.dep !== 'prep') continue
    const object = under(particle).find(part => part.dep === 'pobj' && firstOf(part) === particle.index + 1)
    if (!object || !['NOUN', 'PROPN'].includes(object.pos) || !newThing(object)) continue
    particle.pos = 'ADP'
    particle.tag = 'RP'
    particle.dep = 'prt'
    object.head = verb.index
    object.dep = 'dobj'
    changed++
  }

  // 17. The preposition "to" governs a nominal, and an adverb heads none. A "to" that the parser made a
  //     preposition governing an adverb right after a bare noun hung on that adverb ("turn the man by the
  //     house to face left") is the "to" of an infinitive: the noun is its verb, and the adverb says how
  //     the verb goes.
  for (const to of units) {
    if (!to.word || to.lower !== 'to' || to.dep !== 'prep' || to.head === to.index) continue
    const verb = units[to.index + 1], adverb = units[to.index + 2]
    if (!verb?.word || !adverb?.word || adverb.pos !== 'ADV' || adverb.head !== to.index || !['pcomp', 'pobj'].includes(adverb.dep)) continue
    if (verb.pos !== 'NOUN' || verb.head !== adverb.index || under(verb).length || under(adverb).some(part => part !== verb)) continue
    verb.pos = 'VERB'
    verb.tag = 'VB'
    verb.lemma = verb.lower
    verb.head = to.head
    verb.dep = verbal(units[to.head]) ? 'advcl' : 'acl'
    to.pos = 'PART'
    to.tag = 'TO'
    to.head = verb.index
    to.dep = 'aux'
    adverb.head = verb.index
    adverb.dep = 'advmod'
    changed++
  }

  // 18. A participle stands after the noun it describes, before what it says of it ("a diamond labelled
  //     Crop cycle"). One that the parser hung on the noun after it, with the nominal before it hung on the
  //     participle as a bare adverb, describes that nominal, and the words after it are what it gives.
  for (const participle of units) {
    if (!participle.word || participle.tag !== 'VBN' || participle.dep !== 'amod' || participle.head <= participle.index) continue
    const thing = under(participle).find(part => part.dep === 'npadvmod' && part.index === participle.index - 1 && ['NOUN', 'PROPN'].includes(part.pos))
    const given = units[participle.head]
    if (!thing || !under(thing).some(part => part.dep === 'det' || part.dep === 'nummod') || under(given).some(part => part.index < participle.index)) continue
    thing.head = given.head === given.index ? thing.index : given.head
    thing.dep = given.head === given.index ? 'ROOT' : given.dep
    participle.head = thing.index
    participle.dep = 'acl'
    given.head = participle.index
    given.dep = 'oprd'
    changed++
  }

  // 19. A noun follows a determiner, a verb follows "to", a subject pronoun or a modal. A word the raw text
  //     writes after a determiner at least nine times for each time it stands after those (names,
  //     describing-words.mjs: "heading" 1,887 to 1, "tick" 280 to 3; not "move", 99 to 658) is a noun. One
  //     the tagger read as a verb right after the noun or adjective of a nominal that a determiner opens,
  //     with no auxiliary or "to" of its own, ends that nominal: "align the chapter heading to the right",
  //     "I want the marker borders thicker", "make the bottom tick numbers 0 to 10" (where a bare noun after
  //     it ends the nominal in its place). The nominal stands where the parser put the verb; what the verb
  //     said of it ("thicker") is said of it still.
  for (const verb of units) {
    // (a form in -s never follows "to", a subject pronoun or a modal: its base form is put to the test, "borders" by "border")
    const form = verb.tag === 'VBZ' ? verb.lemma : ['VB', 'VBP'].includes(verb.tag) ? verb.lower : null
    if (!verb.word || verb.quoted || verb.pos !== 'VERB' || !/^\p{Ll}/u.test(verb.value) || !form || !names(form) || describes(verb.lower)) continue
    const previous = units[verb.index - 1]
    if (!previous?.word || !['NOUN', 'PROPN', 'ADJ'].includes(previous.pos) || under(verb).some(part => ['aux', 'auxpass', 'mark', 'neg'].includes(part.dep) || part.pos === 'PRON' && SUBJECT.has(part.dep))) continue
    const described = verb.dep === 'acl' && verb.head === previous.index
    const subject = previous.head === verb.index && previous.dep === 'nsubj'
    const opening = units[firstOf(previous)]
    if (!described && !subject || !opening?.word || !['DT', 'PDT', 'PRP$', 'CD'].includes(opening.tag) || under(previous).some(part => part.index > previous.index)) continue
    // a bare noun right after the verb, which the parser made its object, ends the nominal in its place
    const after = under(verb).find(part => part.dep === 'dobj' && part.index === verb.index + 1 && ['NOUN', 'PROPN'].includes(part.pos) && !under(part).some(inner => inner.index < part.index))
    // (a verb with an object of its own is one: "make the lake mirror the house")
    if (under(verb).some(part => ['dobj', 'dative', 'ccomp', 'xcomp'].includes(part.dep) && part !== after)) continue
    // (a form in -s with a nominal before it may be a verb with its subject, "the exact distance matters": only a word said of
    // the thing after it, "the marker borders thicker", shows the -s of a plural)
    if (verb.tag === 'VBZ' && !under(verb).some(part => ['oprd', 'acomp'].includes(part.dep) && part.pos === 'ADJ')) continue
    const head = after ?? verb
    const [above, relation] = described ? [previous.head, previous.dep] : [verb.head, verb.dep]
    const governor = units[above]
    verb.pos = 'NOUN'
    verb.tag = verb.lower.endsWith('s') && verb.lower !== verb.lemma ? 'NNS' : 'NN'
    verb.lemma = verb.lower
    head.head = above === (described ? previous.index : verb.index) ? head.index : above
    head.dep = head.head === head.index ? 'ROOT' : ['ccomp', 'xcomp'].includes(relation) && verbal(governor) ? 'dobj' : relation
    for (const part of under(previous)) if (part.index < previous.index) part.head = head.index
    previous.head = head.index
    previous.dep = previous.pos === 'ADJ' ? 'amod' : 'compound'
    if (after) { verb.head = head.index; verb.dep = 'compound' }
    // what the verb took besides: a word said of the thing, and a phrase, go with the verb above when there is one
    for (const part of under(verb)) {
      if (part === head || part === previous) continue
      if (['oprd', 'acomp'].includes(part.dep) && verbal(governor) && head.head === governor.index) { part.head = governor.index; part.dep = 'oprd' } else part.head = head.index
    }
    changed++
  }

  // 20. A preposition is followed by what it governs; no conjunction stands between them. A preposition that
  //     the parser gave an object opened by a conjunction ("revenue running across and region down the side")
  //     governs nothing: it is an adverb of its verb, and the conjunction joins the noun after it, with the
  //     phrases of that verb that follow the noun, to the noun the verb describes or the verb itself.
  for (const marker of units) {
    if (!marker.word || marker.dep !== 'prep' || marker.head === marker.index) continue
    const conjunction = units[marker.index + 1], object = under(marker).find(part => part.dep === 'pobj')
    if (!conjunction?.word || conjunction.dep !== 'cc' || !object || conjunction.head !== object.index || under(marker).length !== 1) continue
    const verb = units[marker.head]
    if (!verbal(verb)) continue
    const first = verb.dep === 'acl' && verb.head !== verb.index && ['NOUN', 'PROPN'].includes(units[verb.head].pos) ? units[verb.head] : verb
    marker.pos = 'ADV'
    marker.tag = 'RB'
    marker.dep = 'advmod'
    object.head = first.index
    object.dep = 'conj'
    if (first !== verb) for (const part of under(verb)) if (part.index > object.index && part.dep === 'prep') part.head = object.index
    changed++
  }
  return changed
}
