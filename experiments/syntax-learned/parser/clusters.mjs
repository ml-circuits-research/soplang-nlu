// Word clusters from VSS's meaning vectors (learned from unannotated text): k-means with cosine,
// at two granularities, as cluster features are used in parsers (Koo, Carreras and Collins 2008).
//   node clusters.mjs  -> clusters.json {word: [c64, c256]}
import {readFileSync, writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const model = JSON.parse(readFileSync(root + 'strategies/hmm-rules/model/model.json', 'utf8'))
const {dimensions: D, words} = model.meanings
const binary = atob(model.meanings.vectors)
const X = words.map((_, k) => { const v = new Float32Array(D); let norm = 0
  for (let d = 0; d < D; d++) { v[d] = binary.charCodeAt(k * D + d) << 24 >> 24; norm += v[d] * v[d] }
  norm = Math.sqrt(norm) || 1; for (let d = 0; d < D; d++) v[d] /= norm; return v })
let seed = 7
const rng = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296 }
function kmeans(K, iterations = 25) {
  const centres = Array.from({length: K}, () => Float32Array.from(X[Math.floor(rng() * X.length)]))
  const assign = new Int32Array(X.length)
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < X.length; i++) {
      let best = 0, bestDot = -Infinity
      for (let c = 0; c < K; c++) { let s = 0; const cc = centres[c], x = X[i]; for (let d = 0; d < D; d++) s += cc[d] * x[d]; if (s > bestDot) { bestDot = s; best = c } }
      assign[i] = best
    }
    const sums = Array.from({length: K}, () => new Float32Array(D)), counts = new Int32Array(K)
    for (let i = 0; i < X.length; i++) { counts[assign[i]]++; const s = sums[assign[i]]; for (let d = 0; d < D; d++) s[d] += X[i][d] }
    for (let c = 0; c < K; c++) {
      if (!counts[c]) { centres[c] = Float32Array.from(X[Math.floor(rng() * X.length)]); continue }
      let norm = 0; for (let d = 0; d < D; d++) norm += sums[c][d] ** 2; norm = Math.sqrt(norm) || 1
      for (let d = 0; d < D; d++) centres[c][d] = sums[c][d] / norm
    }
  }
  return assign
}
const a64 = kmeans(64), a256 = kmeans(256)
const out = {}
words.forEach((word, k) => { out[word] = [a64[k], a256[k]] })
writeFileSync('clusters.json', JSON.stringify(out))
// show a few clusters
const byCluster = {}
words.forEach((word, k) => (byCluster[a64[k]] ??= []).push(word))
for (const c of Object.keys(byCluster).slice(0, 12)) console.log(c, byCluster[c].slice(0, 14).join(' '))
console.log('words', words.length)
