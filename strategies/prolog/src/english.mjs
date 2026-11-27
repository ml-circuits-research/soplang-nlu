// The word classes of English that the Prolog grammar reads. No knowledge world is read.
// Listed by hand: function words only (determiners, pronouns, auxiliaries, prepositions,
// conjunctions, numerals, a few adverbs and words said to the listener) and common verbs
// with their irregular forms. No noun and no adjective is listed. What the grammar needs
// to know about other words comes from their endings, from their place in the sentence,
// and from model/word-model.json, which train-word-model.mjs learns from unannotated text.
// A word found nowhere is taken as a noun. Nothing here says what a word means.
import {readFileSync} from 'node:fs'

const w = text => text.trim().split(/\s+/u)
const set = text => new Set(w(text))

// ---------------------------------------------------------------------------------------
// Closed classes
// ---------------------------------------------------------------------------------------
const determiners = set(`a an the this that these those my your his her its our their each every another
  some any no both all either neither such enough several many much few fewer more most less what which whose half`)
const predeterminers = set('all both half such quite what')
const subjectPronouns = set('i he she we they')
const objectPronouns = set('me him us them')
const anyPronouns = set(`you it mine yours hers ours theirs myself yourself himself herself itself ourselves
  themselves yourselves this that these those everything something anything nothing everyone someone anyone
  everybody somebody anybody nobody none one ones others all both each either neither some any few many much
  several most more less enough half there`)
const indefinitePronouns = set(`everything something anything nothing everyone someone anyone everybody somebody
  anybody nobody`)
const modals = set("can could will would shall should may might must 'll 'd wo ca sha ought")
const doForms = set('do does did')
const beForms = set("am is are was were be been being 'm 're ai")
const haveForms = set("have has had 've having")
const negations = set("not n't never cannot")
const whPronouns = set('what who whom which whatever whoever whichever')
const whDeterminers = set('what which whose whatever whichever')
const whAdverbs = set('where when why how wherever whenever')
const relativizers = set('that which who whom whose where when')
const coordinators = set('and or but yet nor plus so & +')
const subordinators = set(`if unless because although though whereas while when whenever once since until till
  before after as whether that so`)
const prepositions = set(`of on off at in into onto out with without to for from between beside besides above
  below behind under underneath beneath over across along around through against inside outside near by per as
  like before after until till since than toward towards within beyond upon among amongst about past up down round via
  plus minus except despite during throughout opposite alongside atop amid unlike versus vs = > < → ->`)
const particles = set(`up down off on out in over back away apart together around along through forward
  forwards backward backwards aside ahead across by`)
const discourseWords = set(`please pls plz hey hi hello ok okay alright yes yeah yep yup no nope oh ah um uh hmm
  oops sorry thanks thx cheers`)
const degreeWords = set(`very really quite rather fairly so too slightly somewhat extremely more most less
  least much far even almost nearly barely hardly totally completely fully entirely highly especially
  relatively as`)
const cardinals = set(`zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen
  fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred
  thousand million billion dozen`)
const ordinals = set('first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth last next')
// Several words that stand as one: [words, class].
const multiword = [
  ...w(`next_to in_front_of on_top_of out_of close_to near_to away_from instead_of because_of due_to
    according_to up_to along_with together_with apart_from aside_from except_for inside_of outside_of off_of
    ahead_of such_as rather_than other_than prior_to in_between in_addition_to in_place_of as_for as_of
    on_to`).map(item => [item.split('_'), 'prep']),
  ...w(`so_that even_if even_though as_if as_though as_soon_as as_long_as so_long_as in_case now_that
    provided_that such_that in_order_that given_that`).map(item => [item.split('_'), 'sub']),
  ...w('and_then as_well_as or_else').map(item => [item.split('_'), 'conj']),
  ...w('thank_you many_thanks no_thanks thank_you_very_much thanks_a_lot').map(item => [item.split('_'), 'disc']),
  ...w(`a_bit a_little a_lot a_tad a_little_bit a_tiny_bit`).map(item => [item.split('_'), 'deg']),
  ...w(`at_all as_well at_least at_most of_course right_now for_now so_far once_more once_again no_longer
    any_more in_general in_particular as_is as_usual for_example for_instance at_once at_first at_last
    in_fact after_all in_front on_top`)
    .map(item => [item.split('_'), 'adv']),
  ...w('a_few').map(item => [item.split('_'), 'det']),
  ...w('how_many how_much').map(item => [item.split('_'), 'wh', [['wh', 'det']]]),
  ...w('each_other one_another no_one').map(item => [item.split('_'), 'pron'])
]

