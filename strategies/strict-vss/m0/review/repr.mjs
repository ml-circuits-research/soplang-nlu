// Critic check (read-only): can the strict-vss tree encoding (tree.mjs + two re-headings) carry every construction
// of the syntax schema? Round trip label -> tree -> rehead -> unrehead -> circuit, compared by core.
//   node repr.mjs [sampleSize] [seed]
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample, normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {parseCircuit, wordsOf} = await import(root + 'lib/syntax.mjs')
const {circuitToTree, treeToCircuit} = await import(root + 'experiments/syntax-learned/parser/tree.mjs')
const N = Number(process.argv[2] ?? 200)
let seed = Number(process.argv[3] ?? 20261127)
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const labels = [...readLabels()].filter(([t]) => !bench.has(norm(t)))
const attach = l => l.split(':')[0], tag = l => l.includes(':') ? l.slice(l.indexOf(':') + 1) : null
// forward re-heading, exactly as the design's rehead.mjs
function rehead({heads, labels: L}) {
  const h = [...heads], l = [...L], n = h.length
  for (let t = 0; t < n; t++) {
    if (!attach(l[t]).startsWith('rel')) continue
    const marks = []; for (let m = 0; m < n; m++) if (h[m] === t && l[m] === 'mark') marks.push(m)
    if (!marks.length) continue
    const m0 = marks[0]
    h[m0] = h[t]; l[m0] = attach(l[t]); for (const m of marks.slice(1)) { h[m] = m0; l[m] = 'cont' }
    h[t] = m0; l[t] = 'pobj:' + tag(l[t])
  }
  for (let k = 0; k < n; k++) {
    const cs = []; for (let c = 0; c < n; c++) if (h[c] === k && attach(l[c]) === 'conj') cs.push(c)
    cs.sort((a, b) => a - b); for (let i = 1; i < cs.length; i++) h[cs[i]] = cs[i - 1]
  }
  return {heads: h, labels: l}
}
// the inverse the design promises (written here, since none exists yet)
function unrehead({heads, labels: L}) {
  const h = [...heads], l = [...L], n = h.length
  // chained conjuncts back to the first conjunct
  const orig = [...h]
  for (let c = 0; c < n; c++) {
    if (attach(l[c]) !== 'conj') continue
    let p = orig[c], guard = 0
    while (p >= 0 && attach(l[p]) === 'conj' && guard++ < n) p = orig[p]
    h[c] = p
  }
  // markers hand the arc back to the end word
  for (let t = 0; t < n; t++) {
    if (!l[t].startsWith('pobj:')) continue
    const m0 = h[t]
    h[t] = h[m0]; l[t] = l[m0] + ':' + tag(l[t])
    for (let m = 0; m < n; m++) if (h[m] === m0 && l[m] === 'cont') { h[m] = t; l[m] = 'mark' }
    h[m0] = t; l[m0] = 'mark'
  }
  return {heads: h, labels: l}
}
function features(text, sop) {
  const wires = parseCircuit(sop), byId = new Map(wires.map(w => [w.id, w]))
  const f = new Set()
  const count = t => wires.filter(w => w.type === t).length
  if (count('syntax.clause') >= 2) f.add('clauses>=2')
  if (count('syntax.clause') >= 4) f.add('clauses>=4')
  if (count('syntax.relation') >= 3) f.add('relations>=3')
  if (count('syntax.coordination') >= 2) f.add('coordinations>=2')
  if (wordsOf(text).length >= 25) f.add('words>=25')
  for (const w of wires) for (const [k, raw] of w.slots) {
    if (k === 'ellipsis') f.add('ellipsis')
    if (k === 'attachment') f.add('ambiguous')
    if (w.type === 'syntax.clause' && k === 'negation') f.add('clause-negation')
    if (w.type === 'syntax.relation' && k === 'negation') f.add('relation-negation')
    if (w.type === 'syntax.clause' && k === 'form') f.add('form=' + raw)
    if (w.type === 'syntax.relation' && (k === 'from' || k === 'to')) {}
  }
  for (const w of wires) {
    if (w.type === 'syntax.relation') {
      const get = key => byId.get(w.slots.find(s => s[0] === key)[1].slice(1)).type.slice(7)
      f.add('rel ' + get('from') + '->' + get('to') + (w.slots.some(s => s[0] === 'marker') ? '' : ' (no marker)'))
    }
    if (w.type === 'syntax.coordination') {
      const t = byId.get(w.slots.find(s => s[0] === 'conjunct')[1].slice(1)).type.slice(7)
      f.add('coord of ' + t)
      const n = w.slots.filter(s => s[0] === 'conjunct').length
      if (n >= 3) f.add('coord conjuncts>=3')
      if (!w.slots.some(s => s[0] === 'conjunction')) f.add('coord no conjunction')
    }
  }
  // a nominal referenced twice (comp of one clause and subject of another)
  const refCount = {}
  for (const w of wires) for (const [, raw] of w.slots) if (raw.startsWith('$')) refCount[raw] = (refCount[raw] ?? 0) + 1
  if (Object.values(refCount).some(v => v >= 2)) f.add('wire referenced twice')
  return f
}
function check(text, row) {
  const r = {features: features(text, row.label)}
  const t = circuitToTree(text, row.label)
  if (t.error) { r.fail = 'encode: ' + t.error; return r }
  let back
  try { back = treeToCircuit(text, t.heads, t.labels) } catch (e) { r.fail = 'decode: ' + e.message; return r }
  r.plain = normalForm(text, back)?.core === row.core
  const re = rehead(t), un = unrehead(re)
  r.treeBack = un.heads.every((x, i) => x === t.heads[i]) && un.labels.every((x, i) => x === t.labels[i])
  let back2
  try { back2 = treeToCircuit(text, un.heads, un.labels) } catch (e) { r.fail = 'decode2: ' + e.message; return r }
  r.reheaded = normalForm(text, back2)?.core === row.core
  // projectivity of the re-headed tree
  const n = re.heads.length
  const arcs = re.heads.map((x, d) => [x < 0 ? n : x, d])
  r.nonproj = arcs.some(([h1, d1]) => arcs.some(([h2, d2]) => { const a = Math.min(h1, d1), b = Math.max(h1, d1), c = Math.min(h2, d2), e = Math.max(h2, d2); return a < c && c < b && b < e }))
  return r
}
function report(name, list) {
  const tot = list.length
  const enc = list.filter(r => r.fail?.startsWith('encode')).length
  const dec = list.filter(r => r.fail && !r.fail.startsWith('encode')).length
  const plain = list.filter(r => r.plain).length, tb = list.filter(r => r.treeBack).length, rh = list.filter(r => r.reheaded).length
  console.log(`${name}: n=${tot} encode-fail=${enc} decode-fail=${dec} roundtrip(content heads)=${plain} tree-unrehead-identical=${tb} roundtrip(re-headed)=${rh}`)
}
// 1. random sample
const sample = []
const used = new Set()
while (sample.length < N && used.size < labels.length) { const i = Math.floor(rnd() * labels.length); if (used.has(i)) continue; used.add(i); sample.push(labels[i]) }
const res = sample.map(([t, row]) => ({text: t, ...check(t, row)}))
report(`random sample of ${N}`, res)
const featCount = {}
for (const r of res) for (const f of r.features) { const c = featCount[f] ??= {n: 0, ok: 0, okRe: 0}; c.n++; c.ok += r.plain ? 1 : 0; c.okRe += r.reheaded ? 1 : 0 }
console.log('constructions in the sample (n / round trip content heads / round trip re-headed):')
for (const [f, c] of Object.entries(featCount).sort((a, b) => b[1].n - a[1].n)) console.log('  ' + f.padEnd(34), c.n, c.ok, c.okRe)
for (const r of res.filter(r => !r.reheaded)) console.log('  NOT BACK:', r.fail ?? (r.plain ? 'rehead' : 'plain'), '|', r.text)
// 2. every label with a rare construction
if (!process.argv.includes('--no-rare')) {
  const rare = {ellipsis: [], 'relation-negation': [], 'clause-negation': [], 'coord of relation': [], 'coordinations>=2': [], ambiguous: [], 'words>=25': [], 'wire referenced twice': []}
  for (const [t, row] of labels) {
    const f = features(t, row.label)
    for (const k of Object.keys(rare)) if (f.has(k)) rare[k].push([t, row])
  }
  for (const [k, list] of Object.entries(rare)) {
    const take = list.length > 3000 ? list.filter((_, i) => i % Math.ceil(list.length / 3000) === 0) : list
    const rs = take.map(([t, row]) => ({text: t, ...check(t, row)}))
    report(`ALL with ${k} (${list.length}${take.length < list.length ? ', every ' + Math.ceil(list.length / 3000) + 'th' : ''})`, rs)
    if (process.argv.includes('--show')) for (const r of rs.filter(r => !r.reheaded).slice(0, 4)) console.log('    x', r.fail ?? (r.plain ? 'lost by rehead' : 'lost by tree'), '|', r.text)
  }
}
