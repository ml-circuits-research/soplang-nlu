// Critic check (read-only): constructions in 200 random labels and the lookahead each OPEN decision needs
// under the static oracle's opening conventions (strategies/strict-vss/hierarchy-checks/oracle.mjs).
// Usage: node analyze.mjs [sampleSize] [all]
import {writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {parseCircuit, wordsOf} = await import(root + 'lib/syntax.mjs')
const {derive} = await import('./oracle-instr.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const all = [...readLabels()].filter(([text]) => !bench.has(norm(text)))
const N = Number(process.argv[2] ?? 200), doAll = process.argv[3] === 'all'
let seed = 20261127; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const pick = new Set(); while (pick.size < N) pick.add(Math.floor(rnd() * all.length))
const hist = (h, k, v = 1) => { h[k] = (h[k] ?? 0) + v }
const bucket = L => L <= 0 ? '0' : L <= 3 ? String(L) : L <= 6 ? '4-6' : '7+'

function analyse(text, sop, H, examples) {
  let r
  try { r = derive(text, sop) } catch (e) { hist(H.fail, e.message); examples.fail.push({text, err: e.message}); return null }
  const {wires, byId, ownFirst, open, holder, hkey, children, placements, pointers} = r.info
  const type = id => byId.get(id).type.slice(7)
  const words = wordsOf(text).map(w => w.text)
  const flags = new Set()
  const slotsOf = id => byId.get(id).slots
  for (const w of wires) {
    const t = type(w.id), s = w.slots
    if (t === 'clause') flags.add('clause.' + s.find(x => x[0] === 'form')[1])
    if (t === 'relation') {
      const to = byId.get(s.find(x => x[0] === 'to')[1].slice(1)), from = byId.get(s.find(x => x[0] === 'from')[1].slice(1))
      flags.add('relation from ' + from.type.slice(7) + ' to ' + to.type.slice(7))
      const mk = s.filter(x => x[0] === 'marker')
      if (!mk.length) flags.add('relation without marker')
      if (mk.some(x => x[1] === '"\'s"' || x[1] === '"’s"')) flags.add('possessive')
      if (s.some(x => x[0] === 'negation')) flags.add('relation negation')
      if (s.some(x => x[0] === 'attachment')) flags.add('attachment=ambiguous')
      if (mk.some(x => x[1].includes(' '))) flags.add('multiword marker')
    }
    if (t === 'coordination') {
      const cs = s.filter(x => x[0] === 'conjunct')
      flags.add('coordination of ' + [...new Set(cs.map(c => byId.get(c[1].slice(1)).type.slice(7)))].join('+'))
      if (!s.some(x => x[0] === 'conjunction')) flags.add('coordination without conjunction word')
      if (cs.length > 2) flags.add('coordination of 3+')
    }
    if (t === 'nominal' && s.some(x => x[0] === 'head' && x[1].includes(' '))) flags.add('multiword head')
    if (t === 'clause' && s.some(x => x[0] === 'ellipsis')) flags.add('ellipsis')
  }
  for (const m of r.moves) {
    if (m.startsWith('POINT subject')) flags.add('re-entrant subject (POINT)')
    if (m.startsWith('REOPEN')) flags.add('REOPEN')
    if (m === 'CLAIM rel') flags.add('relation held aside, claimed')
    if (m === 'CLAIM subject') flags.add('subject held aside, claimed')
    if (m === 'CLAIM complement') flags.add('complement held aside (fragment wraps)')
    if (m.startsWith('COORD other')) flags.add('COORD other child')
  }
  if (Object.values(holder).filter(h => h === 'M').length > 1) flags.add('2+ top wires')
  for (const f of flags) hist(H.flags, f)
  // lookahead of every OPEN: evidence position minus opening position
  const evidence = id => {
    if (ownFirst[id] !== undefined) {
      const t = type(id)
      if (t === 'relation' || t === 'coordination') return ownFirst[id]
      return ownFirst[id]
    }
    const t = type(id)
    if (t === 'relation') { const to = children[id].find(c => hkey[c] === 'to'); return to ? evidence(to) : open[id] }
    if (t === 'coordination') { const cs = [...children[id]].sort((a, b) => open[a] - open[b]); return cs[1] ? evidence(cs[1]) : open[id] }
    return open[id] // fragment clause wraps at the token after its words: no lookahead
  }
  const recOpen = r.rec.filter(x => x.m.startsWith('OPEN') || x.m.startsWith('COORD'))
  for (const w of wires) {
    const t = type(w.id), p = open[w.id]
    if (t === 'clause' && ownFirst[w.id] === undefined) { hist(H.look, 'clause (fragment wraps late)|0'); continue }
    let e = evidence(w.id)
    // a relation with a marker that comes after the start of its `to`
    const L = e - p
    let label = t
    if (t === 'relation') label += ownFirst[w.id] === undefined ? ' (no marker)' : (ownFirst[w.id] > p ? ' (marker after start of to)' : ' (opens at marker)')
    if (t === 'coordination') label += ownFirst[w.id] === undefined ? ' (no conjunction word)' : (ownFirst[w.id] > p ? ' (conjunction after start of conjunct 2)' : ' (opens at conjunction)')
    hist(H.look, label + '|' + bucket(L))
    if (L > 3 && examples.look.length < 40) examples.look.push({text, wire: w.id, label, open: p, evidence: e, at: words[p], ev: words[e]})
  }
  // held decisions with an open constellation that could have taken the item
  for (const x of r.rec) if (x.m === 'OPEN nominal@held' || x.m === 'OPEN relation@held') {
    const nonM = x.stack.filter(s => s !== 'M')
    hist(H.held, (x.m.includes('nominal') ? 'nominal' : 'relation') + (nonM.length ? ' held while ' + x.stack.at(-1) + ' is open' : ' held, nothing open'))
  }
  return {r, flags}
}

const H = {fail: {}, flags: {}, look: {}, held: {}}, ex = {fail: [], look: []}, sample = []
let i = 0, ok = 0
for (const [text, row] of all) {
  if (pick.has(i)) { const a = analyse(text, row.label, H, ex); if (a) { ok++; sample.push({text, sop: row.label, source: row.source, accepted_by: row.accepted_by, flags: [...a.flags], moves: a.r.rec.map(x => x.p + ':' + x.m).join(' | ')}) } }
  i++
}
const show = (title, h) => console.log(title, JSON.stringify(Object.entries(h).sort((a, b) => b[1] - a[1])))
console.log('sample', N, 'derived', ok)
show('failures', H.fail); show('constructions (messages)', H.flags); show('open lookahead (wire|words)', H.look); show('held decisions', H.held)
writeFileSync(new URL('./sample200.json', import.meta.url), JSON.stringify({sample, examples: ex}, null, 1))
if (doAll) {
  const G = {fail: {}, flags: {}, look: {}, held: {}}, gx = {fail: [], look: []}
  let n = 0
  for (const [text, row] of all) { analyse(text, row.label, G, gx); n++ }
  console.log('\nALL', n)
  show('failures', G.fail); show('constructions (messages)', G.flags); show('open lookahead (wire|words)', G.look); show('held decisions', G.held)
  writeFileSync(new URL('./all-lookahead-examples.json', import.meta.url), JSON.stringify(gx, null, 1))
}
