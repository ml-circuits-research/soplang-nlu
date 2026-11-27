// Hierarchical strict-vss, design check (read-only): can the pilot's moves build every label?
// Static oracle over the holding tree (see holding.mjs), then the moves are executed without the
// label, the circuit is written with writeCircuit and its core compared with the label's core.
// Moves: CLOSE, OPEN type@key | type@held, COORD (takes the last closed child or the last held item as
// conjunct 1), CLAIM key (a held item taken by the new constellation), REOPEN (the last closed child
// goes back on the stack), POINT key (re-entrance: a key holds a star already placed elsewhere),
// PLACE key (a word into the current constellation), FORM / AMB atoms at close.
// Opening times o(X): nominal = its first own word; clause = its first own word, or the token after its
// subtree when it has none (a verbless fragment is wrapped around what was held); relation =
// min(first own word, start of its `to`); coordination = min(first own word, start of conjunct 2).
import {writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {parseCircuit, validateSyntax, coreOf, writeCircuit, wordsOf} = await import(root + 'lib/syntax.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const hist = (h, k) => { h[k] = (h[k] ?? 0) + 1 }

class Fail extends Error {}

export function derive(text, sop) {
  const check = validateSyntax(text, sop)
  if (!check.valid) throw new Fail('invalid')
  const n = wordsOf(text).length
  const wires = parseCircuit(sop), byId = new Map(wires.map(w => [w.id, w]))
  const refsOf = w => w.slots.filter(s => s[1].startsWith('$')).map(([key, v]) => ({key, id: v.slice(1)}))
  // own words
  const owner = new Array(n).fill(null), ownFirst = new Map()
  for (const {wire, key, first, last} of check.placements) {
    for (let i = first; i <= last; i++) owner[i] = {wire, key}
    ownFirst.set(wire, Math.min(ownFirst.get(wire) ?? Infinity, first))
  }
  // holding tree, re-entrance resolved later by opening time
  const relCoord = new Map()
  for (const w of wires) if (w.type === 'syntax.coordination') for (const r of refsOf(w)) if (byId.get(r.id)?.type === 'syntax.relation') relCoord.set(r.id, w.id)
  const cands = new Map(wires.map(w => [w.id, []]))   // possible holders {parent, key}
  const pointers = []                                 // {from, key, to}
  for (const w of wires) for (const r of refsOf(w)) {
    if (w.type === 'syntax.relation' && r.key === 'from') {
      const k = relCoord.get(w.id)
      if (k) { if (!cands.get(k).some(c => c.parent === r.id)) cands.get(k).push({parent: r.id, key: 'rel'}); cands.get(w.id).push({parent: k, key: 'conjunct'}) }
      else cands.get(w.id).push({parent: r.id, key: 'rel'})
      continue
    }
    if (r.key === 'ellipsis') { pointers.push({from: w.id, key: 'ellipsis', to: r.id}); continue }
    if (w.type === 'syntax.coordination' && byId.get(r.id)?.type === 'syntax.relation') continue
    cands.get(r.id).push({parent: w.id, key: r.key})
  }
  for (const w of wires) if (w.type === 'syntax.coordination') { const froms = new Set(refsOf(w).filter(r => byId.get(r.id)?.type === 'syntax.relation').map(r => byId.get(r.id).slots.find(s => s[0] === 'from')[1])); if (froms.size > 1) throw new Fail('coordinated relations with different from') }
  // re-entrance: the holder is the candidate with the earliest own first word; the others become pointers
  const holder = new Map(), hkey = new Map()
  for (const w of wires) {
    const c = cands.get(w.id)
    if (!c.length) { holder.set(w.id, 'M'); hkey.set(w.id, 'top'); continue }
    const sorted = [...c].sort((a, b) => (ownFirst.get(a.parent) ?? 1e9) - (ownFirst.get(b.parent) ?? 1e9))
    holder.set(w.id, sorted[0].parent); hkey.set(w.id, sorted[0].key)
    for (const extra of sorted.slice(1)) pointers.push({from: extra.parent, key: extra.key, to: w.id})
  }
  const children = new Map([['M', []], ...wires.map(w => [w.id, []])])
  for (const w of wires) children.get(holder.get(w.id)).push(w.id)
  // cycle guard
  for (const w of wires) { let x = w.id, steps = 0; while (x !== 'M') { x = holder.get(x); if (++steps > 200) throw new Fail('holding cycle') } }
  const memo = new Map()
  const span = id => { if (memo.has(id)) return memo.get(id); let a = ownFirst.get(id) ?? Infinity, z = -Infinity
    for (const p of check.placements) if (p.wire === id) z = Math.max(z, p.last)
    for (const c of children.get(id)) { const [ca, cz] = span(c); a = Math.min(a, ca); z = Math.max(z, cz) }
    memo.set(id, [a, z]); return [a, z] }
  const depth = id => { let d = 0, x = id; while (x !== 'M') { x = holder.get(x); d++ } return d }
  const type = id => byId.get(id).type.slice(7)
  const firstConjunct = k => [...children.get(k)].sort((a, b) => span(a)[0] - span(b)[0])[0]
  const open = new Map()
  const lateOpen = id => { const t = type(id), own = ownFirst.get(id) ?? Infinity
    if (t === 'nominal') return own
    if (t === 'clause') return own < Infinity ? own : span(id)[1] + 1
    if (t === 'relation') { const to = children.get(id).find(c => hkey.get(c) === 'to'); return Math.min(own, to ? lateOpen(to) : Infinity) }
    const cs = [...children.get(id)].sort((a, b) => span(a)[0] - span(b)[0]); return Math.min(own, cs[1] ? span(cs[1])[0] : Infinity) }
  for (const w of wires) {
    const t = type(w.id), own = ownFirst.get(w.id) ?? Infinity
    if (t === 'nominal') open.set(w.id, own)
    else if (t === 'clause') open.set(w.id, own < Infinity ? own : span(w.id)[1] + 1)
    else if (t === 'relation') { const to = children.get(w.id).find(c => hkey.get(c) === 'to'); open.set(w.id, Math.min(own, to ? lateOpen(to) : Infinity)) }
    else { const cs = [...children.get(w.id)].sort((a, b) => span(a)[0] - span(b)[0]); open.set(w.id, Math.min(own, cs[1] ? span(cs[1])[0] : Infinity)) }
  }
  // the pilot's state
  const moves = [], rec = []
  let curP = -1
  const push = m => { moves.push(m); rec.push({m, p: curP, stack: stack.map(e => e.id === 'M' ? 'M' : type(e.id)), top: (stack.length ? stack[stack.length-1].id : null)}) }
  const stack = [{id: 'M', held: [], last: null}]
  const where = new Map()          // id -> {parent, key} as built
  const state = new Map()          // id -> 'open' | 'closed'
  const entry = id => stack.find(e => e.id === id)
  const top = () => stack[stack.length - 1]
  const close = () => {
    const e = stack.pop(), below = top()
    state.set(e.id, 'closed')
    if (e.held.length) throw new Fail('closed with held items (' + type(e.id) + ')')
    if (e.link.kind === 'child') { where.set(e.id, {parent: below.id, key: e.link.key}); below.last = e.id }
    else below.held.push(e.id)
    push(type(e.id) === 'clause' ? 'CLOSE form=' + byId.get(e.id).slots.find(s => s[0] === 'form')[1] : 'CLOSE')
  }
  const closeTo = id => { while (top().id !== id) { if (top().id === 'M') throw new Fail('close past M'); close() } }
  const onStack = id => stack.some(e => e.id === id)
  const ancestors = id => { const a = []; let x = holder.get(id); while (true) { a.push(x); if (x === 'M') break; x = holder.get(x) } return a }
  const wrapFirst = id => type(id) === 'clause' && !ownFirst.has(id) ? 0 : 1
  const opening = p => wires.filter(w => open.get(w.id) === p).map(w => w.id).sort((a, b) => wrapFirst(a) - wrapFirst(b) || depth(a) - depth(b) || span(a)[0] - span(b)[0])
  // re-entry: a closed wire (and the closed wires between it and an open one) goes back on the stack.
  // The pilot chooses it by cleanup over the closed stars below the open constellations.
  const reenter = target => {
    const chain = []; let x = target
    while (!onStack(x)) { const w = where.get(x); if (!w) throw new Fail('re-entry: a held or unplaced wire'); chain.unshift(x); x = w.parent }
    closeTo(x)
    const last = top().last === chain[0] && chain.length === 1
    for (const c of chain) { const w = where.get(c); const parent = entry(w.parent); if (parent.last === c) parent.last = null; where.delete(c); stack.push({id: c, held: [], last: null, link: {kind: 'child', key: w.key}}); state.set(c, 'open') }
    push(last ? 'REOPEN last' : 'REOPEN other'); if (chain.length > 1) push('REOPEN deep')
  }
  for (let p = 0; p <= n; p++) {
    curP = p
    for (const X of opening(p)) {
      if (state.has(X)) continue
      let h = holder.get(X)
      if (h !== 'M' && state.get(h) === 'closed') reenter(h)
      if (type(X) === 'coordination') { const F = firstConjunct(X); if (state.get(F) === 'closed' && where.get(F) && state.get(where.get(F).parent) === 'closed') reenter(where.get(F).parent) }
      const A = ancestors(X).find(a => onStack(a))
      if (!A) throw new Fail('no open ancestor')
      if (type(X) === 'coordination') { const F = firstConjunct(X); const wf = where.get(F); if (wf && onStack(wf.parent) && ancestors(X).includes(wf.parent)) closeTo(wf.parent); else closeTo(A) } else closeTo(A)
      // provisional link: a first conjunct takes its coordination's place until the coordination opens
      let eff = holder.get(X), key = hkey.get(X), cur = X
      while (eff !== top().id && !onStack(eff) && !state.has(eff) && type(eff) === 'coordination' && firstConjunct(eff) === cur) { key = hkey.get(eff); cur = eff; eff = holder.get(eff) }
      const link = eff === top().id ? {kind: 'child', key} : {kind: 'held'}
      const e = {id: X, held: [], last: null, link}
      if (type(X) === 'coordination') {
        const F = firstConjunct(X), Ae = top()
        if (where.get(F)?.parent === Ae.id && state.get(F) === 'closed') { e.link = {kind: 'child', key: where.get(F).key}; push(Ae.last === F ? 'COORD last child' : 'COORD other child'); if (Ae.last === F) Ae.last = null; where.set(F, {parent: X, key: 'conjunct'}) }
        else if (stack.some(E => E.held.includes(F))) { const E = [...stack].reverse().find(E => E.held.includes(F)); E.held.splice(E.held.indexOf(F), 1); e.link = {kind: 'held'}; where.set(F, {parent: X, key: 'conjunct'}); push('COORD held') }
        else throw new Fail('coordination: first conjunct not found')
        if (e.link.kind === 'child' && holder.get(X) !== Ae.id) e.link = {kind: 'held'}
      } else push(`OPEN ${type(X)}@${link.kind === 'child' ? key : 'held'}`)
      // claims from the held list of the current constellation
      const Ae = top()
      for (const E of [...stack].reverse()) for (const item of [...E.held]) if (holder.get(item) === X) { E.held.splice(E.held.indexOf(item), 1); where.set(item, {parent: X, key: hkey.get(item)}); push('CLAIM ' + hkey.get(item)) }
      stack.push(e); state.set(X, 'open')
      for (const ptr of pointers.filter(q => q.from === X)) { if (!state.has(ptr.to) && ptr.to !== X) throw new Fail('pointer to a later wire (' + ptr.key + ')'); push('POINT ' + ptr.key) }
    }
    if (p === n) break
    const {wire: w, key} = owner[p]
    if (!onStack(w)) { if (state.get(w) === 'closed') reenter(w); else throw new Fail('owner not open') }
    closeTo(w)
    push('PLACE ' + key)
  }
  while (top().id !== 'M') close()
  if (top().held.length) throw new Fail('held items never claimed')
  // pointers whose target opened later than the pointing wire (checked again at the end)
  for (const ptr of pointers) if (!state.has(ptr.to)) throw new Fail('pointer target missing')
  // compare the built tree with the holding tree
  for (const w of wires) { const b = where.get(w.id); if (!b) throw new Fail('wire not placed'); if (b.parent !== holder.get(w.id) || b.key !== hkey.get(w.id)) throw new Fail('built elsewhere (' + type(w.id) + ' ' + hkey.get(w.id) + ' -> ' + b.key + ')') }
  // write the circuit from what was built (spans from the PLACE moves, refs from `where`, atoms copied)
  const built = wires.map(w => ({id: w.id, type: w.type, slots: []}))
  const B = new Map(built.map(x => [x.id, x]))
  for (let i = 0; i < n; i++) { const {wire, key} = owner[i]; const slots = B.get(wire).slots; const last = slots.at(-1)
    if (last?.span && last.key === key && last.span[1] === i - 1 && !['dependent', 'modifier', 'auxiliary', 'negation', 'discourse'].includes(key)) last.span[1] = i
    else slots.push({key, span: [i, i]}) }
  for (const w of wires) for (const [k, v] of w.slots) if (!v.startsWith('"') && !v.startsWith('$')) B.get(w.id).slots.push({key: k, value: v})
  for (const w of wires) { const b = where.get(w.id); if (b.parent === 'M') continue
    const t = type(w.id)
    if (t === 'relation' && b.key === 'rel') B.get(w.id).slots.unshift({key: 'from', ref: b.parent})
    else if (t === 'relation' && b.key === 'conjunct') { B.get(b.parent).slots.push({key: 'conjunct', ref: w.id}); B.get(w.id).slots.unshift({key: 'from', ref: where.get(b.parent).parent}) }
    else if (b.key === 'rel') { /* coordination of relations held by from: nothing to write */ }
    else B.get(b.parent).slots.push({key: b.key, ref: w.id}) }
  for (const ptr of pointers) B.get(ptr.from).slots.push({key: ptr.key, ref: ptr.to})
  const out = writeCircuit(text, built)
  return {moves, rec, out, same: coreOf(text, out) === coreOf(text, sop), n, wires: wires.length, info: {wires, byId, ownFirst: Object.fromEntries(ownFirst), open: Object.fromEntries(open), holder: Object.fromEntries(holder), hkey: Object.fromEntries(hkey), children: Object.fromEntries(children), placements: check.placements, pointers}}
}

if (false) {
  const fails = {}, moveHist = {}, perWord = {}
  let total = 0, ok = 0, same = 0, steps = 0, words = 0
  const failEx = {}
  for (const [text, row] of readLabels()) {
    if (bench.has(norm(text))) continue
    total++
    try {
      const r = derive(text, row.label)
      ok++; if (r.same) same++; else { hist(fails, 'core differs'); (failEx['core differs'] ??= []).length < 3 && failEx['core differs'].push({text, sop: row.label}) }
      steps += r.moves.length; words += r.n
      for (const m of r.moves) hist(moveHist, m.replace(/ form=.*/u, ' (clause)'))
      hist(perWord, Math.min(Math.round(r.moves.length / r.n * 2) / 2, 5))
    } catch (error) {
      const k = error instanceof Fail ? error.message : 'error: ' + error.message
      hist(fails, k); const a = failEx[k] ??= []; if (a.length < 3) a.push({text, sop: row.label})
    }
  }
  console.log('labels', total, 'derived', ok, (100 * ok / total).toFixed(2) + '%', 'same core after writing', same, (100 * same / total).toFixed(2) + '%')
  console.log('moves per word', (steps / words).toFixed(2))
  console.log('failures', JSON.stringify(Object.entries(fails).sort((a, b) => b[1] - a[1])))
  console.log('moves', JSON.stringify(Object.entries(moveHist).sort((a, b) => b[1] - a[1])))
  writeFileSync(new URL('./oracle-fail-examples.json', import.meta.url), JSON.stringify(failEx, null, 1))
}
