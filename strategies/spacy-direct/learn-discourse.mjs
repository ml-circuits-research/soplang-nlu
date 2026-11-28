// Counts, over the raw text of the dataset's messages, where each word stands in its sentence, and writes
// the words said to the listener (discourse markers) to discourse-words.mjs, which word-repairs.mjs reads.
//
//   node strategies/spacy-direct/learn-discourse.mjs [folder of syntactic files]
//
// A word said to the listener ("thanks", "hey", "pls", "thx", "cheers") is no part of the clause it stands
// beside: it stands at an edge of what is said, at the end of the message, at the start of a sentence, or set
// off from the words around it by marks ("…, cheers", "hmm, …"). A word of the clause stands there too at
// times ("…, then make it smaller"), but also inside the sentence; and a word of the clause the text writes
// after a determiner ("the right") or after "to", a subject pronoun or a modal ("would help"), which a word of
// address never follows. So a word is said to the listener when nearly all its uses stand at an edge, some of
// them set off by marks on both sides (not only closing the message, where the last word of a clause also
// stands, "leave the rest untouched", nor only opening a sentence, where a command verb stands, "excuse me"),
// and the text never writes it after a determiner or before a verb's place.
// Only the text of the messages is read: no label, no annotation, no parse. The function words counted
// around the words (determiners, pronouns, modals, "to") are the only words named here.
import {writeFileSync} from 'node:fs'
import {wordsOf} from '../../lib/syntax.mjs'
import {readLabels} from '../../tests/benchmark/syntax/lib.mjs'

// determiners, which open a nominal; the words after which a verb stands
const DETERMINER = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'every', 'each', 'some', 'any', 'no', 'another',
  'my', 'your', 'his', 'her', 'its', 'our', 'their'])
const VERBAL = new Set(['to', 'i', 'you', 'we', 'they', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must'])
// the marks that end a sentence, and those that part two words
const SENTENCE_END = /[.!?;:—–]/u
const PART = /[.!?;:,—–()"]/u
// the fewest uses of a word for which it is judged; the share of its uses at an edge; the fewest uses, and the
// share of them, set off on both sides; the most uses after a determiner or before a verb's place
const LEAST_USES = 20
const EDGE_SHARE = 0.9
const LEAST_APART = 3, APART_SHARE = 0.05
const MOST_PLACED = 4

const texts = [...readLabels(process.argv[2]).files.keys()]
// word -> [all uses, set off on both sides (or alone), opening a sentence before other words, ending the message
// after other words, after a determiner, after "to", a subject pronoun or a modal]
const counts = new Map()
for (const text of texts) {
  const words = wordsOf(text)
  for (let index = 0; index < words.length; index++) {
    const word = words[index].text
    if (!/^\p{Ll}+$/u.test(word)) continue
    const count = counts.get(word) ?? counts.set(word, [0, 0, 0, 0, 0, 0]).get(word)
    count[0]++
    const previous = words[index - 1], next = words[index + 1]
    const opens = !previous || SENTENCE_END.test(text.slice(previous.end, words[index].start))
    const before = opens || PART.test(text.slice(previous.end, words[index].start))
    const after = !next || PART.test(text.slice(words[index].end, next.start))
    if (before && after) count[1]++
    else if (opens) count[2]++
    else if (!next) count[3]++
    if (previous && !PART.test(text.slice(previous.end, words[index].start))) {
      if (DETERMINER.has(previous.text.toLowerCase())) count[4]++
      if (VERBAL.has(previous.text.toLowerCase())) count[5]++
    }
  }
}
const said = ([, [all, apart, opens, ends, determined, verbal]]) => all >= LEAST_USES && apart + opens + ends >= EDGE_SHARE * all &&
  apart >= LEAST_APART && apart >= APART_SHARE * all && determined + verbal <= MOST_PLACED
const kept = [...counts].filter(said).sort((a, b) => a[0] < b[0] ? -1 : 1)
writeFileSync(new URL('discourse-words.mjs', import.meta.url), `// Written by learn-discourse.mjs from the raw text of ${texts.length} messages; do not edit.
// The words said to the listener: words with at least ${LEAST_USES} uses, at least ${EDGE_SHARE * 100}% of them at an edge of
// what is said (set off by marks, opening a sentence, or ending the message), at least ${LEAST_APART} and ${APART_SHARE * 100}% of
// them set off on both sides, and at most ${MOST_PLACED} after a determiner, "to", a subject pronoun or a modal.
// For each: [uses, set off, opening a sentence, ending the message, after a determiner, after "to", a pronoun or a modal].
export const DISCOURSE = {
${kept.map(([word, count]) => `  ${JSON.stringify(word)}: [${count.join(', ')}],`).join('\n')}
}
`)
console.log(texts.length + ' messages, ' + kept.length + ' words said to the listener: ' + kept.map(([word]) => word).join(' '))
