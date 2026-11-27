// The route book: which station a word stands at, given the stations around it. It is learned
// from unannotated text by expectation maximisation. The legend supplies the stations, the
// words whose place the language fixes and a prior on what follows what; the text supplies
// everything else. A word's identity never enters the route book beyond its own row, and a
// word outside the vocabulary is read through its class.
import {admitted, sentencesOf} from './legend.mjs'
import {CLASSES, classOf, shapeIndex, isFormShape, SHAPES} from './observe.mjs'
import {stemLinks, stemsOf} from './forms.mjs'

const FOLLOW = 4, LEAVE = 1, BREAK = 0.05

/** Symbols of the route model: frequent words, then the classes for everything else. */
export function buildVocabulary(messages, minCount) {
  const counts = new Map()
  for (const tokens of messages) for (const {word, shape} of tokens) {
    if (!isFormShape(shape) || shape === 'mark') counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const symbols = [...CLASSES]
  for (const [word, count] of counts) if (count >= minCount && !word.startsWith('~')) symbols.push(word)
  return symbols
}

export function symbolOf(index, legend, {word, shape}) {
  if (shape === 'mark') return index.get(word) ?? index.get('~mark')
  if (isFormShape(shape) && !legend.places.has(word)) return index.get('~' + shape)
  const known = index.get(word)
  if (known !== undefined) return known
  // an unseen form of a known word is read as that word
  if (shape === 'lower' || shape === 'initial') {
    for (const stem of stemsOf(word, legend.endings)) {
      const other = index.get(stem)
      if (other !== undefined && !legend.places.get(stem)?.confined) return other
    }
  }
  return index.get(classOf(word, shape))
}

function admission(legend, symbols) {
  const classShape = {'~number': 'number', '~date': 'date', '~clock': 'clock', '~code': 'code', '~mark': 'mark', '~quote': 'quote'}
  return symbols.map(symbol => {
    // a suffix class is admitted where a word with that ending would be
    const word = symbol.startsWith('~') && !classShape[symbol] ? 'xxxx' + symbol.slice(1) : symbol
    const written = symbol === '~capital' || symbol === '~initial' ? 'capital' : symbol === '~upper' ? 'upper'
      : symbol.startsWith('~') ? 'lower' : symbol !== symbol.toLowerCase() ? (symbol === symbol.toUpperCase() && symbol.length > 1 ? 'upper' : 'capital') : 'lower'
    const mask = admitted(legend, word, classShape[symbol] ?? (/^[\p{L}\p{N}~']/u.test(symbol) ? written : 'mark'))
    for (const station of legend.stations) if (station.like !== null) mask[station.index] = mask[station.like]
    const active = []
    mask.forEach((on, station) => { if (on) active.push(station) })
    return Int32Array.from(active)
  })
}

function prior(legend) {
  const n = legend.stations.length
  const transition = new Float64Array(n * n)
  const end = new Float64Array(n)
  for (const from of legend.stations) {
    for (const to of legend.stations) {
      // a station that names what it may come after is against the grain anywhere else
      const barred = to.after && !to.after.includes(from.index) && !(to.like !== null && false)
      transition[from.index * n + to.index] = barred ? BREAK : from.follows.includes(to.index) ? FOLLOW : from.core ? LEAVE : BREAK
    }
    end[from.index] = from.core ? LEAVE : BREAK
  }
  return {transition, end}
}

/**
 * @param corpus {symbols: Int32Array, shapes: Int8Array, starts: Int32Array} flattened messages
 * @returns the route book {symbols, transition, start, end, emission, shape, base, active}
 */
export function learnRoutes({legend, symbols, corpus, iterations = 30, sharpen = 1.5, warmup = 6, kinship = 0.5, formLean = 8, log = () => {}}) {
  const n = legend.stations.length, v = symbols.length, k = SHAPES.length
  const base = Int32Array.from(legend.stations, station => station.like ?? station.index)
  const active = admission(legend, symbols)
  // a word the legend does not confine tends to keep one place: its counts are sharpened
  const free = symbols.map(symbol => !symbol.startsWith('~') && !legend.places.get(symbol)?.confined && /^\p{L}/u.test(symbol))
  // a form of a word inherits a part of what is learned about the word it is built from
  const stem = stemLinks(symbols, legend.endings, (symbol, id) => free[id])
  const index = new Map(symbols.map((symbol, id) => [symbol, id]))
  const builtWith = (symbol, endings) => free[symbol] && stemsOf(symbols[symbol], endings).some(other => index.has(other) && free[index.get(other)])
  for (let symbol = 0; symbol < v; symbol++) {
    for (const form of legend.forms) {
      if (!form.confine || !builtWith(symbol, form.endings)) continue
      const allowed = new Set([form.station, ...form.also].map(station => base[station]))
      active[symbol] = active[symbol].filter(station => allowed.has(base[station]))
    }
  }
  const before = prior(legend)

  // Start: each symbol's mass is shared equally by the stations that admit it.
  const counts = new Float64Array(v)
  for (const symbol of corpus.symbols) counts[symbol]++
  const emission0 = new Float64Array(n * v)
  for (let symbol = 0; symbol < v; symbol++) {
    // a form built from another word of the text starts out where the legend says such forms stand
    const lean = new Float64Array(n).fill(1)
    // a word that its ending admits at a closed station leans to that station
    for (const station of legend.stations) {
      if (free[symbol] && station.closed && station.suffixes.some(suffix => symbols[symbol].length > suffix.length + 2 && symbols[symbol].endsWith(suffix))) lean[station.index] = formLean
    }
    for (const {station, endings, name} of legend.forms) {
      if (name !== 'plural' && builtWith(symbol, endings)) for (const other of active[symbol]) if (base[other] === base[station]) lean[other] = formLean
    }
    let share = 0
    for (const station of active[symbol]) share += lean[station]
    for (const station of active[symbol]) emission0[base[station] * v + symbol] += (counts[symbol] + 1) * lean[station] / share
  }
  const shape0 = new Float64Array(n * k)
  for (const station of legend.stations) {
    const named = station.shapes.includes('capital')
    shape0.set(named ? [0.15, 0.65, 0.2] : [0.94, 0.05, 0.01], station.index * k)
  }
  const rows = (table, width) => {
    for (let row = 0; row < n; row++) {
      let sum = 0
      for (let i = 0; i < width; i++) sum += table[row * width + i]
      if (sum > 0) for (let i = 0; i < width; i++) table[row * width + i] /= sum
    }
    return table
  }
  let emission = rows(Float64Array.from(emission0), v)
  let shape = rows(Float64Array.from(shape0), k)
  let transition = Float64Array.from(before.transition), end = Float64Array.from(before.end)
  for (let row = 0; row < n; row++) {
    let sum = end[row]
    for (let j = 0; j < n; j++) sum += transition[row * n + j]
    end[row] /= sum
    for (let j = 0; j < n; j++) transition[row * n + j] /= sum
  }
  const start0 = Float64Array.from(legend.stations, station => station.opens ? 1 : 0)
  let start = Float64Array.from(start0, value => value / start0.reduce((a, b) => a + b, 0))

  let longest = 1
  for (let m = 0; m + 1 < corpus.starts.length; m++) longest = Math.max(longest, corpus.starts[m + 1] - corpus.starts[m])
  const alpha = new Float64Array(longest * n), beta = new Float64Array(longest * n), scale = new Float64Array(longest)
  const emit = new Float64Array(longest * n)

  for (let round = 0; round < iterations; round++) {
    const cTransition = new Float64Array(n * n), cStart = new Float64Array(n), cEnd = new Float64Array(n)
    const cEmission = new Float64Array(n * v), cShape = new Float64Array(n * k)
    let logLikelihood = 0
    for (let m = 0; m + 1 < corpus.starts.length; m++) {
      const offset = corpus.starts[m], length = corpus.starts[m + 1] - offset
      if (!length) continue
      for (let t = 0; t < length; t++) {
        const symbol = corpus.symbols[offset + t], form = corpus.shapes[offset + t]
        for (const s of active[symbol]) {
          emit[t * n + s] = emission[base[s] * v + symbol] * (form < 0 ? 1 : shape[base[s] * k + form])
        }
      }
      // forward
      let previous = null
      for (let t = 0; t < length; t++) {
        const states = active[corpus.symbols[offset + t]]
        let total = 0
        for (const j of states) {
          let sum = 0
          if (t === 0) sum = start[j]
          else for (const i of previous) sum += alpha[(t - 1) * n + i] * transition[i * n + j]
          const value = sum * emit[t * n + j]
          alpha[t * n + j] = value
          total += value
        }
        if (!(total > 0)) { total = 1e-300; for (const j of states) alpha[t * n + j] = 1 / states.length }
        else for (const j of states) alpha[t * n + j] /= total
        scale[t] = total
        logLikelihood += Math.log(total)
        previous = states
      }
      // backward
      const last = active[corpus.symbols[offset + length - 1]]
      let final = 0
      for (const i of last) { beta[(length - 1) * n + i] = end[i]; final += alpha[(length - 1) * n + i] * end[i] }
      if (!(final > 0)) { final = 1e-300; for (const i of last) beta[(length - 1) * n + i] = 1 }
      logLikelihood += Math.log(final)
      for (let t = length - 2; t >= 0; t--) {
        const states = active[corpus.symbols[offset + t]], next = active[corpus.symbols[offset + t + 1]]
        for (const i of states) {
          let sum = 0
          for (const j of next) sum += transition[i * n + j] * emit[(t + 1) * n + j] * beta[(t + 1) * n + j]
          beta[t * n + i] = sum / scale[t + 1]
        }
      }
      // expected counts
      for (let t = 0; t < length; t++) {
        const symbol = corpus.symbols[offset + t], form = corpus.shapes[offset + t]
        const states = active[symbol]
        let norm = 0
        for (const i of states) norm += alpha[t * n + i] * beta[t * n + i]
        if (!(norm > 0)) continue
        for (const i of states) {
          const gamma = alpha[t * n + i] * beta[t * n + i] / norm
          cEmission[base[i] * v + symbol] += gamma
          if (form >= 0) cShape[base[i] * k + form] += gamma
          if (t === 0) cStart[i] += gamma
          if (t === length - 1) cEnd[i] += gamma
        }
        if (t + 1 < length) {
          const next = active[corpus.symbols[offset + t + 1]]
          for (const i of states) {
            const left = alpha[t * n + i] / (norm * scale[t + 1])
            if (!left) continue
            for (const j of next) {
              cTransition[i * n + j] += left * transition[i * n + j] * emit[(t + 1) * n + j] * beta[(t + 1) * n + j]
            }
          }
        }
      }
    }
    // maximisation, with the legend's prior kept as a small pseudo-count
    // What the legend says cannot follow stays unlikely however often the text seems to show it.
    const weight = 20
    for (let row = 0; row < n; row++) {
      const allow = j => before.transition[row * n + j] === BREAK ? BREAK : 1
      const closes = before.end[row] === BREAK ? BREAK : 1
      let sum = cEnd[row] * closes + weight * before.end[row]
      for (let j = 0; j < n; j++) sum += cTransition[row * n + j] * allow(j) + weight * before.transition[row * n + j]
      end[row] = (cEnd[row] * closes + weight * before.end[row]) / sum
      for (let j = 0; j < n; j++) transition[row * n + j] = (cTransition[row * n + j] * allow(j) + weight * before.transition[row * n + j]) / sum
    }
    let startSum = 0
    for (let j = 0; j < n; j++) startSum += cStart[j] + start0[j]
    for (let j = 0; j < n; j++) start[j] = (cStart[j] + start0[j]) / startSum
    if (kinship > 0) {
      const inherited = new Float64Array(n * v)
      for (let symbol = 0; symbol < v; symbol++) {
        const from = stem[symbol]
        if (from < 0) continue
        let own = 0, theirs = 0
        for (const station of active[symbol]) theirs += cEmission[base[station] * v + from]
        for (let row = 0; row < n; row++) own += cEmission[row * v + symbol]
        if (!(theirs > 0)) continue
        const rowsSeen = new Set()
        for (const station of active[symbol]) {
          const row = base[station]
          if (rowsSeen.has(row)) continue
          rowsSeen.add(row)
          inherited[row * v + symbol] = kinship * own * cEmission[row * v + from] / theirs
        }
      }
      for (let symbol = 0; symbol < v; symbol++) {
        if (stem[symbol] < 0) continue
        let any = 0
        for (let row = 0; row < n; row++) any += inherited[row * v + symbol]
        if (!(any > 0)) continue
        for (let row = 0; row < n; row++) cEmission[row * v + symbol] = (1 - kinship) * cEmission[row * v + symbol] + inherited[row * v + symbol]
      }
    }
    if (round >= warmup && sharpen !== 1) {
      for (let symbol = 0; symbol < v; symbol++) {
        if (!free[symbol]) continue
        let sum = 0, sharp = 0
        for (let row = 0; row < n; row++) { const c = cEmission[row * v + symbol]; sum += c; sharp += c ** sharpen }
        if (!(sharp > 0)) continue
        for (let row = 0; row < n; row++) cEmission[row * v + symbol] = cEmission[row * v + symbol] ** sharpen * sum / sharp
      }
    }
    for (let i = 0; i < n * v; i++) cEmission[i] += 1e-3 * emission0[i]
    emission = rows(cEmission, v)
    for (let i = 0; i < n * k; i++) cShape[i] += shape0[i]
    shape = rows(cShape, k)
    log(`round ${round + 1}: log likelihood per token ${(logLikelihood / corpus.symbols.length).toFixed(4)}`)
  }
  return {symbols, transition, start, end, emission, shape, base, active, stem}
}

/**
 * The best station sequence of one message and, per token, the posterior of the chosen
 * station (its margin of confidence).
 */
export function readRoutes(book, legend, index, tokens, banned = new Map()) {
  const stations = [], confidence = []
  for (const [from, to] of sentencesOf(legend, tokens)) {
    const bans = new Map([...banned].filter(([position]) => position >= from && position < to).map(([position, set]) => [position - from, set]))
    const part = readSentence(book, legend, index, tokens.slice(from, to), bans)
    stations.push(...part.stations)
    confidence.push(...part.confidence)
  }
  return {stations, confidence}
}

function readSentence(book, legend, index, tokens, bans) {
  const n = legend.stations.length, v = book.symbols.length, k = SHAPES.length
  const length = tokens.length
  if (!length) return {stations: [], confidence: []}
  const symbols = tokens.map(token => symbolOf(index, legend, token))
  const forms = tokens.map(token => isFormShape(token.shape) ? -1 : shapeIndex(token.shape))
  const emit = (t, s) => bans.get(t)?.has(s) ? 0 : book.emission[book.base[s] * v + symbols[t]] * (forms[t] < 0 ? 1 : book.shape[book.base[s] * k + forms[t]])
  const score = new Float64Array(length * n).fill(-Infinity), back = new Int32Array(length * n)
  const alpha = new Float64Array(length * n), beta = new Float64Array(length * n), scale = new Float64Array(length)
  for (let t = 0; t < length; t++) {
    const states = book.active[symbols[t]]
    let total = 0
    for (const j of states) {
      const e = emit(t, j)
      if (t === 0) {
        score[j] = Math.log(book.start[j] * e + 1e-300)
        alpha[j] = book.start[j] * e
      } else {
        let best = -Infinity, arg = -1, sum = 0
        for (const i of book.active[symbols[t - 1]]) {
          const candidate = score[(t - 1) * n + i] + Math.log(book.transition[i * n + j] + 1e-300)
          if (candidate > best) { best = candidate; arg = i }
          sum += alpha[(t - 1) * n + i] * book.transition[i * n + j]
        }
        score[t * n + j] = best + Math.log(e + 1e-300)
        back[t * n + j] = arg
        alpha[t * n + j] = sum * e
      }
      total += alpha[t * n + j]
    }
    if (!(total > 0)) { total = 1; for (const j of states) alpha[t * n + j] = 1 / states.length }
    else for (const j of states) alpha[t * n + j] /= total
    scale[t] = total
  }
  for (const i of book.active[symbols[length - 1]]) beta[(length - 1) * n + i] = book.end[i]
  for (let t = length - 2; t >= 0; t--) {
    for (const i of book.active[symbols[t]]) {
      let sum = 0
      for (const j of book.active[symbols[t + 1]]) sum += book.transition[i * n + j] * emit(t + 1, j) * beta[(t + 1) * n + j]
      beta[t * n + i] = sum / scale[t + 1]
    }
  }
  let best = -Infinity, state = -1
  for (const i of book.active[symbols[length - 1]]) {
    const candidate = score[(length - 1) * n + i] + Math.log(book.end[i] + 1e-300)
    if (candidate > best) { best = candidate; state = i }
  }
  const stations = new Array(length), confidence = new Array(length)
  for (let t = length - 1; t >= 0; t--) {
    stations[t] = state
    let norm = 0
    for (const i of book.active[symbols[t]]) norm += alpha[t * n + i] * beta[t * n + i]
    confidence[t] = norm > 0 ? alpha[t * n + state] * beta[t * n + state] / norm : 0
    state = back[t * n + state]
  }
  return {stations, confidence}
}
