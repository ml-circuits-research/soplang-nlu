// Corrections to the word classes and the arcs of a dependency parse, made before it is written
// as a circuit.
//
// A tagger trained on edited prose reads a short request by the habits of that prose: a word
// that opens a message and can be a noun or a verb is taken for a noun ("book Room 1 for
// Planning"), and a capitalised name that can be a verb is taken for one ("link Plan to Build").
// Each rule below states a fact of English grammar or spelling, checks it on the parser's own
// tags, relations, word order, punctuation, capitals and endings, and corrects the units in place.
// The only words a rule names are function words ("of", "else", pronouns, determiners, numerals,
// the linking adverbs of sequence "then" and "next") and "left", the past form of the common verb
// "leave"; none names a noun, an adjective or a word particular to these messages.
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
// the linking adverbs that put the next item of a sequence after the one before ("…, then make it red")
const SEQUENCE = new Set(['then', 'next'])

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
  //    object of its own opens words that are quoted without quotation marks ("notes Bring draft").
  for (const unit of units) {
    const verbForm = unit.pos === 'VERB' && ['VB', 'VBP'].includes(unit.tag)
    const adjective = unit.pos === 'ADJ' && !['amod', 'compound', 'nmod', 'conj'].includes(unit.dep)
    if (!unit.word || unit.quoted || !verbForm && !adjective) continue
    if (!capitalised(unit) || opensSentence(unit) || under(unit).some(part => VERB_ONLY.has(part.dep))) continue
    unit.pos = 'PROPN'
    unit.tag = 'NNP'
    unit.lemma = unit.lower
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
    if (!next?.word || stretch.length < 2) continue
    const baseVerb = first.pos === 'VERB' && (first.tag === 'VB' || first.tag === 'VBP' || first.lower === first.lemma)
    const nounLike = ['NOUN', 'PROPN', 'X', 'ADJ'].includes(first.pos) && !['NNS', 'NNPS'].includes(first.tag) && !/(?<![sui])s$/u.test(first.lower)
    // a numeral written as a word before a small-lettered noun counts that noun and opens its nominal
    // ("position one circle Proposal"); a number after a noun, written in figures, labels it ("block 2")
    const after = units[first.index + 2]
    const counts = next.pos === 'NUM' && /^\p{Ll}+$/u.test(next.value) && after?.word && after.pos === 'NOUN' && !capitalised(after)
    const closes = ['DT', 'PDT', 'PRP$'].includes(next.tag) || next.pos === 'PRON' && !SUBJECT.has(next.dep) || counts ||
      capitalised(next) && next.pos !== 'VERB' && !/^\p{Lu}/u.test(first.value) && !/[:;]/u.test(markBefore(first)?.value ?? '')
    if (!baseVerb && !(nounLike && closes)) continue
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

  // 9. The head of a nominal is a noun, and an adjective stands before the noun it describes. An
  //    adjective that the parser made the head of the nouns directly before it ("a pipe neck tiny",
  //    "bar border thin") says how the thing those nouns name is: the last noun is the head, and the
  //    adjective is said of it, as a word of the clause when a verb takes the nominal (Rule 5). After
  //    a preposition a noun before an adjective names a shade or a kind of it ("down to moss green")
  //    and is left alone.
  for (const adjective of units) {
    if (!adjective.word || adjective.quoted || adjective.pos !== 'ADJ' || !/^JJ/u.test(adjective.tag) || adjective.head === adjective.index || adjective.dep === 'pobj') continue
    const noun = units[adjective.index - 1]
    if (!noun?.word || noun.head !== adjective.index || noun.dep !== 'compound' || !['NOUN', 'PROPN'].includes(noun.pos)) continue
    const governor = units[adjective.head]
    noun.head = adjective.head
    noun.dep = adjective.dep
    for (const part of under(adjective)) if (part.index < adjective.index) part.head = noun.index
    if (verbal(governor)) { adjective.head = governor.index; adjective.dep = 'oprd' } else { adjective.head = noun.index; adjective.dep = 'amod' }
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
  return changed
}
