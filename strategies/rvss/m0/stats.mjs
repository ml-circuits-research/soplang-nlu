// Structure statistics of the syntax labels, for the strict-vss design (read-only).
import {readFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {wordsOf, validateSyntax, parseCircuit} = await import(root + 'lib/syntax.mjs')
const {circuitToTree} = await import(root + 'experiments/syntax-learned/parser/tree.mjs')

const labels = readLabels()
const sample = readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(sample.map(r => norm(r.text)))
console.log('labelled messages', labels.size, 'benchmark sample', sample.length)
const by = {}, hist = (h, k) => { h[k] = (h[k] ?? 0) + 1 }
const H = {words: {}, clauses: {}, nominals: {}, relations: {}, coords: {}, wires: {}, terms: {}, refs: {}, accepted_by: {}, source: {}}
const keys = {}, forms = {}, markerLen = {}, conjTypes = {}
let n = 0, inBench = 0, invalid = 0, ell = 0, amb = 0, relNoMarker = 0, relTotal = 0, relNeg = 0, relFromClause = 0, relFromNominal = 0, relFromCoord = 0, relToClause = 0
let coordNoConj = 0, coordTotal = 0, multiHeadSpan = 0, nominalsTotal = 0, depAfterHead = 0
let treeOk = 0, treeErr = {}, offsets = {}, labelCounts = {}, nonproj = 0, arcs = 0, nearestOpen = 0
const wordsAll = []
for (const [text, row] of labels) {
  n++
  if (bench.has(norm(text))) { inBench++; continue }
  hist(H.accepted_by, row.accepted_by || '(none)'); hist(H.source, (row.source || '(none)').split(/[+, ]/u)[0])
  const sop = row.label
  const check = validateSyntax(text, sop)
  if (!check.valid) { invalid++; continue }
  const w = wordsOf(text).length; wordsAll.push(w)
  const bucket = x => x <= 5 ? String(x) : x <= 10 ? '6-10' : x <= 15 ? '11-15' : x <= 20 ? '16-20' : x <= 30 ? '21-30' : x <= 40 ? '31-40' : x <= 60 ? '41-60' : '61+'
  hist(H.words, bucket(w))
  const wires = parseCircuit(sop)
  const count = t => wires.filter(x => x.type === t).length
  hist(H.clauses, Math.min(count('syntax.clause'), 8)); hist(H.nominals, Math.min(count('syntax.nominal'), 15))
  hist(H.relations, Math.min(count('syntax.relation'), 10)); hist(H.coords, Math.min(count('syntax.coordination'), 6))
  hist(H.wires, bucket(wires.length))
  let terms = 0, refs = 0
  const byId = new Map(wires.map(x => [x.id, x]))
  for (const x of wires) {
    for (const [k, raw] of x.slots) {
      hist(keys, x.type.slice(7) + '.' + k); terms++
      if (raw.startsWith('$')) refs++
      if (k === 'form') hist(forms, raw)
      if (k === 'ellipsis') ell++
      if (k === 'attachment') amb++
      if (k === 'marker') hist(markerLen, JSON.parse(raw).trim().split(/\s+/u).length)
    }
    if (x.type === 'syntax.relation') {
      relTotal++
      if (!x.slots.some(s => s[0] === 'marker')) relNoMarker++
      if (x.slots.some(s => s[0] === 'negation')) relNeg++
      const from = byId.get(x.slots.find(s => s[0] === 'from')[1].slice(1))?.type, to = byId.get(x.slots.find(s => s[0] === 'to')[1].slice(1))?.type
      if (from === 'syntax.clause') relFromClause++; else if (from === 'syntax.nominal') relFromNominal++; else relFromCoord++
      if (to === 'syntax.clause') relToClause++
    }
    if (x.type === 'syntax.coordination') {
      coordTotal++
      if (!x.slots.some(s => s[0] === 'conjunction')) coordNoConj++
      const t = byId.get(x.slots.find(s => s[0] === 'conjunct')[1].slice(1))?.type
      hist(conjTypes, t)
    }
  }
  hist(H.terms, bucket(terms)); hist(H.refs, bucket(refs))
  // dependents after the head
  for (const p of check.placements) {}
  const tree = circuitToTree(text, sop)
  if (tree.error) { hist(treeErr, tree.error.split(',')[0]); continue }
  treeOk++
  const {heads, labels: L} = tree
  for (let k = 0; k < heads.length; k++) {
    arcs++
    hist(labelCounts, L[k])
    const off = heads[k] < 0 ? 'root' : heads[k] - k
    const ob = off === 'root' ? 'root' : off < -10 ? '<-10' : off > 10 ? '>10' : String(off)
    hist(offsets, ob)
  }
  // projectivity
  let cross = false
  for (let a = 0; a < heads.length && !cross; a++) for (let b = 0; b < heads.length && !cross; b++) {
    if (heads[a] < 0 || heads[b] < 0) continue
    const [l1, r1] = [Math.min(a, heads[a]), Math.max(a, heads[a])], [l2, r2] = [Math.min(b, heads[b]), Math.max(b, heads[b])]
    if (l1 < l2 && l2 < r1 && r1 < r2) cross = true
  }
  if (cross) nonproj++
}
const pct = (h, tot) => Object.fromEntries(Object.entries(h).sort((a, b) => (isNaN(a[0]) ? a[0] : +a[0]) > (isNaN(b[0]) ? b[0] : +b[0]) ? 1 : -1).map(([k, v]) => [k, `${v} (${(100 * v / tot).toFixed(1)}%)`]))
const used = n - inBench - invalid
console.log({n, inBench, invalid, used})
for (const [name, h] of Object.entries(H)) console.log(name, pct(h, used))
wordsAll.sort((a, b) => a - b)
console.log('words: mean', (wordsAll.reduce((a, b) => a + b, 0) / wordsAll.length).toFixed(1), 'median', wordsAll[wordsAll.length >> 1], 'p90', wordsAll[Math.floor(wordsAll.length * 0.9)], 'p99', wordsAll[Math.floor(wordsAll.length * 0.99)], 'max', wordsAll.at(-1))
console.log('forms', forms)
console.log('keys', Object.fromEntries(Object.entries(keys).sort((a, b) => b[1] - a[1])))
console.log('marker length', markerLen)
console.log({ell, amb, relTotal, relNoMarker, relNeg, relFromClause, relFromNominal, relFromCoord, relToClause, coordTotal, coordNoConj, conjTypes})
console.log('tree ok', treeOk, 'errors', treeErr, 'nonprojective', nonproj, 'arcs', arcs)
console.log('labels', Object.keys(labelCounts).length, Object.fromEntries(Object.entries(labelCounts).sort((a, b) => b[1] - a[1])))
console.log('offsets', pct(offsets, arcs))
