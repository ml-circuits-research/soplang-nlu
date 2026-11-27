// The vector space of the reader: every symbol has a fixed random identity, drawn from its
// name alone, so a new word needs no table. bind moves a vector to an address, bundle adds
// vectors into one body, and the cosine finds the nearest known thing.
export const DIMENSIONS = 512

function hashOf(name) {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A bipolar identity (+1 / -1) that depends only on the name. */
export function identity(name, dimensions = DIMENSIONS) {
  const vector = new Int8Array(dimensions)
  let state = hashOf(name) || 1
  for (let i = 0; i < dimensions; i += 32) {
    state ^= state << 13; state >>>= 0
    state ^= state >>> 17
    state ^= state << 5; state >>>= 0
    for (let bit = 0; bit < 32 && i + bit < dimensions; bit++) vector[i + bit] = (state >>> bit) & 1 ? 1 : -1
  }
  return vector
}

export function bind(left, right) {
  const out = new Int8Array(left.length)
  for (let i = 0; i < left.length; i++) out[i] = left[i] * right[i]
  return out
}

/** target += weight * vector */
export function bundleInto(target, vector, weight = 1) {
  for (let i = 0; i < target.length; i++) target[i] += weight * vector[i]
}

export function normalise(vector) {
  let sum = 0
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i]
  const scale = sum > 0 ? 1 / Math.sqrt(sum) : 0
  for (let i = 0; i < vector.length; i++) vector[i] *= scale
  return vector
}

export function dot(left, right) {
  let sum = 0
  for (let i = 0; i < left.length; i++) sum += left[i] * right[i]
  return sum
}
