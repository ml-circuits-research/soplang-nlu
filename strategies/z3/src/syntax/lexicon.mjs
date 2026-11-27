// What each word of a message may be. Function words and common verbs come from english.mjs.
// Nouns, verbs and describing words come from the usage model (model/usage.json): counts of
// how a word stood in unannotated message text, learnt by tools/train-usage.mjs. Endings and
// position supply the rest. The constraint model chooses among these readings.
import {readFileSync} from 'node:fs'
import {wordsOf} from '../../../../lib/syntax.mjs'
import * as en from './english.mjs'

// British and American spellings of one word, by their endings: the counts of both are its counts.
const spellings = [[/our$/u, 'or'], [/our(s|ed|ing)$/u, 'or$1'], [/tre$/u, 'ter'], [/tres$/u, 'ters'], [/is(e|es|ed|ing|ation)$/u, 'iz$1'], [/ys(e|es|ed|ing)$/u, 'yz$1']]
const variantOf = (word) => { for (const [pattern, other] of spellings) if (pattern.test(word)) return word.replace(pattern, other); return null }

/**
 * {usage: word -> {noun, verb, adjective}, frames: verb -> Set of what it takes}.
 * @param file the usage model; an object {words: {word: [noun, verb, adjective]}} is taken as it is
 */
export function loadLexicon(file = new URL('../../model/usage.json', import.meta.url)) {
  const model = typeof file === 'object' && !(file instanceof URL) ? file : JSON.parse(readFileSync(file, 'utf8'))
  // A word seen before the head of a nominal is a describing word or a noun ("red box", "bar
  // chart"). What tells them apart: a noun heads nominals and has a plural; a describing word
  // stands after "is", "it" or "very". The sightings before a head go to the two readings in
  // that proportion.
  const heads = (word) => model.words[word]?.[0] ?? 0
  const usage = new Map(Object.entries(model.words).map(([word, [noun, verb, adjective, before = 0]]) => {
    const plural = heads(word + 's') + heads(word + 'es') + (word.endsWith('y') ? heads(word.slice(0, -1) + 'ies') : 0)
    // (a word with no plural that stands before heads and hardly ever heads a nominal describes)
    const share = plural === 0 && noun * 20 < noun + before ? 1 : (adjective + 1) / (adjective + noun + plural + 2)
    return [word, {noun: noun + Math.round(before * (1 - share)), verb, adjective: adjective + Math.round(before * share)}]
  }))
  for (const [word, counts] of [...usage]) {
    const other = usage.get(variantOf(word))
    if (other) for (const key of Object.keys(counts)) counts[key] = other[key] = Math.max(counts[key], other[key])
  }
  // common verbs, and what three kinds of them take
  const frames = new Map()
  const frame = (verbs, name) => { for (const verb of verbs) frames.set(verb, (frames.get(verb) ?? new Set()).add(name)) }
  frame(new Set(['be', 'have', 'do', ...[...en.irregularVerbForms.values()].flat().map(({lemma}) => lemma)]), 'verb')
  frame(en.bareInfinitiveVerbs, 'bare_infinitive')
  frame(en.clauseVerbs, 'finite_clause')
  frame(en.doubleObjectVerbs, 'double_object')
  return {usage: {get: (word) => usage.get(word) ?? usage.get(variantOf(word)), has: (word) => usage.has(word) || usage.has(variantOf(word))}, frames}
}

const consonant = /[bcdfghjklmnpqrstvwxz]/u
const undoubled = (stem) => stem.length >= 3 && stem.at(-1) === stem.at(-2) && consonant.test(stem.at(-1)) ? [stem.slice(0, -1)] : []
/**
 * The tokens of a message for the model: one per word of `wordsOf`, except that the words
 * between a pair of quotation marks form one token (a quoted literal).
 * @returns [{first, last, text, lower, brk, com, question, cand: Map(tag -> weight), form, frames, flags}]
 * Tags: V verb, X auxiliary, N noun, P pronoun, D determiner, J adjective, R adverb, M marker,
 * T infinitival "to", C coordinator, G negation, I interjection, Q numeral, S possessive 's.
 */
