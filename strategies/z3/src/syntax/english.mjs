// The function words of English: determiners, pronouns, auxiliaries, linking words,
// conjunctions, numerals, the adverbs that are not built from another word, interjections,
// and common verbs with their irregular forms. No noun and no adjective is listed here, and
// no word is listed because of a dataset: what the strategy knows about nouns and adjectives
// comes from word order, endings and its usage model (strategies/z3/model/usage.json).
const set = (text) => new Set(text.trim().split(/\s+/u))

export const articles = set('a an the')
export const possessives = set('my your his her its our their whose')
// Determiners that also stand alone as pronouns ("delete all", "move both", "this is fine").
export const quantifiers = set(`this that these those some any each either neither another both all much many few
  several enough such what which whatever whichever more most less fewer least half`)
export const otherDeterminers = set('every no')
// Determiners whose noun is singular.
export const singularDeterminers = set('a an each every another this that either neither')
// Words that may stand before a determiner inside one nominal: "all the boxes", "half a page".
export const predeterminers = set('all both half such what quite double twice')

export const subjectPronouns = set('i we he she they who')
export const objectPronouns = set('me us him them whom')
export const pronouns = set(`i we he she they me us him them you it her mine yours hers ours theirs myself yourself
  himself herself itself ourselves yourselves themselves something anything nothing everything someone anyone everyone
  somebody anybody everybody nobody none who whom oneself`)
// A subject that takes a verb in -s.
export const thirdSingular = set('he she it this that something anything nothing everything someone anyone everyone')

export const modals = set("can could may might must shall should will would ought 'll 'd ca wo sha")
export const beForms = set("am is are was were be been being 'm 're")
export const haveForms = set("have has had having 've")
export const doForms = set('do does did')
// Finite forms of be, have and do: they can open a question as its verb ("is it red?").
export const finiteAuxiliaries = set("am is are was were have has had do does did 'm 're")
export const negations = set("not n't never")

export const prepositions = set(`about above across after against along alongside amid among amongst around as at atop
  before behind below beneath beside besides between beyond by despite down during except for from in inside into like
  near nearer nearest of off on onto opposite out outside over past per since than through throughout till to toward
  towards under underneath unlike until up upon via with within without versus vs`)
// Prepositions that are nothing else: no noun, verb or describing word has their form.
export const corePrepositions = set(`of at from to with for into onto upon per than via toward towards among amongst between
  during by in on as about against beside besides despite until till within without beyond beneath amid atop alongside
  throughout underneath unlike versus vs since after before across along around above below behind under over off
  through up down out`)
// Prepositions that also stand without an object, as an adverb or a verb particle: "move it up".
export const intransitivePrepositions = set(`about above across after along around before behind below beneath beside
  between beyond by down in inside near nearer off on opposite out outside over past through throughout under
  underneath up within without`)
export const subordinators = set(`if unless because although though whereas while whilst when whenever where wherever
  once until till since after before as that whether`)
// Words that introduce a relative clause after a nominal: "the girl who carried a bag".
export const relativizers = set('that which who whom whose where when')
// Fixed multiword markers (complex prepositions and subordinators).
export const complexMarkers = `next to|in front of|on top of|out of|close to|near to|instead of|because of|due to|
  according to|apart from|away from|in between|in addition to|along with|together with|up to|prior to|ahead of|
  inside of|outside of|on to|in spite of|on behalf of|in terms of|in place of|in line with|by means of|
  with respect to|with regard to|relative to|as for|as to|such as|rather than|other than|so that|even though|even if|
  as soon as|as long as|as if|as though|in order|provided that|now that|in case|except for|as of`
  .split('|').map((phrase) => phrase.trim().split(/\s+/u))

// The multiword markers that introduce a clause, never a nominal.
export const complexSubordinators = new Set(['so that', 'even though', 'even if', 'as soon as', 'as long as', 'as if', 'as though',
  'provided that', 'now that', 'in case'])

export const coordinators = set('and or but nor plus & +')
// Words that join clauses or modify one: "X, then Y" against "then move it".
export const clauseJoiners = set('then so yet')
export const interjections = set(`please pls plz hey hi hello thanks thx cheers oh ah um uh hmm hm wow oops yeah yep nope
  ok okay alright bye goodbye`)
