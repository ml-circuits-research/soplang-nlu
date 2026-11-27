// The constraint model. For every word Z3 chooses one class among the readings the lexicon
// allows, whether it is the head or a dependent of a nominal, the construction that licenses
// each verb, and where each marker phrase attaches. Hard constraints state what English
// grammar excludes; weighted soft constraints state what it prefers. One MaxSMT problem
// per message.
const or = (...items) => {
  const list = items.flat().filter((item) => item !== 'false')
  return list.includes('true') ? 'true' : list.length === 0 ? 'false' : list.length === 1 ? list[0] : `(or ${list.join(' ')})`
}
const and = (...items) => {
  const list = items.flat().filter((item) => item !== 'true')
  return list.includes('false') ? 'false' : list.length === 0 ? 'true' : list.length === 1 ? list[0] : `(and ${list.join(' ')})`
}
const not = (item) => item === 'true' ? 'false' : item === 'false' ? 'true' : `(not ${item})`
const implies = (condition, consequence) => or(not(condition), consequence)
// How much the word of a parser counts, beside the weights of the lexicon (0 to 9).
const evidenceWeight = {tag: 12, nominal: 4, attachment: 6}
// Two readings of equal weight: a fixed one of them is taken, so that a message always gets
// the same circuit. Every preference weighs more than all these tie-breakers together.
const tieScale = 10000

// The constructions that license a verb, with the verb forms each takes.
const contexts = {
  i: ['base'],                  // imperative: first in its clause
  s: ['base', 'third', 'past'], // finite, after its subject
  a: ['base', 'part', 'ing'],   // after an auxiliary
  t: ['base'],                  // after infinitival "to"
  p: ['ing', 'part'],           // participle: after a nominal, a marker or another verb
  b: ['base'],                  // bare infinitive after the object of "let", "make", "help"
  r: ['base', 'third', 'past'], // finite, right after a relative word
  q: ['third', 'past']          // finite be, have or do opening a question
}

/**
 * @param evidence optional, one entry per token: what a parser saw there, as {tag, nominal:
 *   'head' | 'dependent', attachment: 'clause' | 'nominal'}. Each entry becomes a weighted
 *   preference: the grammar of the model still holds, and the parser is heard within it.
 * @returns {smt, query, read(model)} for the tokens of one message.
 */