export function readTokens(text, lexicon) {
  const words = wordsOf(text)
  const {usage, frames} = lexicon
  // a verb: a common verb, or a word the model saw as a verb more than once in a while
  const isVerb = (lemma) => {
    const counts = usage.get(lemma)
    return frames.has(lemma) || (counts !== undefined && counts.verb >= 3 && counts.verb * 100 >= counts.noun + counts.adjective)
  }
  const known = (lemma) => usage.has(lemma) || frames.has(lemma)
  // quoted literals: the words between a pair of quotation marks
  const inWord = new Set(words.flatMap((word) => Array.from({length: word.end - word.start}, (_, offset) => word.start + offset)))
  const islands = []
  let open = null
  for (const mark of text.matchAll(/["“”«»'‘’]/gu)) {
    if (inWord.has(mark.index)) continue
    const single = /['‘’]/u.test(mark[0])
    const before = /[\p{L}\p{N}]/u.test(text[mark.index - 1] ?? ''), after = /[\p{L}\p{N}]/u.test(text[mark.index + 1] ?? '')
    if (!open) { if (!single || (after && !before)) open = {single, at: mark.index} }
    else if (open.single === single && (!single || !after)) { islands.push([open.at, mark.index]); open = null }
  }
  const islandOf = (word) => islands.findIndex(([from, to]) => word.start > from && word.end <= to)
  const tail = text.slice(words.at(-1)?.end ?? 0)
  const tokens = []
  let previousIsland = -1
  for (const [index, word] of words.entries()) {
    const island = islandOf(word)
    if (island >= 0 && island === previousIsland) {
      const token = tokens.at(-1)
      token.last = index
      token.text = text.slice(words[token.first].start, word.end)
      continue
    }
    previousIsland = island
    const gap = text.slice(index ? words[index - 1].end : 0, word.start)
    const dash = /(?:^|\s)[-–—]+(?:\s|$)|[—–]/u.test(gap)
    tokens.push({first: index, last: index, text: word.text, lower: word.text.toLowerCase().replaceAll('’', "'"),
      // a mark closes a sentence part when a space follows it: "0.5cm" and "v1.2" are not cut
      brk: index === 0 || /[.!?;:…]["'”’)\]]*\s|\n/u.test(gap) || dash, com: /[,()[\]{}]/u.test(gap), sentenceBreak: /[.!?…]["'”’)\]]*\s/u.test(gap),
      flags: {quote: island >= 0}})
  }
  const gapBefore = (token) => text.slice(token.first ? words[token.first - 1].end : 0, words[token.first].start)
  let start = 0
  for (const [index, token] of tokens.entries()) {
    if (token.brk) start = index
    token.sentence = start
    const after = index + 1 < tokens.length ? gapBefore(tokens[index + 1]) : tail
    token.endsSentence = index + 1 === tokens.length || tokens[index + 1].brk
    if (token.endsSentence) for (let k = start; k <= index; k++) tokens[k].question = after.includes('?')
  }
  const titleCase = tokens.length >= 3 && tokens.filter((token) => /^\p{Lu}/u.test(token.text)).length > 0.6 * tokens.length

  const irregularLemmas = new Set([...en.irregularVerbForms.values()].flat().map(({lemma}) => lemma))
  function verbForms(lower) {
    const forms = []
    for (const {lemma, past, participle} of en.irregularVerbForms.get(lower) ?? []) forms.push({lemma, past, part: participle})
    const first = (stems, form) => {
      const lemma = stems.find((stem) => stem.length >= 2 && isVerb(stem) && !(form.past && irregularLemmas.has(stem)))
      if (lemma) forms.push({lemma, ...form})
    }
    if (lower.endsWith('ies')) first([lower.slice(0, -3) + 'y'], {third: true})
    else if (/(?:ch|sh|x|z|ss|o)es$/u.test(lower)) first([lower.slice(0, -2), lower.slice(0, -1)], {third: true})
    else if (lower.endsWith('s') && !/(?:ss|us|is)$/u.test(lower)) first([lower.slice(0, -1)], {third: true})
    if (lower.endsWith('ied')) first([lower.slice(0, -3) + 'y'], {past: true, part: true})
    else if (lower.endsWith('ed') && lower.length > 3) {
      const stem = lower.slice(0, -2)
      first([stem, lower.slice(0, -1), ...undoubled(stem)], {past: true, part: true})
    }
    if (lower.endsWith('ing') && lower.length > 4) {
      const stem = lower.slice(0, -3)
      first([stem, stem + 'e', ...undoubled(stem), ...(stem.endsWith('y') ? [stem.slice(0, -1) + 'ie'] : [])], {ing: true})
    }
    // the plain form: a verb that is no inflected form of another ("need", not "changed")
    if (isVerb(lower) && (!forms.length || forms.some(({lemma}) => lemma === lower))) forms.push({lemma: lower, base: true})
    return forms
  }
  function nounLemma(lower) {
    if (usage.get(lower)?.noun > 0) return lower
    const stems = []
    if (lower.endsWith('ies')) stems.push(lower.slice(0, -3) + 'y')
    if (lower.endsWith('ves')) stems.push(lower.slice(0, -3) + 'f', lower.slice(0, -3) + 'fe')
    if (/(?:ch|sh|x|z|ss|o)es$/u.test(lower)) stems.push(lower.slice(0, -2))
    if (lower.endsWith('s') && !/(?:ss|us|is)$/u.test(lower)) stems.push(lower.slice(0, -1))
    return stems.find((stem) => stem && usage.get(stem)?.noun > 0)
  }
  function gradedAdjective(lower) {
    const stems = []
    for (const [suffix, y] of [['iest', true], ['ier', true], ['est', false], ['er', false]]) {
      if (!lower.endsWith(suffix) || lower.length < suffix.length + 2) continue
      const stem = lower.slice(0, -suffix.length)
      stems.push(...(y ? [stem + 'y'] : [stem, stem + 'e', ...undoubled(stem)]))
    }
    // "smaller", "widest": the graded form of a word that mostly describes
    return stems.find((stem) => { const counts = usage.get(stem); return counts && counts.adjective > 2 * (counts.noun + counts.verb) })
  }

  for (const [index, token] of tokens.entries()) {
    const {lower} = token
    const previous = token.brk ? undefined : tokens[index - 1]
    const next = token.endsSentence ? undefined : tokens[index + 1]
    const cand = token.cand = new Map()
    const form = token.form = {}
    const flags = token.flags
    token.frames = new Set()
    const give = (tag, weight) => cand.set(tag, Math.max(cand.get(tag) ?? 0, weight))
    if (flags.quote) { give('N', 1); continue }
    const detached = (token.brk || token.com) && (token.endsSentence || tokens[index + 1].com)
    flags.capital = /^\p{Lu}/u.test(token.text) && !token.brk && !titleCase && token.text !== 'I'
    flags.joiner = en.clauseJoiners.has(lower)
    flags.literal = /^\d{1,2}:\d{2}/u.test(lower) || /^\d{4}-\d{2}-\d{2}$/u.test(lower)
    flags.rel = en.relativizers.has(lower)
    flags.wh = en.whWords.has(lower)
    flags.predeterminer = en.predeterminers.has(lower)
    flags.approximator = en.approximators.has(lower) || (/ly$/u.test(lower) && lower.length > 4)
    flags.singularDeterminer = en.singularDeterminers.has(lower)
    flags.preposition = en.prepositions.has(lower)
    flags.subordinator = en.subordinators.has(lower)
    flags.of = lower === 'of' || lower === "'s"
    flags.thirdSingular = en.thirdSingular.has(lower)
    flags.subjectPronoun = en.subjectPronouns.has(lower)
    flags.objectPronoun = en.objectPronouns.has(lower)
    flags.quantifier = en.quantifiers.has(lower)
    flags.have = en.haveForms.has(lower) || lower === "'s" || lower === "'d"
    flags.modal = en.modals.has(lower) || en.doForms.has(lower) || lower === 'cannot'
    flags.be = en.beForms.has(lower) || lower === "'s"
    flags.do = en.doForms.has(lower)
    flags.finiteAuxiliary = en.finiteAuxiliaries.has(lower) || lower === "'s"
    let strict = true
    // numerals and signs
    if (/^[+-]?[\d.]*\d/u.test(lower) && !/^\d+(?:st|nd|rd|th)$/u.test(lower) && !/\p{L}{3}/u.test(lower)) give('Q', 4)
    else if (en.cardinals.has(lower)) give('Q', 4)
    else if (/^\d+(?:st|nd|rd|th)$/u.test(lower)) give('J', 4)
    else if (en.operatorSigns.has(lower)) give('M', 4)
    else if (!/[\p{L}\p{N}]/u.test(lower) && !en.coordinators.has(lower)) give('N', 2)
    // closed classes
    else if (lower === "'s") {
      if (previous?.lower === 'let') give('P', 6)
      else { give('S', 3); give('V', 3); give('X', 3) }
      Object.assign(form, {third: true})
    } else if (lower === 'to') { give('M', 4); give('T', 4) }
    else if (lower === 'there') { give('R', 4); if (next && (en.beForms.has(next.lower) || en.modals.has(next.lower) || next.lower === "'s")) give('P', 5) }
    else if (lower === 'cannot') give('X', 4)
    else if (lower === 'thank' && next?.lower === 'you' && (token.brk || token.com || en.interjections.has(previous?.lower))) {
      give('I', 6); flags.thankYou = true
    } else if (lower === 'you' && previous?.flags.thankYou) give('I', 6)
    else if (en.negations.has(lower)) give('G', 4)
    else if (en.modals.has(lower)) give('X', 4)
    else if (en.beForms.has(lower) || en.haveForms.has(lower) || en.doForms.has(lower)) {
      give('X', 5); give('V', 4)
      Object.assign(form, ['be', 'have', 'do'].includes(lower) ? {base: true}
        : ['been', 'done'].includes(lower) ? {part: true} : ['being', 'having'].includes(lower) ? {ing: true}
        : ['was', 'were', 'did'].includes(lower) ? {past: true} : lower === 'had' ? {past: true, part: true} : {third: true})
      if (lower === 'have' || lower === "'ve" || lower === 'do' || lower === 'are' || lower === "'re" || lower === 'am' || lower === "'m") form.third = true
      token.frames = new Set(frames.get(en.haveForms.has(lower) ? 'have' : 'do'))
    } else if (en.interjections.has(lower)) {
      give('I', 6)
      if (lower === 'thanks' && previous && (en.possessives.has(previous.lower) || en.quantifiers.has(previous.lower))) give('N', 8)
    } else if (en.coordinators.has(lower)) { give('C', 5); if (lower === 'plus') give('M', 2) }
    else if (en.articles.has(lower) || en.otherDeterminers.has(lower)) {
      give('D', 4)
      if (lower === 'no' && detached) give('I', 6)
    } else if (en.possessives.has(lower)) { give('D', 4); if (lower === 'her' || lower === 'his') give('P', 3) }
    else if (en.pronouns.has(lower)) { give('P', 4); if (flags.rel && previous) give('M', 3) }
    else if (en.quantifiers.has(lower)) {
      give('D', 4); give('P', 2)
      if (['more', 'most', 'less', 'least', 'much', 'half', 'enough'].includes(lower)) give('R', 3)
      if (lower === 'that' || (flags.rel && previous)) give('M', 3)
    } else if (en.whAdverbs.has(lower)) { give('R', 4); if (previous) give('M', 5) }
    else if (en.clauseJoiners.has(lower)) { give('R', 3); if (index > 0 && !token.sentenceBreak) give('C', 4) }
    else if (en.adverbs.has(lower) || en.degreeWords.has(lower) || en.proAdverbs.has(lower)) give('R', 5)
    else if (en.subordinators.has(lower) || en.prepositions.has(lower)) {
      give('M', 8)
      if (en.intransitivePrepositions.has(lower)) give('R', 3)
      strict = en.corePrepositions.has(lower) || !en.prepositions.has(lower)
    } else strict = false
    if (en.detachedInterjections.has(lower) && detached) { give('I', 7); strict = strict && cand.size > 1 }
    // after a preposition an adverb of place or time stands as a nominal: "from now on"
    if (en.proAdverbs.has(lower) && previous && en.prepositions.has(previous.lower)) give('N', 5)
    // a capital letter inside a sentence marks a name, also on a function word: "make A blue"
    if (flags.capital && cand.size && !cand.has('Q')) give('N', 9)

    if (!strict || !cand.size) {
      // open classes: counts of the word itself and of the lemma of an inflected form
      const closed = cand.size > 0
      const counts = {...usage.get(lower)}
      const add = (key, count) => { counts[key] = Math.max(counts[key] ?? 0, count) }
      const verbs = verbForms(lower)
      // the verb count of a word is that of its verb forms below, not of a stray sighting
      delete counts.verb
      for (const {lemma, ...kind} of verbs) {
        Object.assign(form, kind)
        // the model counts the plain form of a verb: an inflected form has a share of its count
        const share = Math.round((usage.get(lemma)?.verb ?? 0) * (kind.base ? 1 : kind.past || kind.part ? 0.3 : 0.15))
        add('verb', Math.max(share, 2))
        for (const frame of frames.get(lemma) ?? []) token.frames.add(frame)
        if (kind.ing || kind.part) add('adjective', 1)
        if (kind.ing) add('noun', 1)
      }
      const noun = nounLemma(lower)
      if (noun) add('noun', Math.max(Math.round(usage.get(noun).noun * (noun === lower ? 1 : 0.35)), 1))
      flags.plural = noun !== undefined && noun !== lower
      const graded = gradedAdjective(lower)
      if (graded) { add('adjective', usage.get(graded).adjective); counts.noun = Math.min(counts.noun ?? 0, 1) }
      if (!known(lower) && !verbs.length && !noun && !graded) {
        // a word the lexicon does not know: its ending and its position decide
        flags.unknown = true
        // endings of adverbs: "evenly", "sideways", "upwards", "clockwise"
        if ((/ly$/u.test(lower) && lower.length > 4) || /(?:wards?|ways|wise)$/u.test(lower)) give('R', 6)
        else {
          add('noun', 6); add('adjective', 1)
          if (/ing$/u.test(lower) && lower.length > 5) { add('verb', 2); form.ing = true }
          else if (/ed$/u.test(lower) && lower.length > 4) { add('verb', 2); form.past = form.part = true }
          else if (/^\p{L}+$/u.test(lower) && !flags.capital) { add('verb', 1); form.base = true }
        }
      }
      const total = Object.values(counts).reduce((sum, count) => sum + count + 1, 0)
      const weight = (count) => Math.round(8 * (count + 1) / total)
      // a word in -ly built on a known word, or hardly seen as anything else, is an adverb: "evenly", "slightly"
      const seen = Object.values(counts).reduce((sum, count) => sum + count, 0)
      if (!flags.unknown && /ly$/u.test(lower) && lower.length > 4 && !verbs.length &&
          (seen < 20 || known(lower.slice(0, -2)) || known(lower.replace(/ily$/u, 'y')) || known(lower.replace(/ally$/u, '')))) {
        give('R', 7)
        for (const key of Object.keys(counts)) counts[key] = Math.min(counts[key], 1)
      }
      const tags = {noun: 'N', verb: 'V', adjective: 'J'}
      for (const [key, count] of Object.entries(counts)) {
        // a closed-class word keeps only the open readings that are common for it
        if (closed && (count < 5 || (count + 1) / total < 0.2)) continue
        // a rare reading stays possible for a noun and for a known verb
        if (count > 0 && (weight(count) > 0 || key === 'noun' || key === 'verb')) give(tags[key], weight(count))
      }
      if (!closed) {
        // any open-class word can name a thing ("the delete button"); a name is a noun
        if (!cand.has('N')) give('N', 0)
        if (flags.capital || /^\p{Lu}{2,}$/u.test(token.text)) {
          for (const [other, weight] of cand) if (other !== 'N') cand.set(other, Math.floor(weight / 2))
          give('N', 9)
        }
      }
    }
    if (cand.has('V')) {
      flags.causative = token.frames.has('bare_infinitive')
      if (!Object.keys(form).length) form.base = true
    }
  }
  // fixed multiword markers: every word of one may be a marker
  const complex = []
  for (let first = 0; first < tokens.length; first++) {
    for (const phrase of en.complexMarkers) {
      const last = first + phrase.length - 1
      if (last >= tokens.length || !phrase.every((word, offset) => tokens[first + offset].lower === word &&
          (offset === 0 || (!tokens[first + offset].brk && !tokens[first + offset].com)))) continue
      complex.push({first, last})
      for (let index = first; index <= last; index++) {
        const token = tokens[index]
        if (!token.cand.has('M')) { token.cand.set('M', 0); token.flags.complexOnly = true }
        if (tokens[index].lower === 'to' && index === last) token.flags.complexTo = true
      }
    }
  }
  return {words, tokens, complex}
}