// Answer words, interjections only when punctuation sets them off: "Yes, move it".
export const detachedInterjections = set('yes no')
export const whWords = set('what which who whom whose where when why how')
export const whAdverbs = set('where when why how')

// Words that grade a number: "about 50 words", "only two". An adverb in -ly does so too.
export const approximators = set('about around over under only just almost')
// Words that grade a describing word: "very big", "too long".
export const degreeWords = set('very too quite rather so more most less least how')
// Adverbs that are not built from another word.
export const adverbs = set(`again ahead also already always away back else even ever instead maybe often perhaps soon still
  together apart once twice just only almost`)
// Adverbs of place and time that stand after a preposition as a pronoun does: "from now on", "over there".
export const proAdverbs = set('here there now then')
export const cardinals = set(`zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen
  fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand
  million billion dozen`)
// Signs that stand between two terms as a marker ("x = 5") or that are terms themselves ("50 %").
export const operatorSigns = set('= < > ≤ ≥ → ⇒ ← ↔ × ÷ ^ ~ |')

// Irregular verbs: base, past, past participle.
const irregular = `arise arose arisen|be was been|bear bore borne|beat beat beaten|become became become|begin began begun|
  bend bent bent|bind bound bound|bite bit bitten|blow blew blown|break broke broken|bring brought brought|
  build built built|burn burnt burnt|buy bought bought|catch caught caught|choose chose chosen|come came come|
  cost cost cost|cut cut cut|deal dealt dealt|dig dug dug|do did done|draw drew drawn|drink drank drunk|
  drive drove driven|eat ate eaten|fall fell fallen|feed fed fed|feel felt felt|fight fought fought|find found found|
  fit fit fit|fly flew flown|forget forgot forgotten|freeze froze frozen|get got gotten|get got got|give gave given|
  go went gone|grow grew grown|hang hung hung|have had had|hear heard heard|hide hid hidden|hit hit hit|hold held held|
  hurt hurt hurt|keep kept kept|know knew known|lay laid laid|lead led led|leave left left|lend lent lent|let let let|
  lie lay lain|light lit lit|lose lost lost|make made made|mean meant meant|meet met met|pay paid paid|put put put|
  quit quit quit|read read read|ride rode ridden|ring rang rung|rise rose risen|run ran run|say said said|see saw seen|
  sell sold sold|send sent sent|set set set|shake shook shaken|shine shone shone|shoot shot shot|show showed shown|
  shrink shrank shrunk|shut shut shut|sing sang sung|sink sank sunk|sit sat sat|sleep slept slept|slide slid slid|
  speak spoke spoken|spend spent spent|spin spun spun|split split split|spread spread spread|stand stood stood|
  steal stole stolen|stick stuck stuck|strike struck struck|sweep swept swept|swim swam swum|swing swung swung|
  take took taken|teach taught taught|tear tore torn|tell told told|think thought thought|throw threw thrown|
  understand understood understood|wake woke woken|wear wore worn|win won won|wind wound wound|
  withdraw withdrew withdrawn|write wrote written|overlay overlaid overlaid|redo redid redone|undo undid undone|
  redraw redrew redrawn|rewrite rewrote rewritten|reset reset reset|rebuild rebuilt rebuilt|resend resent resent`
/** form -> [{lemma, past, participle}] for the irregular past forms and participles. */
export const irregularVerbForms = new Map()
for (const entry of irregular.split('|')) {
  const [lemma, past, participle] = entry.trim().split(/\s+/u)
  const add = (form, key) => {
    if (form === lemma && key === 'base') return
    if (!irregularVerbForms.has(form)) irregularVerbForms.set(form, [])
    let record = irregularVerbForms.get(form).find((item) => item.lemma === lemma)
    if (!record) irregularVerbForms.get(form).push(record = {lemma, past: false, participle: false})
    record[key] = true
  }
  add(past, 'past')
  add(participle, 'participle')
}
// Common verbs by what they take. After its object a verb of the first kind takes a bare
// infinitive ("let it stay"); the second kind takes a clause ("I think it fits"); the third
// takes two objects ("give the avatar a hat").
export const bareInfinitiveVerbs = set('let make have help see watch hear feel')
export const clauseVerbs = set('think know say see hope believe suppose guess mean feel wish assume imagine expect notice remember find show tell')
export const doubleObjectVerbs = set('give show send tell call name make get bring hand offer lend buy ask teach pay')
