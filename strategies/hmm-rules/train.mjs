// Learn a reader model from unannotated messages.
//   node strategies/hmm-rules/train.mjs [--dataset ../webmeet-dataset] [--out strategies/hmm-rules/model/model.json]
// No annotation is read: only the first column (the text) of the dataset's CSV files.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readLegend, sentencesOf} from './src/legend.mjs'
import {readMessages} from './src/corpus.mjs'
import {observe, isFormShape, shapeIndex} from './src/observe.mjs'
import {buildVocabulary, symbolOf, learnRoutes} from './src/routes.mjs'
import {openModel} from './src/reader.mjs'
import {learnHabits, learnNumber, learnIng} from './src/habits.mjs'
import {learnMeanings, openMeanings} from './src/meaning.mjs'
import {findVariants} from './src/variants.mjs'
import {createOccurrences, learnPrototypes} from './src/occurrence.mjs'
import {anchoredFrames} from './src/anchors.mjs'
import {readRoutes} from './src/routes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/u).filter(Boolean).map(pair => pair.split(/\s+/u)))
const dataset = resolve(args.dataset ?? resolve(here, '../../../webmeet-dataset'))
const out = resolve(args.out ?? resolve(here, 'model/model.json'))
const iterations = Number(args.iterations ?? 25), minCount = Number(args['min-count'] ?? 3)
const options = Object.fromEntries(['sharpen', 'warmup', 'kinship', 'formLean', 'anchoring'].filter(key => args[key] !== undefined).map(key => [key, Number(args[key])]))

const started = Date.now()
const legendSource = readFileSync(resolve(here, args.legend ?? 'legend.sop'), 'utf8')
const legend = readLegend(legendSource)
const texts = readMessages(dataset)
let messages = texts.map(text => observe(text, legend.compounds))
// Spelling variants first: a vector for every word from its neighbours, then every rare word
// that is one edit from a common word and used like it is read as that word from here on.
const wordCounts = new Map()
for (const message of messages) for (const token of message) wordCounts.set(token.word, (wordCounts.get(token.word) ?? 0) + 1)
const rough = [...wordCounts].filter(([word, count]) => count >= 3 && /^\p{L}/u.test(word)).map(([word]) => word)
const roughIndex = new Map(rough.map((word, id) => [word, id]))
const roughSpace = openMeanings(learnMeanings(legend, roughIndex, rough, texts, new Set(rough), {dimensions: 128, minCount: 5}))
const variants = findVariants(wordCounts, roughSpace.similarity, roughSpace.has, word => legend.places.has(word))
legend.variants = variants
console.log(`${variants.size} spelling variants, such as ${[...variants].slice(0, 12).map(([from, to]) => from + '→' + to).join(' ')}`)
messages = texts.map(text => observe(text, legend.compounds, variants))
// Openers: a few words before a break that recur in front of many different continuations
// stand on their own ("quick one: …", "one more thing — …"). Counted on the text alone.
const breaks = token => token.shape === 'mark' && /^[,:;!—–-]$/u.test(token.text)
const structural = new Set(['auxiliary', 'marker', 'infinitive', 'relative', 'negation', 'cue', 'conjunction'].map(name => legend.stations.find(station => station.name === name)?.index))
const grammatical = token => token.shape === 'mark' || [...legend.places.get(token.word)?.stations ?? []].some(station => structural.has(station))
const openings = new Map()
for (const message of messages) {
  const cut = message.findIndex(breaks)
  if (cut < 1 || cut > 3 || cut + 2 >= message.length || message.slice(0, cut).some(grammatical)) continue
  const key = message.slice(0, cut).map(token => token.word).join(' ')
  const entry = openings.get(key) ?? openings.set(key, {count: 0, next: new Set()}).get(key)
  entry.count++
  entry.next.add(message[cut + 1].word + ' ' + message[cut + 2].word)
}
const openers = [...openings].filter(([, entry]) => entry.count >= 5 && entry.next.size >= 4).map(([key]) => key)
console.log(`${openers.length} openers, such as ${openers.slice(0, 14).join(' | ')}`)
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

// Anchored frames measured worse than the plain model (see docs/strategies/hmm-rules.md); they are
// counted and used only when --anchoring <strength> is given.
const frames = anchoredFrames(legend, messages, index)
const anchors = args.anchoring === undefined ? null : frames
const book = learnRoutes({legend, symbols, corpus, iterations, anchors, ...options, log: line => console.log(line)})
const n = legend.stations.length, v = symbols.length
const round = value => Number(value.toPrecision(5))
const model = {
  version: 1, legend: legendSource, symbols, variants: Object.fromEntries(variants), openers,
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
// what the outside of an occurrence says about its station: prototypes from the confident readings
{
  const opened = openModel(model)
  const occurrences = createOccurrences(legend)
  const learned = learnPrototypes(legend, occurrences, function* () {
    for (const tokens of messages) if (tokens.length) yield {tokens, ...readRoutes(opened.book, legend, opened.index, tokens)}
  })
  const bytes = new Uint8Array(new Float32Array([...learned.centre, ...learned.prototypes.flatMap(prototype => [...prototype])]).buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  model.occurrence = {dimensions: occurrences.dimensions, vectors: btoa(binary)}
  console.log(`occurrence prototypes from ${learned.counts.reduce((a, b) => a + b, 0)} confident occurrences`)
}
// the semantic space first: a vector for every word seen often enough, from its neighbours
const seen = new Float64Array(symbols.length)
for (const symbol of corpus.symbols) seen[symbol]++
const wanted = new Set(symbols.filter((symbol, id) => seen[id] >= 10 && /^\p{L}/u.test(symbol) && !legend.places.get(symbol)?.confined))
model.meanings = learnMeanings(legend, index, symbols, texts, wanted, {dimensions: Number(args.dimensions ?? 128), minCount: 10})
console.log(`meanings: ${model.meanings.words.length} words in ${model.meanings.dimensions} dimensions`)
// then the habits of words and what fills which role, read off the text the routes now explain
const habits = learnHabits(openModel(model), texts)
model.memory = habits.memory
delete habits.memory
model.habits = habits
// what kind of word each one is where the legend's words fix the frame: [verb, thing, quality]
model.habits.kinds = Object.fromEntries(symbols.map((symbol, id) => [symbol, [frames[id * 3], frames[id * 3 + 1], frames[id * 3 + 2]].map(count => Math.round(count))]).filter(([, counts]) => counts[0] + counts[1] + counts[2] >= 3))
// grammatical number, counted on the raw text: which words name one thing or several, and which words in -s are verbs
Object.assign(model.habits, learnNumber(legend, messages, model.habits.kinds, model.habits.nominal))
// the verbs that take an -ing form of another verb ("keep moving it"), counted on the raw text
Object.assign(model.habits, learnIng(legend, messages, model.habits.kinds))
console.log(`habits: ${Object.keys(model.habits.nominal).length} words told apart as thing or quality, ` +
  `${Object.keys(model.habits.attach.verb).length} verbs and ${Object.keys(model.habits.attach.noun).length} nouns with cue habits; ` +
  `memory of ${model.memory?.keys.length ?? 0} governing words`)
mkdirSync(dirname(out), {recursive: true})
writeFileSync(out, JSON.stringify(model))
console.log(`wrote ${out} (${(JSON.stringify(model).length / 1e6).toFixed(2)} MB) in ${((Date.now() - started) / 1000).toFixed(1)} s`)
