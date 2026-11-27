// Hierarchical strict-vss, design check (read-only): the holding tree of each label circuit.
// A relation is held by its `from` wire (a coordination of relations by the common `from`);
// subject/complement/to/conjunct hold the wire they name; `ellipsis` is a pointer (re-entrance), not holding.
// Measures: top wires, re-entrant wires, depth, terms per constellation, and two writer ceilings:
//   spans: wires with their label spans through writeCircuit (the pilot knows its spans);
//   preorder: quoted words only, wires written in the holding tree's pre-order (decode from the top star, no positions).
import {writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {parseCircuit, validateSyntax, coreOf, writeCircuit, wordsOf} = await import(root + 'lib/syntax.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const MULTI = new Set(['dependent', 'modifier', 'auxiliary', 'negation', 'discourse', 'complement', 'conjunct', 'conjunction', 'rel'])
const hist = (h, k) => { h[k] = (h[k] ?? 0) + 1 }
const H = {top: {}, depth: {}, reentrant: {}, reentrantKeys: {}, termsNominal: {}, termsClause: {}, termsRelation: {}, termsCoord: {}, termsMessage: {}, termsMax: {}, coordRelSameFrom: {}, endTerms: {}}
const bucket = x => x <= 12 ? String(x) : x <= 16 ? '13-16' : x <= 24 ? '17-24' : x <= 32 ? '25-32' : '33+'
let n = 0, spansOk = 0, preOk = 0, preErr = 0, spansErr = 0
const examples = {}
const keep = (kind, text, sop) => { const a = examples[kind] ??= []; if (a.length < 4) a.push({text, sop}) }
const sampleOut = []
const all = [...readLabels(process.env.SYNTACTIC_DIR || undefined)].filter(([text]) => !bench.has(norm(text)))   // SYNTACTIC_DIR: a frozen snapshot (v2/)
// deterministic sample of 400 for reading
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const pick = new Set(); while (pick.size < 400) pick.add(Math.floor(rnd() * all.length))
all.forEach(([text, row], index) => {
  const sop = row.label
  const check = validateSyntax(text, sop)
  if (!check.valid) return
  n++
  const wires = parseCircuit(sop), byId = new Map(wires.map(w => [w.id, w]))
  const refsOf = w => w.slots.filter(s => s[1].startsWith('$')).map(([key, v]) => ({key, id: v.slice(1)}))
  const relCoord = new Map()
  for (const w of wires) if (w.type === 'syntax.coordination') for (const r of refsOf(w)) if (byId.get(r.id)?.type === 'syntax.relation') relCoord.set(r.id, w.id)
  const holders = new Map(wires.map(w => [w.id, new Map()]))
  const children = new Map(wires.map(w => [w.id, []]))
  const add = (child, parent, key) => { if (!holders.get(child).has(parent)) { holders.get(child).set(parent, key); children.get(parent).push({id: child, key}) } }
  for (const w of wires) for (const r of refsOf(w)) {
    if (w.type === 'syntax.relation' && r.key === 'from') {
      const k = relCoord.get(w.id)
      if (k) { add(k, r.id, 'rel'); add(w.id, k, 'conjunct') } else add(w.id, r.id, 'rel')
      continue
    }
    if (r.key === 'ellipsis') continue
    if (w.type === 'syntax.coordination' && byId.get(r.id)?.type === 'syntax.relation') continue
    add(r.id, w.id, r.key)
  }
  // coordination of relations: same from?
  for (const w of wires) if (w.type === 'syntax.coordination') {
    const rels = refsOf(w).filter(r => byId.get(r.id)?.type === 'syntax.relation')
    if (rels.length) { const froms = new Set(rels.map(r => byId.get(r.id).slots.find(s => s[0] === 'from')[1])); hist(H.coordRelSameFrom, froms.size === 1 ? 'same' : 'different'); keep('coordination of relations', text, sop) }
  }
  const top = wires.filter(w => holders.get(w.id).size === 0)
  hist(H.top, Math.min(top.length, 8))
  let re = 0
  for (const w of wires) if (holders.get(w.id).size > 1) { re++; hist(H.reentrantKeys, [...holders.get(w.id).values()].sort().join('+')); keep('re-entrant ' + [...holders.get(w.id).values()].sort().join('+'), text, sop) }
  hist(H.reentrant, Math.min(re, 3))
  // depth (guard cycles)
  const depthOf = (id, seen = new Set()) => { if (seen.has(id)) return 0; seen.add(id); return 1 + Math.max(0, ...children.get(id).map(c => depthOf(c.id, new Set(seen)))) }
  hist(H.depth, Math.min(Math.max(...top.map(w => depthOf(w.id)), 0), 9))
  // terms per constellation: 1 form/type term + one per word value + one per held child (+ END per present multi key, counted apart)
  let maxTerms = 0
  for (const w of wires) {
    let terms = 1, ends = new Set()
    for (const [key, raw] of w.slots) {
      if (raw.startsWith('"')) { terms += Math.max(1, JSON.parse(raw).trim().split(/\s+/u).length); if (MULTI.has(key)) ends.add(key) }
    }
    for (const c of children.get(w.id)) { terms++; if (MULTI.has(c.key)) ends.add(c.key) }
    if (w.type === 'syntax.clause' && w.slots.some(s => s[0] === 'ellipsis')) { terms++; keep('ellipsis', text, sop) }
    if (w.type === 'syntax.relation' && w.slots.some(s => s[0] === 'attachment')) terms++
    const h = {'syntax.nominal': H.termsNominal, 'syntax.clause': H.termsClause, 'syntax.relation': H.termsRelation, 'syntax.coordination': H.termsCoord}[w.type]
    hist(h, bucket(terms)); hist(H.endTerms, bucket(terms + ends.size))
    maxTerms = Math.max(maxTerms, terms)
  }
  hist(H.termsMessage, bucket(top.length))
  hist(H.termsMax, bucket(maxTerms))
  // examples of constructions
  for (const w of wires) {
    if (w.type === 'syntax.relation') {
      const f = byId.get(w.slots.find(s => s[0] === 'from')[1].slice(1)).type.slice(7), t = byId.get(w.slots.find(s => s[0] === 'to')[1].slice(1)).type.slice(7)
      const m = w.slots.some(s => s[0] === 'marker') ? 'marker' : 'nomarker'
      keep(`relation ${f}->${t} ${m}`, text, sop)
      if (w.slots.some(s => s[0] === 'negation')) keep('relation negation', text, sop)
      if (w.slots.some(s => s[0] === 'attachment')) keep('attachment=ambiguous', text, sop)
    }
    if (w.type === 'syntax.clause') { const f = w.slots.find(s => s[0] === 'form')[1]; keep('form ' + f, text, sop); if (w.slots.some(s => s[0] === 'negation')) keep('clause negation', text, sop) }
    if (w.type === 'syntax.coordination') { const t = byId.get(refsOf(w)[0].id).type.slice(7); const hs = [...holders.get(w.id).values()].join('+') || 'top'; keep(`coordination of ${t} held by ${hs}`, text, sop) }
  }
  if (top.length >= 3) keep('3+ top wires', text, sop)
  // writer ceilings
  const label = coreOf(text, sop)
  // spans path
  try {
    const place = check.placements; let p = 0
    const ws = wires.map(w => ({id: w.id, type: w.type, slots: w.slots.map(([key, raw]) => raw.startsWith('"') ? (() => { const {first, last} = place[p++]; return {key, span: [first, last]} })() : raw.startsWith('$') ? {key, ref: raw.slice(1)} : {key, value: raw})}))
    if (coreOf(text, writeCircuit(text, ws)) === label) spansOk++
  } catch { spansErr++ }
  // pre-order path: quoted words, wires in pre-order; children sorted by first word position
  const firstOf = new Map(); for (const {wire, first} of check.placements) firstOf.set(wire, Math.min(firstOf.get(wire) ?? Infinity, first))
  const firstDeep = (id, seen = new Set()) => { if (seen.has(id)) return Infinity; seen.add(id); return Math.min(firstOf.get(id) ?? Infinity, ...children.get(id).map(c => firstDeep(c.id, seen))) }
  const order = [], done = new Set()
  const visit = id => { if (done.has(id)) return; done.add(id); order.push(id); for (const c of [...children.get(id)].sort((a, b) => firstDeep(a.id) - firstDeep(b.id))) visit(c.id) }
  for (const w of [...top].sort((a, b) => firstDeep(a.id) - firstDeep(b.id))) visit(w.id)
  for (const w of wires) visit(w.id)
  const pre = order.map(id => { const w = byId.get(id); return [`@${w.id} ${w.type}`, ...w.slots.map(([k, v]) => `${k}=${v}`)].join(' ') }).join('\n')
  const c2 = coreOf(text, pre)
  if (c2 === null) preErr++; else if (c2 === label) preOk++
  if (pick.has(index)) sampleOut.push({text, sop, top: top.map(w => w.id), depth: Math.max(...top.map(w => depthOf(w.id)), 0)})
})
const pct = x => (100 * x / n).toFixed(2) + '%'
console.log('labels used', n)
console.log('writer ceiling, spans known (pilot path):', spansOk, pct(spansOk), 'errors', spansErr)
console.log('writer ceiling, words only, pre-order of holding tree (decode from the top star):', preOk, pct(preOk), 'invalid', preErr)
for (const [k, v] of Object.entries(H)) console.log(k, JSON.stringify(v))
writeFileSync(new URL('./examples.json', import.meta.url), JSON.stringify(examples, null, 1))
writeFileSync(new URL('./sample400.json', import.meta.url), JSON.stringify(sampleOut, null, 1))
