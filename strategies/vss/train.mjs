// Learn a reader model from unannotated messages.
//   node strategies/vss/train.mjs [--dataset ../webmeet-dataset] [--out strategies/vss/model/model.json]
// No annotation is read: only the first column (the text) of the dataset's CSV files.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readLegend, sentencesOf} from './src/legend.mjs'
import {readMessages} from './src/corpus.mjs'
import {observe, isFormShape, shapeIndex} from './src/observe.mjs'
import {buildVocabulary, symbolOf, learnRoutes} from './src/routes.mjs'
import {openModel} from './src/reader.mjs'
import {learnHabits} from './src/habits.mjs'
import {learnMeanings} from './src/meaning.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/u).filter(Boolean).map(pair => pair.split(/\s+/u)))
const dataset = resolve(args.dataset ?? resolve(here, '../../../webmeet-dataset'))
const out = resolve(args.out ?? resolve(here, 'model/model.json'))
const iterations = Number(args.iterations ?? 25), minCount = Number(args['min-count'] ?? 3)
const options = Object.fromEntries(['sharpen', 'warmup', 'kinship', 'formLean'].filter(key => args[key] !== undefined).map(key => [key, Number(args[key])]))

const started = Date.now()
const legendSource = readFileSync(resolve(here, args.legend ?? 'legend.sop'), 'utf8')
const legend = readLegend(legendSource)
const texts = readMessages(dataset)
const messages = texts.map(text => observe(text, legend.compounds))
const symbols = buildVocabulary(messages, minCount)
const index = new Map(symbols.map((symbol, id) => [symbol, id]))
let total = 0
for (const message of messages) total += message.length
// the route model reads one sentence at a time
const starts = []
const corpus = {symbols: new Int32Array(total), shapes: new Int8Array(total)}
let at = 0
for (const message of messages) {
  for (const [from] of sentencesOf(legend, message)) starts.push(at + from)
  for (const token of message) {
    corpus.symbols[at] = symbolOf(index, legend, token)
    corpus.shapes[at] = isFormShape(token.shape) ? -1 : shapeIndex(token.shape)
    at++
  }
}
starts.push(at)
corpus.starts = Int32Array.from(starts)
console.log(`${texts.length} messages, ${starts.length - 1} sentences, ${total} tokens, ${symbols.length} symbols`)

const book = learnRoutes({legend, symbols, corpus, iterations, ...options, log: line => console.log(line)})
const n = legend.stations.length, v = symbols.length
const round = value => Number(value.toPrecision(5))
const model = {
  version: 1, legend: legendSource, symbols,
  transition: Array.from(book.transition, round), start: Array.from(book.start, round), end: Array.from(book.end, round),
  shape: Array.from(book.shape, round),
  emission: symbols.map((_, symbol) => {
    const row = []
    for (let station = 0; station < n; station++) {
      const value = book.emission[station * v + symbol]
      if (value > 0 && book.base[station] === station && book.active[symbol].some(other => book.base[other] === station)) row.push(station, round(value))
    }
    return row
  }),
  trained: {messages: texts.length, tokens: total, iterations, minCount, options}
}
model.habits = learnHabits(openModel(model), texts)
console.log(`habits: ${Object.keys(model.habits.nominal).length} words told apart as thing or quality, ` +
  `${model.habits.takesClause.length} verbs that take a clause (${model.habits.takesClause.join(' ')}), ` +
  `${Object.keys(model.habits.attach.verb).length} verbs and ${Object.keys(model.habits.attach.noun).length} nouns with cue habits`)
// the semantic space holds the words that head entities: the ones the linker compares
const wanted = new Set(Object.keys(model.habits.attach.nounTotal).filter(word => !word.startsWith('~')))
model.meanings = learnMeanings(legend, index, symbols, texts, wanted)
console.log(`meanings: ${model.meanings.words.length} words in ${model.meanings.dimensions} dimensions`)
mkdirSync(dirname(out), {recursive: true})
writeFileSync(out, JSON.stringify(model))
console.log(`wrote ${out} (${(JSON.stringify(model).length / 1e6).toFixed(2)} MB) in ${((Date.now() - started) / 1000).toFixed(1)} s`)