// Adverbs of place, time, order and degree that work as function words. Adverbs of manner
// are known by their ending or from the word model.
const adverbs = set(`now then here there again also too always never often sometimes soon already still yet just
  only even maybe perhaps instead together apart away back forward forwards backward backwards up down inside
  outside nearby above below ahead behind once twice further else anywhere everywhere somewhere nowhere anyway
  somehow today tomorrow yesterday tonight later earlier first next finally afterwards afterward meanwhile
  likewise otherwise however therefore thus hence almost nearly quite rather very really slightly somewhat
  extremely exactly roughly approximately about around aside across along over through underneath beneath all
  round please kindly though`)

// ---------------------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------------------
// Common verbs with an irregular past form, then the past participle when it differs.
const irregular = `go:went:gone get:got:gotten make:made take:took:taken give:gave:given come:came:come
  become:became:become run:ran:run begin:began:begun bring:brought build:built buy:bought catch:caught
  choose:chose:chosen draw:drew:drawn drive:drove:driven drink:drank:drunk eat:ate:eaten fall:fell:fallen
  feel:felt find:found fly:flew:flown forget:forgot:forgotten freeze:froze:frozen grow:grew:grown hang:hung
  hear:heard hide:hid:hidden hold:held keep:kept know:knew:known lay:laid lead:led leave:left lend:lent
  lose:lost mean:meant meet:met pay:paid ride:rode:ridden ring:rang:rung rise:rose:risen say:said see:saw:seen
  sell:sold send:sent shake:shook:shaken shine:shone shoot:shot show:showed:shown shrink:shrank:shrunk
  sing:sang:sung sink:sank:sunk sit:sat sleep:slept slide:slid speak:spoke:spoken spend:spent spin:spun
  stand:stood steal:stole:stolen stick:stuck strike:struck sweep:swept swim:swam:swum swing:swung teach:taught
  tear:tore:torn tell:told think:thought throw:threw:thrown understand:understood wake:woke:woken wear:wore:worn
  win:won write:wrote:written bend:bent bind:bound bite:bit:bitten blow:blew:blown break:broke:broken
  deal:dealt dig:dug feed:fed fight:fought forbid:forbade:forbidden forgive:forgave:forgiven
  seek:sought lean:leant leap:leapt learn:learnt burn:burnt put:put set:set cut:cut let:let hit:hit shut:shut
  split:split spread:spread read:read cost:cost cast:cast hurt:hurt quit:quit bet:bet burst:burst fit:fit
  shed:shed beat:beat:beaten bear:bore:borne`
const pastOf = new Map(), participleOf = new Map(), commonVerbs = new Set()
for (const entry of w(irregular)) {
  const [base, past, participle = past] = entry.split(':')
  commonVerbs.add(base)
  for (const [form, bank] of [[past, pastOf], [participle, participleOf]]) bank.set(form, [...(bank.get(form) ?? []), base])
}
// Valency of common verbs, as far as the grammar needs it.
const frames = {
  // the verb takes an object and a bare infinitive: "let it be", "make the dog sit"
  bareinf: set('let make have help see watch hear feel'),
  // the verb takes a finite clause: "I think it fits", "make sure that it fits"
  clause: set(`say think know hope believe ensure mean suppose guess see feel wish find notice remember assume
    expect imagine suggest decide tell show check understand realise realize doubt fear agree confirm`),
  // the verb takes an object and a word that says how the object is: "make it red", "keep it open"
  opred: set('make keep leave want need get have like find consider turn set render hold prefer call'),
  // the verb has no object: its -ed form after a nominal is a past tense, never a passive participle
  intrans: set(`arrive appear happen exist occur come go fall rise die sleep wait remain stay emerge vanish
    disappear belong depend begin end start work look seem`),
  // the verb links its subject to a word that says how the subject is
  link: set('seem look feel remain become stay appear sound get turn grow')
}
for (const members of Object.values(frames)) for (const verb of members) commonVerbs.add(verb)
for (const verb of w('do use try ask move add remove change put place want need like help start stop')) commonVerbs.add(verb)
// Verb and particle that form one verb before an object: "take off the glasses".
const phrasal = new Set(w(`take_off take_out take_away take_up take_down take_apart take_back put_on put_down
  put_away put_back put_up put_together turn_on turn_off turn_up turn_down turn_over pick_up pick_out set_up
  bring_up bring_in bring_out bring_back bring_over bring_down bring_forward cut_out cut_off cut_down blow_up
  shut_down shut_off throw_away throw_out give_up give_back give_away get_back hold_up send_back send_out
  send_off send_over find_out make_up leave_out break_up break_down break_off tear_up tear_down tear_off
  move_up move_down move_over move_back move_forward move_in move_out`))

