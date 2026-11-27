// Counts, over the raw text of the dataset's messages, how each word stands after a determiner, and
// writes them to describing-words.mjs, which word-repairs.mjs reads.
//
//   node strategies/spacy-direct/learn-describing.mjs [folder of syntactic files]
//
// The tagger reads a word that can be a noun or an adjective by the habits of edited prose, and in a
// short request it often takes a colour or a shape word for a noun: "tint the Intro node orange" with
// "orange" the head of "the Intro node orange". English shows the class of such a word by where it
// stands (Huddleston and Pullum 2002, ch. 6, the distributional tests for adjectives): an adjective
// stands between a determiner and the noun it describes ("an orange circle") far more often than it
// ends a nominal ("the orange"); it has no plural ("bars" but no "oranges" in these messages); and it
// stands alone after an object pronoun or a form of "be" ("make it orange", "is orange"), where a
// singular noun needs a determiner. A noun used to describe another ("the bar chart", "the heading
// text") passes the first test but fails the other two. In the same way a noun stands after a
// determiner, a verb after "to", a subject pronoun or a modal: the two counts tell a noun the tagger
// read as a verb ("the chapter heading", "the bottom tick numbers") from a verb.
// Only the text of the messages is read: no label, no annotation, no parse. The function words
// counted around the words (determiners, pronouns, forms of "be", prepositions, conjunctions) are
// the only words named here.
import {writeFileSync} from 'node:fs'
import {wordsOf} from '../../lib/syntax.mjs'
import {readLabels} from '../../tests/benchmark/syntax/lib.mjs'

// determiners, which open a nominal
const DETERMINER = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'every', 'each', 'some', 'any', 'no', 'another',
  'my', 'your', 'his', 'her', 'its', 'our', 'their'])
// the object pronouns and the forms of "be" after which a word alone says how a thing is
const PREDICATING = new Set(['it', 'them', 'is', 'are', 'was', 'were', 'be'])
// the words after which a verb stands: the "to" of an infinitive, the subject pronouns and the modals
const VERBAL = new Set(['to', 'i', 'you', 'we', 'they', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must'])
// the function words that end a nominal: prepositions, conjunctions, auxiliaries, linking adverbs
const CLOSING = new Set(['of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'onto', 'over', 'under', 'above', 'below',
  'behind', 'beside', 'between', 'near', 'next', 'across', 'along', 'around', 'through', 'toward', 'towards', 'up', 'down', 'off', 'out',
  'and', 'or', 'but', 'so', 'then', 'that', 'which', 'who', 'is', 'are', 'was', 'be', 'should', 'would', 'can', 'could', 'will', 'as',
  'than', 'too', 'instead', 'now', 'again', 'there', 'here', 'like', 'about', 'after', 'before', 'while', 'if', 'when', 'where'])
// a mark that parts two words
const PART = /[.!?;:,—–()"]/u
const SMALL = /^\p{Ll}[\p{Ll}-]*$/u
// the fewest uses after a determiner for which a word is written out
const LEAST_USES = 5

const texts = [...readLabels(process.argv[2]).files.keys()]
// word -> [after a determiner and before another small-lettered word, after a determiner and ending the
// nominal, alone after an object pronoun or a form of "be", all uses, after a determiner, after a word
// before a verb]
const counts = new Map()
const of = word => counts.get(word) ?? counts.set(word, [0, 0, 0, 0, 0, 0]).get(word)
for (const text of texts) {
  const words = wordsOf(text)
  for (let index = 0; index < words.length; index++) {
    const word = words[index].text, previous = words[index - 1], next = words[index + 1]
    if (!SMALL.test(word)) continue
    const count = of(word)
    count[3]++
    if (!previous || PART.test(text.slice(previous.end, words[index].start))) continue
    const ends = !next || PART.test(text.slice(words[index].end, next.start)) || CLOSING.has(next.text.toLowerCase())
    const before = previous.text.toLowerCase()
    if (VERBAL.has(before)) count[5]++
    // ("this" and "that" also stand for a thing, as the subject of a verb: "that looks odd")
    if (DETERMINER.has(before) && before !== 'this' && before !== 'that') count[4]++
    if (DETERMINER.has(before)) {
      if (ends) count[1]++
      else if (SMALL.test(next.text)) count[0]++
    }
    if (PREDICATING.has(before) && ends) count[2]++
  }
}
// the plural of a word: the word with -s or -es
const plural = word => (counts.get(word + 's')?.[3] ?? 0) || (counts.get(word + 'es')?.[3] ?? 0)
const kept = [...counts].filter(([, [before, ending]]) => before + ending >= LEAST_USES).sort((a, b) => a[0] < b[0] ? -1 : 1)
writeFileSync(new URL('describing-words.mjs', import.meta.url), `// Written by learn-describing.mjs from the raw text of ${texts.length} messages; do not edit.
export const LEAST_USES = ${LEAST_USES}
// For each small-lettered word that stands after a determiner at least LEAST_USES times: [uses after a
// determiner before another small-lettered word, uses after a determiner that end the nominal, uses alone
// after "it", "them" or a form of "be", all uses, uses of its plural, all uses after a determiner other than
// "this" and "that", uses after "to", a subject pronoun or a modal].
export const USES = {
${kept.map(([word, [before, ending, alone, all, determined, verbal]]) => `  ${JSON.stringify(word)}: [${[before, ending, alone, all, plural(word), determined, verbal].join(', ')}],`).join('\n')}
}
`)
console.log(texts.length + ' messages, ' + kept.length + ' words')
