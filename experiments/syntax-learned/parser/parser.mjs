// A transition-based dependency parser with an averaged perceptron, in plain JavaScript with no
// dependencies (Nivre's arc-eager system with the root at the end of the buffer, Ballesteros and
// Nivre 2013; the feature set after Zhang and Nivre 2011; the dynamic oracle of Goldberg and Nivre
// 2012; the averaged perceptron of Collins 2002, as in Honnibal's "parsing English in 500 lines").

// ---- hashing: atoms and features as numbers
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) } return h >>> 0 }
function mix(h, x) { h = Math.imul(h ^ x, 0x5bd1e995); return (h ^ (h >>> 15)) >>> 0 }
function key(t, a, b = 0, c = 0, d = 0) {
  let h1 = mix(mix(mix(mix(mix(0x9747b28c, t), a), b), c), d)
  let h2 = mix(mix(mix(mix(mix(0x1b873593, d), c), b), a), t)
  return h1 + (h2 & 0x1fffff) * 4294967296
}
const FIELDS = ['w', 'sfx', 'shape', 'st', 'kd', 'pp', 'pn', 'first', 'hb1', 'hb2', 'lk', 'c64', 'c256', 'pr', 'pv']
const NONE = fnv('<none>'), ROOTA = fnv('<root>')