// ---------------------------------------------------------------------------------------
// What was learned from text about the other words
// ---------------------------------------------------------------------------------------
// {word: {v: used as a verb, a: used as a modifier, n: share of its uses as a noun}}
function loadModel() {
  try { return JSON.parse(readFileSync(new URL('../model/word-model.json', import.meta.url), 'utf8')).words ?? {} }
  catch { return {} }
}
const learned = loadModel()
const isVerb = word => commonVerbs.has(word) || Boolean(learned[word]?.v)
const isModifier = word => Boolean(learned[word]?.a)
const nounShare = word => learned[word]?.n ?? 0

/** A word the lists of this file name: a function word, a numeral or a word said to the listener. */
export function functionWord(word) {
  return determiners.has(word) || subjectPronouns.has(word) || objectPronouns.has(word) || anyPronouns.has(word) ||
    modals.has(word) || doForms.has(word) || beForms.has(word) || haveForms.has(word) || negations.has(word) ||
    whPronouns.has(word) || whDeterminers.has(word) || whAdverbs.has(word) || coordinators.has(word) ||
    subordinators.has(word) || prepositions.has(word) || particles.has(word) || discourseWords.has(word) ||
    degreeWords.has(word) || cardinals.has(word) || ordinals.has(word) || adverbs.has(word) || word === 'to' || word === 'then'
}

// ---------------------------------------------------------------------------------------
// Forms of a word
// ---------------------------------------------------------------------------------------
/** The verbs an inflected form can come from: [[base, form]]. */
function verbBases(word) {
  const found = []
  const add = (base, form) => { if (isVerb(base) && base !== word) found.push([base, form]) }
  // a form in -ing, or one in -s or -ed whose stem is a verb, is no base form, whatever the text shows
  const inflected = /ing$/u.test(word) || (/(?:ed|s)$/u.test(word) && [word.slice(0, -1), word.slice(0, -2)].some(stem => stem.length > 2 && isVerb(stem)))
  if (isVerb(word) && !(inflected && !commonVerbs.has(word))) found.push([word, 'base'])
  for (const base of pastOf.get(word) ?? []) found.push([base, 'past'])
  for (const base of participleOf.get(word) ?? []) found.push([base, 'en'])
  const stems = (stem, form) => {
    add(stem, form); add(stem + 'e', form)
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1), form)
    if (stem.endsWith('i')) add(stem.slice(0, -1) + 'y', form)
  }
  if (word.endsWith('ing') && word.length > 4) stems(word.slice(0, -3), 'ing')
  if (word.endsWith('ed') && word.length > 3) stems(word.slice(0, -2), 'ed')
  if (word.endsWith('ies')) add(word.slice(0, -3) + 'y', 's')
  else if (word.endsWith('es')) { add(word.slice(0, -2), 's'); add(word.slice(0, -1), 's') }
  else if (word.endsWith('s') && !word.endsWith('ss')) add(word.slice(0, -1), 's')
  return found.filter(([base, form], index) => found.findIndex(other => other[0] === base && other[1] === form) === index)
}
// The comparative or superlative of a word that the text uses as a modifier.
function graded(word) {
  for (const [suffix, grade] of [['er', 'comparative'], ['est', 'superlative']]) {
    if (!word.endsWith(suffix) || word.length < suffix.length + 3) continue
    const stem = word.slice(0, -suffix.length)
    const bases = [stem, stem + 'e', stem.endsWith('i') ? stem.slice(0, -1) + 'y' : null,
      stem.at(-1) === stem.at(-2) ? stem.slice(0, -1) : null]
    if (bases.some(base => base && isModifier(base))) return grade
  }
  return null
}
// How far a verb is first of all a noun, from its uses in text: the share of its uses after
// a determiner at the end of a phrase.
const strength = share => share >= 0.5 ? 'weak' : share >= 0.15 ? 'balanced' : 'strong'
const order = {strong: 3, balanced: 2, weak: 1}
const derivedVerb = /^(?:re|un|de|over|out|pre|mis|dis)(.{3,})$/u

