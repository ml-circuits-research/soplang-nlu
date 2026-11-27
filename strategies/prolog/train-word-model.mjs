// Learns what the Prolog grammar needs to know about open-class words from unannotated text.
//   node strategies/prolog/train-word-model.mjs <dataset checkout> [output file]
// Nothing is annotated and no word is listed by hand: a word is counted in places that only
// function words define, and the counts say how the word is used.
//   after a determiner, at the end of its phrase        -> it is used as a noun
//   before a determiner or a pronoun, where a verb can stand -> it is used as a verb
//   before nouns and also after a pronoun or "be" at the end of a clause,
//   or after a degree word                              -> it is used as a modifier
// The reader loads only the resulting file, model/word-model.json.
import {existsSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {wordsOf} from '../../lib/syntax.mjs'
import {functionWord} from './src/english.mjs'

const w = text => new Set(text.trim().split(/\s+/u))
const DETERMINER = w('a an the this that these those my your his her its our their each every another no some any')
// words that can only start an object: an article, a possessive, an object pronoun
const OBJECT_START = w('a an the my your his her its our their them me us him')
// pronouns that are no determiners: a word after one of them ends no nominal
const OBJECT = w('it them me us him')
const BEFORE_VERB = w("to please you we i they can could would will should must 'd 'll and then also just now let 's us not n't never always do")
const BE = w("is are was were be been 's 're 'm am")
const DEGREE = w('very slightly extremely somewhat fairly quite')

function* csvRows(text) {
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) { if (c !== '"') field += c; else if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false }
    else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); yield row; row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); yield row }
}
/** The distinct messages of a dataset checkout: every csv file whose first column is `text`. */
export function readMessages(dataset) {
  const texts = new Set()
  const visit = directory => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) { if (!name.startsWith('.') && name !== 'annotations' && name !== 'tools') visit(path); continue }
      if (!name.endsWith('.csv')) continue
      let header = null
      for (const row of csvRows(readFileSync(path, 'utf8'))) {
        if (!header) { header = row; if (header[0] !== 'text') break; continue }
        if (row[0]?.trim()) texts.add(row[0])
      }
    }
  }
  visit(existsSync(join(dataset, 'semantic')) ? join(dataset, 'semantic') : dataset)
  return [...texts]
}

export function trainWordModel(messages) {
  const counts = new Map()
  const count = (word, key) => { const entry = counts.get(word) ?? counts.set(word, {}).get(word); entry[key] = (entry[key] ?? 0) + 1 }
  for (const text of messages) {
    const words = wordsOf(text)
    // a quotation is somebody else's text: its words are not counted
    const quoted = [...text.matchAll(/"[^"\n]*"|“[^”\n]*”/gu)].map(match => [match.index, match.index + match[0].length])
    const items = words.map((word, index) => {
      const gap = text.slice(index ? words[index - 1].end : 0, word.start)
      return {lower: word.text.toLowerCase(), breaks: !index || /[.,;:!?()—–]/u.test(gap), opens: !index || /[.!?;]/u.test(gap),
        capital: /^\p{Lu}/u.test(word.text), quoted: quoted.some(range => word.start >= range[0] && word.end <= range[1])}
    })
    for (const [index, item] of items.entries()) {
      // a name is written with a capital inside a sentence; it says nothing about the common word
      if (item.quoted || !/^\p{L}+$/u.test(item.lower) || (item.capital && !item.opens) || functionWord(item.lower)) continue
      const prev = item.breaks ? null : items[index - 1].lower
      const after = items[index + 1]
      const next = after && !after.breaks && !after.quoted ? after.lower : null
      const ends = !after || after.breaks
      count(item.lower, 'total')
      if (prev && DETERMINER.has(prev) && (ends || (next && functionWord(next) && !DETERMINER.has(next)))) count(item.lower, 'noun')
      if (prev && DETERMINER.has(prev) && next && !functionWord(next)) count(item.lower, 'before')
      // where a verb can stand, before what can only be its object: an article, a possessive,
      // an object pronoun, or a name written with a capital
      const object = next && (OBJECT_START.has(next) || (after.capital && !functionWord(next) && !item.capital))
      if (object && (item.breaks || BEFORE_VERB.has(prev))) count(item.lower, 'verb')
      if (prev && DEGREE.has(prev)) count(item.lower, 'degree')
      if (next === 'than') count(item.lower, 'than')
      if (prev && (OBJECT.has(prev) || BE.has(prev)) && ends) count(item.lower, 'end')
    }
  }
  const words = {}
  const share = entry => Math.round(100 * (entry.noun ?? 0) / entry.total) / 100
  for (const [word, entry] of counts) {
    if (entry.total < 3) continue
    const learned = {}
    if ((entry.verb ?? 0) >= 5 && entry.verb >= 0.05 * entry.total) learned.v = 1
    // a modifier is a word that stands before nouns ("the red box") and also ends clauses after
    // a pronoun or "be" ("make it red", "move it left"); so is a word after a degree word, and
    // a word in -er before "than". A noun that only stands before other nouns ("bar chart")
    // is no modifier: it never ends a clause that way.
    const before = entry.before ?? 0, ratio = before / (before + (entry.noun ?? 0) || 1)
    const graded = (entry.degree ?? 0) + (word.endsWith('er') ? entry.than ?? 0 : 0)
    const end = entry.end ?? 0
    if ((before >= 3 && ratio >= 0.25 && end >= 3 && end >= 0.002 * entry.total) || (graded >= 2 && !learned.v)) learned.a = 1
    if (learned.v || learned.a) { if (share(entry)) learned.n = share(entry); words[word] = learned }
    else if (/(?:ing|s)$/u.test(word) && share(entry) >= 0.2) words[word] = {n: share(entry)}
  }
  return {version: 1, messages: messages.length, words}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [dataset, output = fileURLToPath(new URL('./model/word-model.json', import.meta.url))] = process.argv.slice(2)
  if (!dataset) throw new Error('Usage: node train-word-model.mjs <dataset checkout> [output file]')
  const model = trainWordModel(readMessages(dataset))
  writeFileSync(output, JSON.stringify(model) + '\n')
  const kinds = Object.values(model.words)
  console.log(`${model.messages} messages; ${kinds.filter(k => k.v).length} verbs, ${kinds.filter(k => k.a).length} modifiers -> ${output}`)
}
