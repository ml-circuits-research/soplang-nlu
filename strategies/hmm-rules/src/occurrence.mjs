// The role of a word in one occurrence. Each occurrence is seen from outside: the words
// around it, each bound to its side, with the word itself hidden. Occurrences that the route
// model reads with confidence build one prototype per station; a doubtful occurrence is then
// compared with the prototypes. Nothing is labelled by hand: the confident readings teach.
import {identity, bind, dot} from './space.mjs'
import {classOf} from './observe.mjs'

const SIDES = [-2, -1, 1, 2]
const D = 512

export function createOccurrences(legend) {
  const roles = SIDES.map(side => identity('occurrence:' + side, D))
  const own = identity('occurrence:own', D)
  const cache = new Map()
  // a neighbour counts as itself when the legend lists it, otherwise as the class of its form
  const seenAs = token => !token ? '~edge' : legend.places.has(token.word) ? token.word : classOf(token.word, token.shape)
  const address = (side, name) => {
    const key = side + '\0' + name
    if (!cache.has(key)) cache.set(key, bind(side < SIDES.length ? roles[side] : own, identity('seen:' + name, D)))
    return cache.get(key)
  }
  /** The outside of the occurrence at position t, as one vector. */
  function outside(tokens, t) {
    const sum = new Float32Array(D)
    SIDES.forEach((side, s) => {
      const where = address(s, seenAs(tokens[t + side]))
      for (let d = 0; d < D; d++) sum[d] += where[d]
    })
    // the form of the word (its ending, its capital), not the word
    const form = address(SIDES.length, classOf(tokens[t].word, tokens[t].shape))
    for (let d = 0; d < D; d++) sum[d] += form[d]
    return sum
  }
  return {outside, dimensions: D}
}

/** prototypes: one Float32Array per station, centred on what all occurrences share. */
export function learnPrototypes(legend, occurrences, readings, {sure = 0.97} = {}) {
  const n = legend.stations.length
  const sums = Array.from({length: n}, () => new Float64Array(D)), counts = new Float64Array(n)
  const all = new Float64Array(D)
  let total = 0
  for (const {tokens, stations, confidence} of readings()) {
    for (let t = 0; t < tokens.length; t++) {
      if (confidence[t] < sure) continue
      const vector = occurrences.outside(tokens, t)
      const sum = sums[stations[t]]
      for (let d = 0; d < D; d++) { sum[d] += vector[d]; all[d] += vector[d] }
      counts[stations[t]]++
      total++
    }
  }
  const prototypes = sums.map((sum, station) => {
    const out = new Float32Array(D)
    if (!counts[station]) return out
    let norm = 0
    for (let d = 0; d < D; d++) { out[d] = sum[d] / counts[station] - all[d] / total; norm += out[d] * out[d] }
    norm = Math.sqrt(norm) || 1
    for (let d = 0; d < D; d++) out[d] /= norm
    return out
  })
  const centre = Float32Array.from(all, value => value / total)
  return {prototypes, centre, counts: Array.from(counts)}
}

/** How well the outside of an occurrence matches each station's prototype (a cosine per station). */
export function matchPrototypes(model, vector) {
  const centred = new Float32Array(D)
  let norm = 0
  for (let d = 0; d < D; d++) { centred[d] = vector[d] - model.centre[d]; norm += centred[d] * centred[d] }
  norm = Math.sqrt(norm) || 1
  return model.prototypes.map(prototype => dot(prototype, centred) / norm)
}
