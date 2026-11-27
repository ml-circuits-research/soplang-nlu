// The semantic space. A word's vector is the bundle of the words found around it, each one
// bound to the side it was found on: words used alike end up near each other. Nothing is
// labelled: the vectors come from the same unannotated text as the routes.
import {identity, bind, dot, DIMENSIONS} from './space.mjs'
import {observe} from './observe.mjs'

const SIDES = [-2, -1, 1, 2]

export function learnMeanings(legend, index, symbols, texts, wanted, {dimensions = 128, minCount = 5} = {}) {
  const v = symbols.length
  const counts = new Map(), totals = new Float64Array(v), contextTotals = new Float64Array(SIDES.length * v)
  let all = 0
  for (const text of texts) {
    const ids = observe(text, legend.compounds).map(token => index.get(token.word) ?? -1)
    ids.forEach((id, i) => {
      if (id < 0) return
      totals[id]++
      SIDES.forEach((side, s) => {
        const other = ids[i + side]
        if (other === undefined || other < 0) return
        const key = s * v + other
        contextTotals[key]++
        all++
        if (!wanted.has(symbols[id])) return
        const row = counts.get(id) ?? counts.set(id, new Map()).get(id)
        row.set(key, (row.get(key) ?? 0) + 1)
      })
    })
  }
  const roles = SIDES.map(side => identity('side:' + side, dimensions))
  const cache = new Map()
  const address = key => {
    if (!cache.has(key)) cache.set(key, bind(roles[Math.floor(key / v)], identity('word:' + symbols[key % v], dimensions)))
    return cache.get(key)
  }
  const words = [], rows = []
  for (const [id, row] of counts) {
    if (totals[id] < minCount) continue
    let own = 0
    for (const count of row.values()) own += count
    const vector = new Float32Array(dimensions)
    for (const [key, count] of row) {
      // how much more often than chance the word stands next to this one
      const weight = Math.log(count * all / (own * contextTotals[key]))
      if (weight <= 0) continue
      const where = address(key)
      for (let d = 0; d < dimensions; d++) vector[d] += weight * where[d]
    }
    let top = 0
    for (let d = 0; d < dimensions; d++) top = Math.max(top, Math.abs(vector[d]))
    if (!top) continue
    words.push(symbols[id])
    rows.push(Int8Array.from(vector, value => Math.round(127 * value / top)))
  }
  const bytes = new Uint8Array(words.length * dimensions)
  rows.forEach((row, k) => bytes.set(new Uint8Array(row.buffer), k * dimensions))
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return {dimensions, words, vectors: btoa(binary)}
}

/** similarity(a, b) in [-1, 1], or 0 when either word has no vector. */
export function openMeanings(stored) {
  if (!stored) return {similarity: () => 0, has: () => false, nearest: () => []}
  const {dimensions, words} = stored
  const binary = atob(stored.vectors)
  const bytes = new Int8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) << 24 >> 24
  const at = new Map(words.map((word, k) => [word, k]))
  const row = k => bytes.subarray(k * dimensions, (k + 1) * dimensions)
  const norms = Float64Array.from(words, (_, k) => Math.sqrt(dot(row(k), row(k))) || 1)
  const similarity = (a, b) => {
    const i = at.get(a), j = at.get(b)
    if (i === undefined || j === undefined) return 0
    return i === j ? 1 : dot(row(i), row(j)) / (norms[i] * norms[j])
  }
  const nearest = (word, count = 8) => words.filter(other => other !== word).map(other => [other, similarity(word, other)])
    .sort((a, b) => b[1] - a[1]).slice(0, count)
  return {similarity, has: word => at.has(word), nearest}
}

void DIMENSIONS