export function encode({tokens, complex}, evidence = null) {
  const lines = []
  const query = []
  const declare = (name) => { lines.push(`(declare-const ${name} Bool)`); query.push(name); return name }
  const define = (name, formula) => {
    if (formula === 'true' || formula === 'false') return formula
    lines.push(`(define-fun ${name} () Bool ${formula})`)
    return name
  }
  const hard = (formula) => { if (formula !== 'true') lines.push(`(assert ${formula})`) }
  const soft = (formula, weight) => { if (formula !== 'true' && weight > 0) lines.push(`(assert-soft ${formula} :weight ${weight * tieScale})`) }
  const atMostOne = (names) => {
    const list = names.filter((name) => name !== 'false')
    if (list.length > 1) hard(`((_ at-most 1) ${list.join(' ')})`)
  }
  const count = tokens.length
  const inside = (index) => index >= 0 && index < count
  // tokens[index] continues the sentence of the token before it, with no comma between
  const joined = (index) => inside(index) && inside(index - 1) && !tokens[index].brk
  const adjacent = (index) => joined(index) && !tokens[index].com

  // one class per word
  const tagVars = tokens.map((token, index) => {
    const tags = [...token.cand.keys()]
    const vars = new Map(tags.map((tag) => [tag, tags.length === 1 ? 'true' : declare(`t${index}${tag}`)]))
    if (tags.length > 1) { hard(or([...vars.values()])); atMostOne([...vars.values()]) }
    for (const [tag, weight] of token.cand) soft(vars.get(tag), weight)
    if (evidence?.[index]?.tag && vars.has(evidence[index].tag)) soft(vars.get(evidence[index].tag), evidenceWeight.tag)
    return vars
  })
  const tag = (index, ...tags) => inside(index) ? or(tags.map((name) => tagVars[index].get(name) ?? 'false')) : 'false'

  const deferred = []
  // nominals: a run of dependents closed by its head
  const head = tokens.map((token, index) => ['N', 'P', 'Q', 'J'].some((name) => token.cand.has(name)) ? declare(`h${index}`) : 'false')
  const dep = tokens.map((token, index) => index + 1 < count && adjacentOrList(index + 1) &&
    ['D', 'Q', 'J', 'N', 'R'].some((name) => token.cand.has(name)) ? declare(`d${index}`) : 'false')
  function adjacentOrList(index) { return joined(index) }
  const H = (index) => inside(index) ? head[index] : 'false'
  const Dp = (index) => inside(index) ? dep[index] : 'false'
  const nominal = (index) => or(H(index), Dp(index))
  for (const [index, token] of tokens.entries()) {
    hard(implies(head[index], tag(index, 'N', 'P', 'Q', 'J')))
    hard(implies(dep[index], tag(index, 'D', 'Q', 'J', 'N', 'R')))
    hard(not(and(head[index], dep[index])))
    hard(implies(tag(index, 'N', 'Q'), nominal(index)))
    hard(implies(tag(index, 'P'), head[index]))
    if (token.flags.literal) hard(not(dep[index]))
    if (evidence?.[index]?.nominal === 'head') soft(head[index], evidenceWeight.nominal)
    if (evidence?.[index]?.nominal === 'dependent') soft(dep[index], evidenceWeight.nominal)
    // a dependent is followed by the rest of its nominal; a comma inside only between adjectives
    hard(implies(dep[index], and(nominal(index + 1), inside(index + 1) && tokens[index + 1].com ? and(tag(index, 'J'), tag(index + 1, 'J')) : 'true')))
    // an adverb inside a nominal grades the adjective after it: "a very big box"
    // ... or the number: "approximately 51 words"
    hard(implies(and(dep[index], tag(index, 'R')), or(and(tag(index + 1, 'J', 'R'), Dp(index + 1)),
      inside(index + 1) && tokens[index + 1].flags.quantifier ? and(tag(index + 1, 'D'), Dp(index + 1)) : 'false',  // "too much trouble"
      token.flags.approximator ? and(tag(index + 1, 'Q'), nominal(index + 1)) : 'false')))
    if (token.flags.approximator && inside(index + 1) && tokens[index + 1].cand.has('Q')) soft(implies(tag(index, 'R'), dep[index]), 4)
    // a determiner or a pronoun begins its nominal; a number after a noun is not part of it
    if (index > 0) {
      // (but "two more boxes", "some more", "a few less")
      if (!tokens[index - 1].flags.predeterminer && !['more', 'fewer', 'less'].includes(token.lower)) hard(not(and(tag(index, 'D'), Dp(index - 1), not(tag(index - 1, 'R')))))
      hard(not(and(tag(index, 'P'), Dp(index - 1))))
      hard(not(and(tag(index - 1, 'N'), Dp(index - 1), tag(index, 'Q'))))
      // an adjective heads a nominal only after a determiner: "the same", "the left"
      hard(implies(and(head[index], tag(index, 'J')), and(Dp(index - 1), tag(index - 1, 'D'))))
    } else hard(not(and(head[index], tag(index, 'J'))))
    soft(not(and(head[index], tag(index, 'J'))), 5)
    // ... and hardly when a noun may follow it: "the next slide"
    if (joined(index + 1) && !tokens[index + 1].com && tokens[index + 1].cand.has('N')) soft(not(and(head[index], tag(index, 'J'))), 6)
    // two nominals side by side, with no word and no comma between them, are the rarer reading
    // (a verb that takes two objects has them so: "give the avatar a hat")
    // (so does a name after the noun it names: "the node Intro")
    const named = index > 0 && (token.flags.capital || token.flags.quote) && !tokens[index - 1].flags.capital && /^\p{Ll}/u.test(tokens[index - 1].text)
    if (adjacent(index)) deferred.push(() => soft(not(and(H(index - 1), nominal(index), not(doubleObject[index]), named ? not(tag(index - 1, 'N')) : 'true')), 3))
    soft(implies(tag(index, 'D'), dep[index]), 30)
    // a noun that stands alone, with no determiner and no plural, is the rarer reading of a word
    // that also describes: "facing right", "move it left"
    if (token.cand.has('N') && token.cand.has('J') && !token.flags.capital && !token.flags.plural && !token.flags.quote) {
      soft(not(and(head[index], tag(index, 'N'), not(Dp(index - 1)))), 2)
    }
    if (adjacent(index + 1)) {
      const next = tokens[index + 1]
      // nouns side by side form one nominal; a plural noun rarely modifies another noun
      // (a name written with a capital and the noun after it all the more: "Database node")
      if (next.cand.has('N') && !token.flags.plural) soft(implies(and(tag(index, 'N'), tag(index + 1, 'N')), dep[index]), token.flags.capital ? 5 : 3)
      // a common noun before a name is the head, the name stands with it: "the node Intro"
      if ((next.flags.capital || next.flags.quote) && !token.flags.capital && /^\p{Ll}/u.test(token.text)) soft(not(and(tag(index, 'N'), dep[index])), 5)
      if (token.flags.plural) soft(not(and(tag(index, 'N'), dep[index])), 4)
      // an adjective or a number before a nominal belongs to it
      soft(implies(and(tag(index, 'J', 'Q'), tag(index + 1, 'N', 'J', 'Q'), nominal(index + 1)), dep[index]), 4)
      // an adverb before an adjective or a quantifier of a nominal grades it: "a very big box", "too much trouble"
      soft(implies(and(tag(index, 'R'), next.flags.quantifier ? tag(index + 1, 'J', 'D') : tag(index + 1, 'J'), Dp(index + 1)), dep[index]), 3)
      soft(not(and(tag(index, 'N'), dep[index], tag(index + 1, 'J'))), 4)
      // a number stands before the describing words of its nominal: "two red boxes"
      soft(not(and(tag(index, 'J'), dep[index], tag(index + 1, 'Q'), not(tag(index - 1, 'D')))), 4)
    }
  }

  // positions, as chains over the words of one sentence
  const free = [], subject = [], auxBefore = [], afterAux = [], whField = [], auxFront = [], inverted = [], toBefore = [], relBefore = []
  const beBefore = [], haveBefore = [], modalBefore = [], inDouble = [], doubleObject = [], oneOnly = [], stacked = [], singular = [], plural = [], objectOne = [], objectMore = [], causative = [], hasVerb = [], open = [], cue = [], inFirst = [], afterFirst = [], some = [], two = [], any = [], anyTwo = [], counted = []
  for (const [index, token] of tokens.entries()) {
    const start = token.brk
    const before = index - 1
    const light = tag(before, 'X', 'R', 'G')
    // nothing but interjections, adverbs, negation and auxiliaries since the clause began
    // (a describing word outside a nominal counts as an adverb there: "next, build ...")
    free[index] = start ? 'true' : define(`free${index}`, or(token.com ? 'true' : 'false', tag(before, 'C'),
      and(free[before], or(tag(before, 'I', 'R', 'G', 'X'), and(tag(before, 'J'), not(nominal(before)))))))
    // a nominal ends right before, auxiliaries and adverbs aside
    subject[index] = start || token.com ? 'false' : define(`sub${index}`, or(H(before), and(subject[before], light)))
    auxBefore[index] = start || token.com ? 'false' : define(`xa${index}`, or(tag(before, 'X'), and(auxBefore[before], light)))
    // since a question word opened the clause, no verb or auxiliary has come
    whField[index] = define(`wf${index}`, or(token.flags.wh ? free[index] : 'false', start || token.com ? 'false' : and(whField[before], not(tag(before, 'V', 'X')))))
    // an auxiliary that opens its clause, or follows the question word, stands right before
    auxFront[index] = start || token.com ? 'false' : define(`xf${index}`, or(and(tag(before, 'X'), or(free[before], whField[before])), and(auxFront[before], tag(before, 'R', 'G'))))
    // this word is in a nominal that begins right after such an auxiliary: "can [the box] move"
    afterAux[index] = define(`na${index}`, and(nominal(index), or(auxFront[index], start || token.com ? 'false' : and(afterAux[before], Dp(before)))))
    inverted[index] = start || token.com ? 'false' : define(`xn${index}`, or(and(H(before), afterAux[before]), and(inverted[before], tag(before, 'R', 'G'))))
    toBefore[index] = start ? 'false' : define(`tb${index}`, or(tag(before, 'T'), and(toBefore[before], tag(before, 'R', 'G'))))
    relBefore[index] = start ? 'false' : define(`rl${index}`, or(inside(before) && tokens[before].flags.rel ? tag(before, 'M') : 'false', and(relBefore[before], light)))
    // the first nominal after a verb that takes two objects has just ended: "give the avatar | closed eyes"
    inDouble[index] = start || token.com ? 'false' : define(`id${index}`, or(tokens[before].frames.has('double_object') ? tag(before, 'V') : 'false',
      and(inDouble[before], not(H(before)), not(tag(before, 'V')))))
    doubleObject[index] = start || token.com ? 'false' : define(`do${index}`, and(inDouble[before], H(before)))
    // the object of a verb that takes a bare infinitive has just ended, one marker phrase in it
    // at most: "let [two of the five sheep] stay"
    objectOne[index] = start || token.com ? 'false' : define(`oa${index}`, or(tokens[before].flags.causative ? tag(before, 'V') : 'false',
      and(objectOne[before], nominal(before))))
    objectMore[index] = start || token.com ? 'false' : define(`ob${index}`, or(and(objectOne[before], tag(before, 'M')),
      and(objectMore[before], or(nominal(before), and(tag(before, 'M'), tag(before - 1, 'M'))))))
    causative[index] = or(objectOne[index], objectMore[index])
    hasVerb[index] = start ? 'false' : define(`hv${index}`, or(tag(before, 'V'), hasVerb[before]))
    // a finite clause may stand here: nothing before it, or a comma, a joining word, a
    // subordinator, or a verb that takes a clause, since the last verb
    const opener = inside(before) && (tokens[before].flags.subordinator || tokens[before].flags.rel || tokens[before].flags.wh)
    cue[index] = start || token.com ? 'true' : define(`cu${index}`, or(tag(before, 'C'), opener ? tag(before, 'M', 'R', 'P', 'D') : 'false',
      and(cue[before], not(tag(before, 'V')))))
    // ... or the first nominal after a verb that takes a clause has just ended: "I think it fits"
    // (so does a describing word after a verb: "make sure it fits")
    inFirst[index] = start || token.com ? 'false' : define(`if${index}`, or(tokens[before].frames.has('finite_clause') ? tag(before, 'V') : 'false',
      and(tag(before, 'J'), not(nominal(before)), tag(before - 1, 'V')),
      and(inFirst[before], not(H(before)), not(tag(before, 'V')))))
    afterFirst[index] = start || token.com ? 'false' : define(`af${index}`, or(and(inFirst[before], H(before)), and(afterFirst[before], light)))
    open[index] = start || token.com ? 'true' : define(`op${index}`, or(cue[index], afterFirst[index]))
    // nominals since the last verb: one that is no pronoun, two of them, any one, any two
    const noun = and(H(before), not(tag(before, 'P')))
    some[index] = start ? 'false' : define(`n1_${index}`, and(not(tag(before, 'V')), or(noun, some[before])))
    two[index] = start ? 'false' : define(`n2_${index}`, and(not(tag(before, 'V')), or(and(noun, some[before]), two[before])))
    any[index] = start ? 'false' : define(`o1_${index}`, and(not(tag(before, 'V')), or(H(before), any[before])))
    anyTwo[index] = start ? 'false' : define(`o2_${index}`, and(not(tag(before, 'V')), or(and(H(before), any[before]), anyTwo[before])))
    // the nominal that ends right before, auxiliaries and adverbs aside, is singular / is plural
    const oneBefore = !inside(before) ? 'false' : tokens[before].flags.thirdSingular ? tag(before, 'P', 'D')
      : !tokens[before].flags.plural && !['i', 'you', 'we', 'they'].includes(tokens[before].lower) ? tag(before, 'N') : 'false'
    const severalBefore = !inside(before) ? 'false' : tokens[before].flags.plural ? tag(before, 'N')
      : ['i', 'you', 'we', 'they'].includes(tokens[before].lower) ? 'true' : !['one', '1'].includes(tokens[before].lower) ? tag(before, 'Q') : 'false'
    singular[index] = start || token.com ? 'false' : define(`sg${index}`, or(and(H(before), oneBefore), and(singular[before], light)))
    plural[index] = start || token.com ? 'false' : define(`pl${index}`, or(and(H(before), severalBefore), and(plural[before], light)))
    // the kind of the nearest auxiliary before: be, have, or a modal or do
    const chain = (list, name, kind) => {
      list[index] = start || token.com ? 'false' : define(`${name}${index}`, or(tokens[before].flags[kind] ? tag(before, 'X') : 'false', and(list[before], tag(before, 'R', 'G'))))
    }
    chain(beBefore, 'xb', 'be'); chain(haveBefore, 'xh', 'have'); chain(modalBefore, 'xm', 'modal')
    // this word is in a nominal that begins with "a", "each", "this": its head is singular
    oneOnly[index] = define(`sd${index}`, and(nominal(index), or(token.flags.singularDeterminer ? tag(index, 'D') : 'false',
      adjacent(index) ? and(oneOnly[before], Dp(before)) : 'false')))
    if (token.flags.plural) soft(not(and(oneOnly[index], head[index], tag(index, 'N'))), 6)
    // this word is in a nominal that begins right after another nominal, nothing between them
    stacked[index] = define(`st${index}`, and(nominal(index), adjacent(index) ? or(H(before), and(stacked[before], Dp(before))) : 'false'))
    // this word is in a nominal that begins with a number: "two inches"
    counted[index] = define(`qn${index}`, and(nominal(index), or(and(tag(index, 'Q'), not(Dp(before))), adjacent(index) ? and(counted[before], Dp(before)) : 'false')))
  }
  for (const add of deferred) add()
  // a verb with its auxiliary follows, adverbs and (in a question) the subject aside
  const verbAhead = [], subjectAhead = [], relativeAhead = []
  const contextVars = tokens.map(() => new Map())
  const context = (index, key) => inside(index) ? contextVars[index].get(key) ?? 'false' : 'false'
  for (const [index, token] of tokens.entries()) {
    if (!token.cand.has('V')) continue
    for (const [key, forms] of Object.entries(contexts)) {
      if (!forms.some((form) => token.form[form])) continue
      if (key === 'q' && !token.flags.be) continue
      contextVars[index].set(key, declare(`v${key}${index}`))
    }
  }
  for (let index = count - 1; index >= 0; index--) {
    const next = index + 1
    const follows = joined(next) && !tokens[next].com
    verbAhead[index] = define(`va_${index}`, or(context(index, 'a'), and(tag(index, 'X', 'R', 'G'), follows ? verbAhead[next] : 'false')))
    subjectAhead[index] = define(`sa_${index}`, or(and(Dp(index), follows ? subjectAhead[next] : 'false'), and(H(index), follows ? verbAhead[next] : 'false')))
    relativeAhead[index] = define(`ra_${index}`, or(context(index, 'r'), and(tag(index, 'X', 'R', 'G'), follows ? relativeAhead[next] : 'false')))
  }

  for (const [index, token] of tokens.entries()) {
    const before = index - 1, next = index + 1
    const verb = tag(index, 'V')
    const vars = contextVars[index]
    if (token.cand.has('V')) {
      // a verb stands in exactly one licensing construction
      hard(implies(verb, or([...vars.values()])))
      for (const variable of vars.values()) hard(implies(variable, verb))
      atMostOne([...vars.values()])
      const noun = (at) => and(H(at), not(tag(at, 'P')))
      const license = {
        i: free[index],
        s: and(subject[index], not(auxBefore[index]), open[index]),
        a: or(auxBefore[index], inverted[index]),
        t: toBefore[index],
        // after a nominal that is no pronoun ("a bird facing left"), after a marker ("after
        // sorting it"); an -ing form also after a verb ("keep going", "sitting facing right")
        p: or(free[index], adjacent(index) ? or(noun(before), tag(before, 'M'), token.form.ing ? tag(before, 'V') : 'false',
          and(tag(before, 'R'), adjacent(before) ? or(noun(before - 1), token.form.ing ? tag(before - 1, 'V') : 'false') : 'false')) : 'false'),
        b: adjacent(index) ? or(and(H(before), causative[index]), and(tag(before, 'V'), tokens[before].frames.has('bare_infinitive') ? 'true' : 'false')) : 'false',
        r: relBefore[index],
        q: and(free[index], adjacent(next) ? nominal(next) : 'false')
      }
      for (const [key, variable] of vars) hard(implies(variable, license[key]))
      // the auxiliary right before settles the form: "is moving", "was moved", "has moved", "can move"
      if (vars.has('a')) hard(implies(and(vars.get('a'), auxBefore[index]), or(token.form.base ? modalBefore[index] : 'false',
        token.form.ing ? beBefore[index] : 'false', token.form.part ? or(beBefore[index], haveBefore[index]) : 'false')))
      // preferences among the constructions
      // "let us book a room": the verb that takes a bare infinitive after its object has one here
      // (a word that also describes is the commoner reading there: "make it wide")
      if (vars.has('b') && adjacent(index) && !token.cand.has('J')) soft(implies(and(H(before), causative[index]), vars.get('b')), 4)
      if (vars.has('i')) {
        // first in the clause and before a determiner or a pronoun: a command with its object
        const object = adjacent(next) ? tag(next, 'D', 'P') : 'false'
        soft(implies(and(free[index], object), verb), 6)
        soft(implies(free[index], verb), 2)
        // joined clauses are alike: a command after "and" follows another verb
        if (inside(before) && !tokens[before].brk) soft(implies(and(vars.get('i'), tag(before, 'C')), hasVerb[before]), 4)
      }
      if (vars.has('p')) {
        // a participle between a nominal and what follows it opens a clause on that nominal
        const tail = adjacent(next) ? or(nominal(next), tag(next, 'M', 'R', 'J')) : 'false'
        // (after the first object of a verb that takes two, it may describe the second: "give the
        // avatar closed eyes"; a name takes no such word: "a heading called Harbour")
        const second = adjacent(next) && (tokens[next].flags.capital || tokens[next].flags.quote) ? 'false' : doubleObject[index]
        if (adjacent(index)) soft(implies(and(H(before), not(tag(before, 'P')), tail, not(second)), verb), 5)
        // at the head of a clause and right before a noun or an adjective it is more often a describing word: "stacked bar chart"
        if (adjacent(next)) soft(not(and(vars.get('p'), free[index], not(adjacent(index) ? H(before) : 'false'), tag(next, 'N', 'J'))), 3)
        // a participle clause on a nominal has more than its verb: "the chapter heading" is no clause
        if (adjacent(index) && !adjacent(next)) soft(not(and(vars.get('p'), H(before))), 4)
        else if (adjacent(index)) soft(not(and(vars.get('p'), H(before), tag(next, 'C'))), 4)
        if (vars.has('s')) {
          // "-ed" after a nominal: a participle when the clause already has its verb
          soft(implies(vars.get('p'), hasVerb[index]), 3)
          soft(implies(vars.get('s'), not(hasVerb[index])), 2)
        }
      }
      // a second finite clause with nothing to introduce it is the less likely reading
      if (vars.has('s')) soft(implies(vars.get('s'), cue[index]), 4)
      // so is a subject that stands right after another nominal: "[the bone needs] [two] cause"
      if (vars.has('s') && adjacent(index)) soft(not(and(vars.get('s'), H(before), stacked[before])), 4)
      if (vars.has('s') && !token.form.past && !token.flags.be) {
        // agreement of a verb with its subject: "it moves", "they move"
        if (token.form.third && !token.form.base) {
          soft(not(and(vars.get('s'), plural[index])), 4)
          // a pronoun takes no noun after it: "it faces left"
          if (inside(before) && tokens[before].flags.thirdSingular) soft(implies(and(singular[index], open[index]), vars.get('s')), 5)
        } else if (token.form.base && !token.form.third) soft(not(and(vars.get('s'), singular[index])), 10)
      }
    }
    // an auxiliary supports a verb
    if (token.cand.has('X')) {
      const follows = adjacent(next)
      soft(implies(tag(index, 'X'), follows ? or(verbAhead[next], subjectAhead[next]) : 'false'), 20)
    }
    // infinitival "to" stands before its verb
    if (token.cand.has('T')) {
      hard(implies(tag(index, 'T'), adjacent(next) ? or(context(next, 't'), and(tag(next, 'R', 'G'), adjacent(next + 1) ? context(next + 1, 't') : 'false')) : 'false'))
      if (!token.flags.complexTo && !(inside(next) && tokens[next].flags.capital)) soft(tag(index, 'T'), 2)
    }
    // a marker introduces a nominal or a clause
    if (token.cand.has('M')) {
      const follows = adjacent(next)
      // (a word that introduces clauses only is followed by the clause, not by another marker)
      const clauseOnly = token.flags.rel || (token.flags.subordinator && !token.flags.preposition)
      const target = follows ? or(clauseOnly ? 'false' : tag(next, 'M', 'T'), nominal(next), context(next, 'p'), relativeAhead[next],
        and(tag(next, 'R', 'G'), adjacent(next + 1) ? or(nominal(next + 1), clauseOnly ? 'false' : tag(next + 1, 'M')) : 'false')) : 'false'
      soft(implies(tag(index, 'M'), target), 12)
      // a relative word follows the nominal it describes, or a verb or adjective it completes
      if (token.flags.rel && !token.flags.subordinator) hard(implies(tag(index, 'M'), joined(index) ? or(H(before), tag(before, 'V', 'J')) : 'false'))
    }
    // joined words are alike: an adjective after "and" when an adjective stands before it
    if (token.cand.has('C') && adjacent(index) && adjacent(next) && tokens[next].cand.has('J')) {
      soft(implies(and(tag(index, 'C'), tag(before, 'J'), not(nominal(before))), tag(next, 'J')), 3)
    }
    // possessive 's: between the owner and the thing owned
    if (token.cand.has('S')) {
      hard(implies(tag(index, 'S'), and(adjacent(index) ? and(H(before), not(tag(before, 'P'))) : 'false',
        adjacent(next) ? and(nominal(next), not(tag(next, 'D', 'P'))) : 'false')))
      soft(tag(index, 'S'), 4)
    }
  }

  // fixed multiword markers
  const units = complex.map(({first, last}, index) => {
    const unit = declare(`mw${index}`)
    for (let at = first; at <= last; at++) hard(implies(unit, tag(at, 'M')))
    soft(unit, 10)
    return {first, last, unit}
  })
  for (const [index, token] of tokens.entries()) {
    if (token.flags.complexOnly) hard(implies(tag(index, 'M'), or(units.filter(({first, last}) => first <= index && index <= last).map(({unit}) => unit))))
  }

  // where a marker phrase starts: the clause, the nominal before it, or left unsettled
  const attach = tokens.map((token, index) => {
    if (!token.cand.has('M') && !token.cand.has('S')) return null
    const before = index - 1
    const begins = and(tag(index, 'M', 'S'), not(tag(before, 'M')))
    const options = {clause: declare(`ac${index}`), nominal: declare(`an${index}`), ambiguous: declare(`ax${index}`)}
    const names = Object.values(options)
    hard(implies(begins, or(names)))
    for (const name of names) hard(implies(name, begins))
    atMostOne(names)
    const noun = (at) => and(H(at), not(tag(at, 'P')))
    // right after a nominal, one adjective or adverb aside
    const follows = adjacent(index) ? or(noun(before), and(tag(before, 'J', 'R'), not(nominal(before)), adjacent(before) ? noun(before - 1) : 'false')) : 'false'
    // the words settle the start at the nominal before the marker in three cases
    const settled = and(follows, or(
      token.flags.of ? 'true' : 'false',                    // "of" and 's tie two nominals
      and(not(hasVerb[index]), not(two[index])),            // no verb before it and one nominal only
      // a measure: a nominal right after the object of the verb, "the lamp [two inches] from the edge"
      // (a bare number after a noun labels the noun instead: "Room 4 for Planning")
      and(adjacent(index) ? H(before) : 'false', stacked[before] ?? 'false', hasVerb[index],
        not(and(tag(before, 'Q'), not(Dp(before - 1)), tag(before - 1, 'N'))))))
    if (evidence) {
      // with a parser: its attachment is heard, and the three cases above are the default
      hard(implies(options.nominal, follows))
      soft(implies(and(begins, settled), options.nominal), 3)
      soft(implies(options.clause, not(some[index])), 2)
      soft(implies(options.ambiguous, some[index]), 2)
      soft(not(options.ambiguous), 1)
      if (evidence[index]?.attachment) soft(implies(begins, options[evidence[index].attachment]), evidenceWeight.attachment)
      return options
    }
    hard(implies(options.nominal, settled))
    hard(implies(and(begins, settled), options.nominal))
    // otherwise at the clause when no nominal stands between its verb and the marker
    hard(implies(options.clause, not(some[index])))
    hard(implies(options.ambiguous, some[index]))
    return options
  })

  query.forEach((name, order) => lines.push(`(assert-soft (not ${name}) :weight ${1 + order * 37 % 11})`))
  return {
    smt: lines.join('\n'), query,
    read(model) {
      const on = (name) => name === 'true' || (name !== 'false' && model.get(name) === true)
      return tokens.map((token, index) => ({
        tag: [...tagVars[index]].find(([, name]) => on(name))?.[0] ?? [...token.cand.keys()][0],
        head: on(head[index]), dependent: on(dep[index]),
        context: [...contextVars[index]].find(([, name]) => on(name))?.[0],
        attachment: attach[index] ? Object.entries(attach[index]).find(([, name]) => on(name))?.[0] : undefined
      }))
    }
  }
}
