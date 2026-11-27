// Counts, over the raw text of the dataset's messages, how each word opens a sentence, and writes
// them to command-openers.mjs, which word-repairs.mjs reads.
//
//   node strategies/spacy-direct/learn-openers.mjs [folder of syntactic files]
//
// A command opens with its verb, and a verb takes its object right after it: "plot the sales",
// "slide the box left". A noun that opens a sentence is followed by more of its nominal or by a
// linking word ("sales by month", "legend on the right"), almost never by a determiner or an object
// pronoun. So the share of the openings of a word that a determiner or an object pronoun follows
// tells, from the raw text alone, whether the word opens commands. A determiner opens a nominal, so
// two words that the text writes after a determiner ("the chart title") form one nominal, and the
// first of them opens no command there ("chart title in the top left corner").
// Only the text of the messages is read: no label, no annotation, no parse. The function words
// counted around the words are the only words named here.
import {writeFileSync} from 'node:fs'
import {wordsOf} from '../../lib/syntax.mjs'
import {readLabels} from '../../tests/benchmark/syntax/lib.mjs'

// determiners, possessive determiners and object pronouns, which open what a verb takes
const OBJECT_OPENING = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'every', 'each', 'all', 'both', 'some', 'any', 'another',
  'my', 'your', 'his', 'its', 'our', 'their', 'it', 'them', 'me', 'us', 'him'])
// determiners, which open a nominal
const DETERMINER = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'every', 'each', 'some', 'any', 'no', 'another',
  'my', 'your', 'his', 'her', 'its', 'our', 'their'])
// the marks that end a sentence, and those that part two words
const SENTENCE_END = /[.!?;:—–]/u
const PART = /[.!?;:,—–]/u
// the fewest openings for which a word is written out; the share of them, followed by a determiner or
// an object pronoun, from which a word opens commands; the fewest times a pair must stand after a determiner
const LEAST_OPENINGS = 5
const OPENER_SHARE = 0.5
const LEAST_PAIRS = 2

const texts = [...readLabels(process.argv[2]).files.keys()]
const openings = new Map(), pairs = new Map()
let sentences = 0
for (const text of texts) {
  const words = wordsOf(text)
  const apart = (a, b) => PART.test(text.slice(words[a].end, words[b].start))
  for (let index = 0; index < words.length; index++) {
    const word = words[index].text.toLowerCase(), next = words[index + 1]
    if (index > 0 && DETERMINER.has(words[index - 1].text.toLowerCase()) && !apart(index - 1, index) && next && !apart(index, index + 1) && /^\p{Ll}+$/u.test(next.text)) {
      const key = word + ' ' + next.text
      pairs.set(key, (pairs.get(key) ?? 0) + 1)
    }
    if (index > 0 && !SENTENCE_END.test(text.slice(words[index - 1].end, words[index].start))) continue
    if (!/^\p{Ll}+$/u.test(word)) continue
    sentences++
    const count = openings.get(word) ?? openings.set(word, [0, 0]).get(word)
    count[0]++
    if (next && OBJECT_OPENING.has(next.text.toLowerCase()) && !apart(index, index + 1)) count[1]++
  }
}
const kept = [...openings].filter(([, [first]]) => first >= LEAST_OPENINGS).sort((a, b) => a[0] < b[0] ? -1 : 1)
const opener = ([, [first, before]]) => before >= OPENER_SHARE * first
const openers = new Set(kept.filter(opener).map(([word]) => word))
const nominal = [...pairs].filter(([key, count]) => count >= LEAST_PAIRS && openers.has(key.split(' ')[0])).map(([key]) => key).sort()
writeFileSync(new URL('command-openers.mjs', import.meta.url), `// Written by learn-openers.mjs from the raw text of ${texts.length} messages (${sentences} sentences); do not edit.
export const LEAST_OPENINGS = ${LEAST_OPENINGS}
export const OPENER_SHARE = ${OPENER_SHARE}
// For each word that opens at least LEAST_OPENINGS sentences: [sentences it opens, of those, the ones
// where a determiner or an object pronoun follows it].
export const OPENINGS = {
${kept.map(([word, [first, before]]) => `  ${JSON.stringify(word)}: [${first}, ${before}],`).join('\n')}
}
// The pairs of words, the first a word that opens commands, that stand after a determiner at least ${LEAST_PAIRS} times.
export const NOMINAL_PAIRS = new Set([
${nominal.map(key => '  ' + JSON.stringify(key) + ',').join('\n')}
])
`)
console.log(texts.length + ' messages, ' + sentences + ' sentences, ' + kept.length + ' words, ' + openers.size + ' open commands, ' + nominal.length + ' nominal pairs')
