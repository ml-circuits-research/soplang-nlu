// rvss, the HMM half of the kinds: for every word of a message, the posterior over hmm-rules' 25 stations from
// that reader's station HMM (strategies/hmm-rules/model/model.json, trained by Baum–Welch on the raw text; its legend
// names only function words), computed by forward–backward over each sentence with the HMM alone (no bans, no
// prototypes' lift, no verb budget: the plain hidden Markov model).
//
//   node strategies/rvss/data/stations.mjs <out.jsonl> <in.jsonl[.gz]>...
//     every distinct text of the inputs (lines with `text`) -> one line {key: words joined by U+0001, post: per word
//     [[station, p], ...] with p >= 0.01, rounded to 3 decimals}
//   import {stationPosteriors} from './stations.mjs'  -> stationPosteriors(text) = {words, post} (index.mjs)
//
// hmm-rules' tokens and the words of lib/syntax.mjs wordsOf (the units rvss places) can differ; a word takes the mean
// posterior of the tokens that overlap it, and a word no token overlaps gets none (its HMM kind is the empty bundle).
import {createReadStream, createWriteStream, readFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {createGunzip} from 'node:zlib'
import {join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const repo = resolve(fileURLToPath(import.meta.url), '../../../..')
const {openModel} = await import(join(repo, 'strategies/hmm-rules/src/reader.mjs'))
const {observe, isFormShape, shapeIndex, SHAPES} = await import(join(repo, 'strategies/hmm-rules/src/observe.mjs'))
const {symbolOf} = await import(join(repo, 'strategies/hmm-rules/src/routes.mjs'))
const {sentencesOf} = await import(join(repo, 'strategies/hmm-rules/src/legend.mjs'))
const {wordsOf} = await import(join(repo, 'lib/syntax.mjs'))
const {legend, book, index} = openModel(JSON.parse(readFileSync(join(repo, 'strategies/hmm-rules/model/model.json'), 'utf8')))
export const STATIONS = legend.stations.map(station => station.name)
const n = STATIONS.length, v = book.symbols.length, k = SHAPES.length

/** forward–backward over one sentence: per token, the posterior over the stations */
function posterior(tokens) {
  const T = tokens.length
  const sym = tokens.map(token => symbolOf(index, legend, token))
  const form = tokens.map(token => isFormShape(token.shape) ? -1 : shapeIndex(token.shape))
  const emit = (t, s) => book.emission[book.base[s] * v + sym[t]] * (form[t] < 0 ? 1 : book.shape[book.base[s] * k + form[t]])
  const alpha = new Float64Array(T * n), beta = new Float64Array(T * n), scale = new Float64Array(T)
  for (let t = 0; t < T; t++) {
    const states = book.active[sym[t]]; let total = 0
    for (const j of states) {
      let a
      if (t === 0) a = book.start[j] * emit(t, j)
      else { let s = 0; for (const i of book.active[sym[t - 1]]) s += alpha[(t - 1) * n + i] * book.transition[i * n + j]; a = s * emit(t, j) }
      alpha[t * n + j] = a; total += a
    }
    if (!(total > 0)) { total = 1; for (const j of states) alpha[t * n + j] = 1 / states.length } else for (const j of states) alpha[t * n + j] /= total
    scale[t] = total
  }
  for (const i of book.active[sym[T - 1]]) beta[(T - 1) * n + i] = book.end[i] > 0 ? book.end[i] : 1e-12
  for (let t = T - 2; t >= 0; t--) for (const i of book.active[sym[t]]) {
    let s = 0
    for (const j of book.active[sym[t + 1]]) s += book.transition[i * n + j] * emit(t + 1, j) * beta[(t + 1) * n + j]
    beta[t * n + i] = s / scale[t + 1]
  }
  const out = []
  for (let t = 0; t < T; t++) {
    const p = new Float64Array(n); let z = 0
    for (const j of book.active[sym[t]]) { p[j] = alpha[t * n + j] * beta[t * n + j]; z += p[j] }
    if (z > 0) for (let j = 0; j < n; j++) p[j] /= z
    else for (const j of book.active[sym[t]]) p[j] = 1 / book.active[sym[t]].length
    out.push(p)
  }
  return out
}

export function stationPosteriors(text) {
  const words = wordsOf(text)
  const tokens = observe(text, legend.compounds, legend.variants)
  const per = new Array(tokens.length)
  for (const [from, to] of sentencesOf(legend, tokens)) posterior(tokens.slice(from, to)).forEach((p, t) => { per[from + t] = p })
  const post = words.map(w => {
    const over = tokens.map((token, t) => token.start < w.end && token.end > w.start ? per[t] : null).filter(Boolean)
    if (!over.length) return []
    const m = new Float64Array(n)
    for (const p of over) for (let j = 0; j < n; j++) m[j] += p[j] / over.length
    const list = []
    for (let j = 0; j < n; j++) if (m[j] >= 0.01) list.push([j, Math.round(m[j] * 1000) / 1000])
    return list
  })
  return {words: words.map(w => w.text), post}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [outFile, ...inputs] = process.argv.slice(2)
  const out = createWriteStream(resolve(outFile)); const seen = new Set(); let lines = 0, empty = 0, words = 0
  for (const file of inputs) {
    const s = createReadStream(resolve(file))
    for await (const line of createInterface({input: file.endsWith('.gz') ? s.pipe(createGunzip()) : s, crlfDelay: Infinity})) {
      if (!line) continue
      const {text} = JSON.parse(line)
      if (seen.has(text)) continue
      seen.add(text)
      const r = stationPosteriors(text)
      lines++; words += r.words.length; empty += r.post.filter(p => !p.length).length
      if (!out.write(JSON.stringify({key: r.words.join('\u0001'), post: r.post}) + '\n')) await new Promise(ok => out.once('drain', ok))
    }
  }
  out.end()
  console.log(JSON.stringify({stations: STATIONS, texts: lines, words, wordsWithoutStation: empty}))
}