export class Parser {
  constructor(labels, options = {}) {
    this.options = options                                // extra: VSS habits and clusters as features
    this.labels = labels                                  // label strings
    this.L = labels.length
    this.C = 2 + 2 * this.L                               // SH, RE, LA(l)..., RA(l)...
    this.rootLabel = labels.map(l => l.startsWith('root:'))
    this.weights = new Map()                              // feature -> Float32Array(2C): weights, then averaging sums
    this.c = 1
  }
  // ---- observations of one message: atom hashes per word, the root at index n
  atomsOf(sentence) {
    const n = sentence.atoms.length
    const A = []
    for (let k = 0; k < n; k++) { const a = sentence.atoms[k]; A.push(FIELDS.map(f => fnv(f + '=' + a[f]))) }
    A.push(FIELDS.map(() => ROOTA))
    return A
  }
  // ---- the features of a state
  features(s, A, endsQ) {
    const {stack, b, n, heads, labels, lc, rc, nl, nr, mask} = s
    const s0 = stack.length ? stack[stack.length - 1] : -1, s1 = stack.length > 1 ? stack[stack.length - 2] : -1, s2 = stack.length > 2 ? stack[stack.length - 3] : -1
    const b1 = b + 1 <= n ? b + 1 : -1, b2 = b + 2 <= n ? b + 2 : -1
    const at = (k, f) => k < 0 ? NONE : A[k][f]
    const W = 0, SFX = 1, SH = 2, ST = 3, KD = 4, PP = 5, PN = 6, FI = 7
    const lab = k => k < 0 || k >= n || labels[k] < 0 ? NONE : 1000 + labels[k]
    const s0h = s0 >= 0 && heads[s0] >= 0 ? heads[s0] : -1
    const s0l = s0 >= 0 ? lc[s0] : -1, s0r = s0 >= 0 ? rc[s0] : -1, b0l = b < n ? lc[b] : -1, s0l2 = s0l >= 0 ? lc[s0l] : -1
    const s1r = s1 >= 0 ? rc[s1] : -1
    const d = s0 >= 0 ? Math.min(b - s0, 6) : 0
    const vr = s0 >= 0 ? nr[s0] : 0, vl = s0 >= 0 ? nl[s0] : 0, bvl = b < n ? nl[b] : 0
    const s0m = s0 >= 0 ? mask[s0] : 0, b0m = b < n ? mask[b] : 0
    // the marker of the buffer front: its first dependent labelled mark, and the first dependent word
    const b0mark = b < n ? s.markOf[b] : -1, s0mark = s0 >= 0 ? s.markOf[s0] : -1
    // punctuation between s0 and b0
    let between = 0
    if (s0 >= 0) for (let k = s0 + 1; k <= Math.min(b, n - 1); k++) { const p = s.punct[k]; if (p) between |= p }
    const isRoot = b === n ? 1 : 0
    const s0w = at(s0, W), s0t = at(s0, ST), b0w = at(b, W), b0t = at(b, ST), b1t = at(b1, ST), b1w = at(b1, W), b2t = at(b2, ST)
    const s1t = at(s1, ST), s1w = at(s1, W)
    const f = [
      key(1, s0w), key(2, s0t), key(3, s0w, s0t), key(4, at(s0, SFX)), key(5, at(s0, SH)), key(6, at(s0, KD)),
      key(7, b0w), key(8, b0t), key(9, b0w, b0t), key(10, at(b, SFX)), key(11, at(b, SH)), key(12, at(b, KD)),
      key(13, b1w), key(14, b1t), key(15, b1w, b1t), key(16, b2t), key(17, at(b2, W)),
      key(18, s1w), key(19, s1t), key(20, s1t, s0t), key(21, at(s2, ST)),
      key(22, s0w, s0t, b0w, b0t), key(23, s0w, s0t, b0w), key(24, s0w, b0w, b0t), key(25, s0w, s0t, b0t), key(26, s0t, b0w, b0t),
      key(27, s0w, b0w), key(28, s0t, b0t), key(29, b0t, b1t), key(30, b0t, b1t, b2t), key(31, s0t, b0t, b1t),
      key(32, at(s0h, ST), s0t, b0t), key(33, s0t, at(s0l, ST), b0t), key(34, s0t, at(s0r, ST), b0t), key(35, s0t, b0t, at(b0l, ST)),
      key(36, s0w, d), key(37, s0t, d), key(38, b0w, d), key(39, b0t, d), key(40, s0w, b0w, d), key(41, s0t, b0t, d),
      key(42, s0w, vr), key(43, s0t, vr), key(44, s0w, vl), key(45, s0t, vl), key(46, b0w, bvl), key(47, b0t, bvl),
      key(48, s0w, lab(s0)), key(49, s0t, lab(s0)), key(50, s0t, lab(s0l)), key(51, s0t, lab(s0r)), key(52, b0t, lab(b0l)),
      key(53, s0t, lab(s0l), lab(s0r)), key(54, s0t, s0m & 0xffffffff, Math.floor(s0m / 4294967296)), key(55, b0t, b0m & 0xffffffff, Math.floor(b0m / 4294967296)),
      key(56, at(b, PP)), key(57, at(s0, PN)), key(58, between), key(59, s0t, b0t, between), key(60, at(b, PP), b0t, s0t),
      key(61, at(s0, SH), at(b, SH)), key(62, at(b, FI)), key(63, at(s0, FI)), key(64, endsQ, s0t, isRoot), key(65, endsQ, s0w, lab(s0l)),
      key(66, at(s0, KD), b0t), key(67, s0t, at(b, KD)),
      key(68, at(b0mark, W), s0w), key(69, at(b0mark, W), s0t), key(70, at(b0mark, W), s0t, b0t), key(71, at(b0mark, W), lab(s0)), key(72, at(b0mark, W), s0w, b0w),
      key(73, at(s0mark, W), b0t), key(74, at(s0mark, W), s0t), key(75, at(s0l, W), s0t), key(76, at(s0l2, ST), at(s0l, ST), s0t),
      key(77, s1t, s0t, b0t), key(78, at(s1r, ST), s1t, s0t), key(79, s1t, b0t), key(80, s1w, b0w),
      key(81, isRoot, s0t, lab(s0l), lab(s0r)), key(82, isRoot, s0t, s0m & 0xffffffff, Math.floor(s0m / 4294967296)), key(83, isRoot, endsQ, s0m & 0xffffffff, Math.floor(s0m / 4294967296)),
      key(84, at(s0, PP), s0t), key(85, at(b, PN), b0t), key(86, at(s0, FI), s0t, isRoot), key(87, at(b, SH), at(b1, SH)),
      key(88, 0)
    ]
    if (this.options.extra) {
      const HB1 = 8, HB2 = 9, LK = 10, C64 = 11, C256 = 12, PR = 13, PV = 14
      const bm = at(b0mark, W)
      f.push(key(89, at(s0, HB1)), key(90, at(b, HB1)), key(91, at(s0, HB2)), key(92, at(b, HB2)), key(93, at(b, LK), s0t), key(94, at(s0, C64)), key(95, at(b, C64)),
        key(96, at(b1, C64)), key(97, at(s0, C256)), key(98, at(b, C256)), key(99, at(s0, C64), at(b, C64)), key(100, bm, at(s0, C64)), key(101, bm, at(s0, C256), at(b, C64)),
        key(102, at(b, PR), b0t), key(103, at(b, PV), s0t), key(104, at(s0, HB1), b0t), key(105, s0t, at(b, HB2)), key(106, at(s0, C64), b0t), key(107, s0t, at(b, C64)),
        key(108, at(b, C64), at(b1, C64)), key(110, bm, at(s0, HB1)), key(111, bm, at(s0, HB2)), key(112, at(b0mark, LK), s0t, lab(s0)),
        key(113, at(s0, HB1), isRoot, endsQ, s0m & 0xffffffff), key(114, at(s1, C64), s0t, b0t))
    }
    return f
  }
  scores(feats, out) {
    out.fill(0)
    const C = this.C
    for (const fk of feats) {
      const w = this.weights.get(fk)
      if (!w) continue
      for (let k = 0; k < C; k++) out[k] += w[k]
    }
    return out
  }
  update(feats, good, bad, delta) {
    const C = this.C, c = this.c
    for (const fk of feats) {
      let w = this.weights.get(fk)
      if (!w) { w = new Float32Array(2 * C); this.weights.set(fk, w) }
      w[good] += delta; w[C + good] += c * delta
      w[bad] -= delta; w[C + bad] -= c * delta
    }
  }
  average() {
    const C = this.C, c = this.c
    for (const [fk, w] of this.weights) {
      let any = false
      for (let k = 0; k < C; k++) { w[k] = w[k] - w[C + k] / c; if (Math.abs(w[k]) > 1e-4) any = true }
      if (!any) this.weights.delete(fk)
    }
    // keep only the averaged weights
    for (const [fk, w] of this.weights) this.weights.set(fk, w.slice(0, C))
  }
  // ---- the transition system
  init(sentence) {
    const n = sentence.atoms.length
    const punct = new Array(n + 1).fill(0)
    for (let k = 0; k < n; k++) { const p = sentence.atoms[k].pp; punct[k] = (p.includes(',') ? 1 : 0) | (/[.!?]/u.test(p) ? 2 : 0) | (/[;:—–-]/u.test(p) ? 4 : 0) }
    return {n, stack: [], b: 0, heads: new Array(n).fill(-2), labels: new Array(n).fill(-1), lc: new Array(n + 1).fill(-1), rc: new Array(n + 1).fill(-1),
      nl: new Array(n + 1).fill(0), nr: new Array(n + 1).fill(0), mask: new Array(n + 1).fill(0), markOf: new Array(n + 1).fill(-1), punct}
  }
  valid(s, move) {
    const {stack, b, n} = s
    const s0 = stack.length ? stack[stack.length - 1] : -1
    if (move === 0) return b < n
    if (move === 1) return s0 >= 0 && s.heads[s0] !== -2
    const la = move < 2 + this.L, l = (move - 2) % this.L
    if (la) return s0 >= 0 && s.heads[s0] === -2 && (b === n) === this.rootLabel[l]
    return s0 >= 0 && b < n && !this.rootLabel[l]
  }
  arc(s, h, d, l) {
    s.heads[d] = h === s.n ? -1 : h; s.labels[d] = l
    if (h === s.n) return
    if (d < h) { if (s.lc[h] < 0 || d < s.lc[h]) s.lc[h] = d; s.nl[h]++ } else { if (s.rc[h] < 0 || d > s.rc[h]) s.rc[h] = d; s.nr[h]++ }
    s.mask[h] += (Math.floor(s.mask[h] / 2 ** l) % 2 === 0) ? 2 ** l : 0
    if (this.labels[l] === 'mark' && s.markOf[h] < 0) s.markOf[h] = d
  }
  apply(s, move) {
    const s0 = s.stack.length ? s.stack[s.stack.length - 1] : -1
    if (move === 0) { s.stack.push(s.b); s.b++; return }
    if (move === 1) { s.stack.pop(); return }
    const l = (move - 2) % this.L
    if (move < 2 + this.L) { this.arc(s, s.b, s0, l); s.stack.pop() }
    else { this.arc(s, s0, s.b, l); s.stack.push(s.b); s.b++ }
  }
  terminal(s) { return s.b === s.n && s.stack.length === 0 }
  // ---- the dynamic oracle: the number of gold arcs a move makes unreachable (gh: gold heads, -1 root -> n)
  cost(s, move, gh, gl) {
    const {stack, b, n} = s
    const s0 = stack[stack.length - 1]
    const head = k => gh[k] < 0 ? n : gh[k]
    let cost = 0
    if (move === 0) {          // SH: b0 can no longer take a head or dependents from the stack
      for (const k of stack) { if (head(b) === k) cost++; if (s.heads[k] === -2 && head(k) === b) cost++ }
      return cost
    }
    if (move === 1) {          // RE: s0's dependents in the buffer are lost
      for (let k = b; k < n; k++) if (head(k) === s0) cost++
      return cost
    }
    const l = (move - 2) % this.L
    if (move < 2 + this.L) {   // LA: s0 gets its head b0
      if (head(s0) !== b && head(s0) >= b) cost++
      for (let k = b; k < n; k++) if (head(k) === s0) cost++
      if (head(s0) === b && gl[s0] !== l) cost++
      return cost
    }
    // RA: b0 gets its head s0
    if (head(b) !== s0) { if (head(b) >= b || stack.includes(head(b))) cost++ }
    for (const k of stack) if (s.heads[k] === -2 && head(k) === b) cost++
    if (head(b) === s0 && gl[b] !== l) cost++
    return cost
  }
  // ---- parse one message
  parse(sentence) {
    const A = this.atomsOf(sentence), s = this.init(sentence)
    const sc = new Float64Array(this.C)
    let guard = 0
    while (!this.terminal(s) && guard++ < 4 * s.n + 10) {
      const feats = this.features(s, A, sentence.endsQ)
      this.scores(feats, sc)
      let best = -1, bestScore = -Infinity
      for (let m = 0; m < this.C; m++) if (sc[m] > bestScore && this.valid(s, m)) { best = m; bestScore = sc[m] }
      if (best < 0) break
      this.apply(s, best)
    }
    // anything left without a head attaches to the root as a fragment
    for (let k = 0; k < s.n; k++) if (s.heads[k] === -2) { s.heads[k] = -1; s.labels[k] = this.labels.indexOf('root:frag.N') }
    return {heads: s.heads, labels: s.labels.map(l => this.labels[l])}
  }
  // ---- learn from one message; returns the number of wrong moves
  train(sentence, weight = 1, explore = 0, rng = Math.random) {
    const A = this.atomsOf(sentence), s = this.init(sentence)
    const gh = sentence.heads, gl = sentence.labels.map(l => this.labels.indexOf(l))
    const sc = new Float64Array(this.C)
    let wrong = 0, guard = 0
    while (!this.terminal(s) && guard++ < 4 * s.n + 10) {
      const feats = this.features(s, A, sentence.endsQ)
      this.scores(feats, sc)
      let pred = -1, predScore = -Infinity, gold = -1, goldScore = -Infinity
      for (let m = 0; m < this.C; m++) {
        if (!this.valid(s, m)) continue
        if (sc[m] > predScore) { pred = m; predScore = sc[m] }
        if (sc[m] > goldScore && this.cost(s, m, gh, gl) === 0) { gold = m; goldScore = sc[m] }
      }
      if (gold < 0) gold = pred      // no zero-cost move (non-projective rest): follow the model
      if (pred !== gold) { this.update(feats, gold, pred, weight); wrong++ }
      this.c++
      this.apply(s, pred !== gold && rng() < explore ? pred : gold)
    }
    return wrong
  }
  toJSON() {
    const features = {}
    for (const [fk, w] of this.weights) features[fk] = Array.from(w, x => Math.round(x * 1000) / 1000)
    return {labels: this.labels, options: this.options, features}
  }
  static fromJSON(json) {
    const p = new Parser(json.labels, json.options ?? {})
    for (const [fk, w] of Object.entries(json.features)) p.weights.set(Number(fk), Float32Array.from(w))
    return p
  }
}
