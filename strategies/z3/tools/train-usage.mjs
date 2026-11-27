// Learn, from message text alone, how each open-class word is used: as a verb, as the head
// of a nominal, or as a describing word. No annotation is read. The evidence is word order
// around function words: a word after a determiner and before a preposition heads a nominal;
// a word that opens a clause before a determiner, or follows "to" or a modal, is a verb; a
// word after "very", or closing a clause after "is" or "it", describes; a word between a
// determiner and a noun stands before a head, as a describing word or as a noun does. The counts
// are the model of the Z3 strategy for nouns, verbs and adjectives (strategies/z3/model/usage.json).
// Usage: node strategies/z3/tools/train-usage.mjs <dataset folder> [out.json]
import {writeFileSync} from 'node:fs'
import {wordsOf} from '../../../lib/syntax.mjs'
import {readMessages} from '../../vss/src/corpus.mjs'
import * as en from '../src/syntax/english.mjs'

const [dataset, out = new URL('../model/usage.json', import.meta.url).pathname] = process.argv.slice(2)
const texts = readMessages(dataset)
const determiner = (word) => en.articles.has(word) || en.possessives.has(word) || en.quantifiers.has(word) || en.otherDeterminers.has(word)
const auxiliary = (word) => en.modals.has(word) || en.beForms.has(word) || en.haveForms.has(word) || en.doForms.has(word)
const closed = (word) => determiner(word) || auxiliary(word) || en.pronouns.has(word) || en.negations.has(word) || en.corePrepositions.has(word) ||
  en.subordinators.has(word) || en.coordinators.has(word) || en.clauseJoiners.has(word) || en.interjections.has(word) || en.whWords.has(word) ||
  en.cardinals.has(word) || en.degreeWords.has(word) || word === "'s" || word === 'there' || !/^\p{L}[\p{L}']*$/u.test(word)
const counts = new Map()
const add = (word, key) => {
  if (!counts.has(word)) counts.set(word, {noun: 0, verb: 0, adjective: 0, before: 0})
  counts.get(word)[key]++
}
// one pass for verbs and nominal heads, one more for describing words (it needs the heads)
const sentences = []
for (const text of texts) {
  const words = wordsOf(text)
  let sentence = []
  for (const [index, word] of words.entries()) {
    const gap = text.slice(index ? words[index - 1].end : 0, word.start)
    if (index && /[.!?;:…—–]|\s-\s/u.test(gap)) { sentences.push(sentence); sentence = [] }
    sentence.push({lower: word.text.toLowerCase().replaceAll('’', "'"), comma: /,/u.test(gap), capital: /^\p{Lu}/u.test(word.text) && index > 0})
  }
  sentences.push(sentence)
}
const ends = (next) => !next || next.comma || en.prepositions.has(next.lower) || en.beForms.has(next.lower) || en.modals.has(next.lower)
const opens = (sentence, index) => index === 0 || sentence[index].comma || en.coordinators.has(sentence[index - 1].lower) ||
  en.clauseJoiners.has(sentence[index - 1].lower) || en.interjections.has(sentence[index - 1].lower)
const objectStart = (next) => next && !next.comma && (determiner(next.lower) || en.objectPronouns.has(next.lower) || next.lower === 'it')
for (const sentence of sentences) {
  for (const [index, {lower, capital}] of sentence.entries()) {
    if (closed(lower) || capital) continue
    const previous = sentence[index].comma ? undefined : sentence[index - 1]?.lower, next = sentence[index + 1]
    if ((opens(sentence, index) && objectStart(next)) || (previous === 'to' && objectStart(next)) ||
        (previous && (en.modals.has(previous) || en.doForms.has(previous) || previous === "n't" || en.subjectPronouns.has(previous)) && !auxiliary(lower))) add(lower, 'verb')
    else if (previous && (determiner(previous) || en.cardinals.has(previous)) && ends(next)) add(lower, 'noun')
    else if (previous && en.degreeWords.has(previous)) add(lower, 'adjective')
    else if (previous && (en.beForms.has(previous) || previous === 'it' || previous === 'them') && (!next || next.comma)) add(lower, 'adjective')
  }
}
for (const sentence of sentences) {
  for (const [index, {lower, capital}] of sentence.entries()) {
    if (closed(lower) || capital || index === 0 || sentence[index].comma) continue
    const next = sentence[index + 1]
    if (!next || next.comma || closed(next.lower)) continue
    const head = counts.get(next.lower)
    // between a determiner and a word that mostly heads nominals: a describing word
    if (determiner(sentence[index - 1].lower) && head && head.noun > 2 * (head.verb + head.adjective)) add(lower, 'before')
  }
}
// rare words say little: keep a word seen at least three times in these places
const kept = Object.fromEntries([...counts].filter(([, count]) => count.noun + count.verb + count.adjective + count.before >= 3).sort(([a], [b]) => a < b ? -1 : 1)
  .map(([word, count]) => [word, [count.noun, count.verb, count.adjective, count.before]]))
writeFileSync(out, JSON.stringify({about: 'How often a word stood as [head of a nominal, verb, describing word after "be", "it" or a degree word, word before the head of a nominal] in unannotated message text; see strategies/z3/tools/train-usage.mjs',
  messages: texts.length, words: kept}).replace(/\],/gu, '],\n'))
console.log(`${texts.length} messages, ${Object.keys(kept).length} words -> ${out}`)