/**
 * The classes of one word, by its spelling alone: {pos: [class], features: [[key, value]]}.
 * `word` is lower case. A word found nowhere is a noun marked `unknown`.
 */
export function classesOf(word) {
  const pos = new Set(), features = []
  const feature = (key, value) => { if (!features.some(item => item[0] === key && item[1] === value)) features.push([key, value]) }
  if (determiners.has(word)) pos.add('det')
  if (predeterminers.has(word)) feature('det', 'pre')
  if (['my', 'your', 'his', 'her', 'its', 'our', 'their'].includes(word)) feature('det', 'possessive')
  if (subjectPronouns.has(word)) { pos.add('pron'); feature('case', 'subject') }
  if (objectPronouns.has(word) || word === 'her') { pos.add('pron'); feature('case', 'object') }
  if (anyPronouns.has(word)) pos.add('pron')
  if (word === 'others' || word === 'ones') pos.add('noun')
  if (indefinitePronouns.has(word)) feature('pron', 'indefinite')
  if (['i', 'you', 'we', 'they', 'he', 'she', 'it', 'me', 'him', 'her', 'us', 'them', 'myself', 'yourself', 'himself',
    'herself', 'itself', 'ourselves', 'themselves', 'yourselves'].includes(word)) feature('pron', 'personal')
  if (modals.has(word)) { pos.add('aux'); feature('aux', 'modal') }
  if (doForms.has(word)) { pos.add('aux'); feature('aux', 'do') }
  if (beForms.has(word)) { pos.add('aux'); feature('aux', 'be') }
  if (haveForms.has(word)) { pos.add('aux'); feature('aux', 'have') }
  if (negations.has(word)) pos.add('neg')
  if (whPronouns.has(word)) { pos.add('wh'); feature('wh', 'pron') }
  if (whDeterminers.has(word)) { pos.add('wh'); feature('wh', 'det') }
  if (whAdverbs.has(word)) { pos.add('wh'); feature('wh', 'adv') }
  if (relativizers.has(word)) pos.add('rel')
  if (coordinators.has(word)) pos.add('conj')
  if (word === 'then') pos.add('conj')
  if (subordinators.has(word)) pos.add('sub')
  if (prepositions.has(word)) pos.add('prep')
  if (particles.has(word)) pos.add('part')
  if (discourseWords.has(word)) pos.add('disc')
  if (degreeWords.has(word)) pos.add('deg')
  if (word === 'to') pos.add('to')
  if (word === "'s" || word === '’s') pos.add('clitic')
  if (cardinals.has(word) || /^[+-]?(?:\p{N}+(?:[.,:]\p{N}+)*|\.\p{N}+)$/u.test(word)) pos.add('num')
  if (/^\p{N}{4}-\p{N}{2}-\p{N}{2}$/u.test(word) || /^\p{N}{1,2}:\p{N}{2}/u.test(word)) pos.add('num')
  if (ordinals.has(word) || /^\p{N}+(?:st|nd|rd|th)$/u.test(word)) { pos.add('adj'); feature('adj', 'ordinal') }
  if (adverbs.has(word)) pos.add('adv')
  const closed = pos.size > 0

  // what the text shows about the word: a modifier, and how often a noun
  const grade = graded(word)
  // a form in -ed of a verb is a participle first: it is no modifier of its own ("was moved")
  const participle = verbBases(word).some(([, form]) => form === 'ed' || form === 'en')
  // unless the text also uses it as a noun ("the left"): then it is a word of its own
  const own = !participle || nounShare(word) >= 0.15
  if ((isModifier(word) || grade) && own) { pos.add('adj'); feature('adj', 'listed'); if (grade) feature('adj', grade) }
  if (isModifier(word) && nounShare(word) >= 0.15) pos.add('noun')

  // verbs: the common verbs, the verbs seen in text, their regular forms, and bases made with a prefix
  let bases = verbBases(word)
  if (!bases.length) {
    const derived = derivedVerb.exec(word)
    if (derived && !closed) bases = verbBases(derived[1]).filter(([base]) => strength(nounShare(base)) === 'strong')
  }
  const lexical = bases.filter(([base]) => !(pos.has('aux') && base === word))
  if (lexical.length && !(closed && !pos.has('aux') && !lexical.some(([base]) => commonVerbs.has(base)))) {
    pos.add('verb')
    let best = 'weak'
    for (const [base, form] of lexical) {
      // a regular -ed form is past and participle; an irregular past is only the past
      feature('vform', form === 'past' ? 'ed' : form)
      if (form === 'ed') feature('vform', 'en')
      // the word itself may be used as a noun more than its verb is: "labels", "heading"
      const kind = strength(Math.max(nounShare(base), form === 'base' ? 0 : nounShare(word)))
      if (order[kind] > order[best]) best = kind
      for (const [frame, members] of Object.entries(frames)) if (members.has(base)) feature('frame', frame)
      feature('base', base)
    }
    // a past form that is also an adverb or a modifier is first of all that: "move it left"
    feature('verbal', (pos.has('adv') || pos.has('adj')) && lexical.every(([, form]) => form === 'past' || form === 'en') ? 'weak' : best)
    // a base form or a form in -s is a noun as far as the verb is one; a form in -ing only by its own uses
    const share = Math.max(nounShare(word), ...lexical.map(([base]) => nounShare(base)))
    if (lexical.some(([, form]) => form === 'base' || form === 's') && share >= 0.05) pos.add('noun')
    if (lexical.some(([, form]) => form === 'ing') && nounShare(word) >= 0.2) pos.add('noun')
    if (lexical.some(([, form]) => form === 'ed' || form === 'en')) pos.add('adj')
  }
  if (pos.has('aux')) {
    // the auxiliaries are verbs too: "I have a box", "do it", "the box is red"
    const kind = features.find(item => item[0] === 'aux')[1]
    if (kind !== 'modal') {
      pos.add('verb'); feature('verbal', 'strong')
      const forms = {do: 'base', does: 's', did: 'ed', have: 'base', has: 's', had: 'ed', having: 'ing', be: 'base',
        been: 'en', being: 'ing', am: 's', is: 's', are: 'base', was: 'ed', were: 'ed', "'m": 's', "'re": 'base', "'ve": 'base'}
      feature('vform', forms[word] ?? 'base')
      if (word === 'had') feature('vform', 'en')
      if (kind === 'have') { feature('frame', 'bareinf'); feature('frame', 'opred') }
      if (kind === 'be') feature('frame', 'link')
    }
  }

  if (!pos.size) {
    // endings that fix the class of a word nobody listed and the text did not show
    if (/[\p{L}]{3,}ly$/u.test(word) || /[\p{L}]{3,}(?:wards?|wise)$/u.test(word)) pos.add('adv')
    else if (/[\p{L}]{3,}(?:ous|ful|less|ish|able|ible|ive|ical)$/u.test(word)) pos.add('adj')
    else if (/[\p{L}]{3,}(?:ise|ize|ify)$/u.test(word)) { pos.add('verb'); feature('vform', 'base'); feature('verbal', 'strong') }
    else if (/[\p{L}]{3,}ed$/u.test(word)) { pos.add('verb'); pos.add('adj'); feature('vform', 'ed'); feature('vform', 'en'); feature('verbal', 'balanced') }
    else if (/[\p{L}]{3,}ing$/u.test(word)) { pos.add('verb'); pos.add('noun'); feature('vform', 'ing'); feature('verbal', 'balanced') }
    else if (/^\p{Extended_Pictographic}/u.test(word)) pos.add('disc')
    else pos.add('noun')
    feature('unknown', 'true')
  }
  if (pos.has('noun') && /[^s]s$/u.test(word) && !functionWord(word)) feature('number', 'plural')
  return {pos: [...pos], features}
}

/** The classes of a run of words that stand as one, or null: "next to", "so that", "thank you". */
export function multiwordClasses(words) {
  const found = multiword.filter(([parts]) => parts.length === words.length && parts.every((part, index) => part === words[index]))
  return found.length ? {pos: [...new Set(found.map(item => item[1]))], features: found.flatMap(item => item[2] ?? [])} : null
}
export const longestMultiword = Math.max(...multiword.map(([parts]) => parts.length))
export const isPhrasal = (base, particle) => phrasal.has(base + '_' + particle)
