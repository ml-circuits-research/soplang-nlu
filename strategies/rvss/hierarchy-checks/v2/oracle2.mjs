// rvss design check (read-only on the data): the pilot's moves derived from each label by a static oracle,
// recorded WITH their arguments (which star is claimed, gathered, reopened, pointed at), then REPLAYED
// without the label by an executor that only sees the words and the moves; the replayed circuit is written
// with writeCircuit and its core compared with the label's.
//
// Two sets of opening conventions:
//   base (as ../oracle.mjs): relation opens at min(first own word, start of its `to`); coordination at
//        min(first own word, start of conjunct 2), taking only its FIRST conjunct; claims only from the held
//        list of the constellation it opens in.
//   late ("decide late, move the stars"): every wire opens at its own evidence:
//        nominal / clause at its first own word (a verbless fragment wraps at the token after its words);
//        relation at its first own word (marker or negation), else (no marker) at the opener of its `to`;
//        coordination at its first own word (the conjunction), else at the token after its last conjunct.
//        Before a coordination opens, every conjunct takes the coordination's place (key) in its holder;
//        COORD then gathers all conjuncts already built (closed siblings or held items) and moves them in.
//        A relation that opens after its `to` claims it like any held item. Claims come from any held list
//        on the stack.
// Moves (with arguments; h = the star's index in the atlas, in opening order):
//   {op:'open', t, at: key|'held', h}  {op:'coord', h, at, gather:[h...]}  {op:'claim', item:h, key}
//   {op:'place', key}  {op:'close', atoms:[[key, value]...]}  {op:'reopen', chain:[h...]}  {op:'point', key, target:h}
import {writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {parseCircuit, validateSyntax, coreOf, writeCircuit, wordsOf} = await import(root + 'lib/syntax.mjs')

export class Fail extends Error {}
const NOJOIN = ['dependent', 'modifier', 'auxiliary', 'negation', 'discourse']

export function derive(text, sop, {late = true} = {}) {
  const claimStack = late
  const check = validateSyntax(text, sop)
  if (!check.valid) throw new Fail('invalid')
  const n = wordsOf(text).length
  const wires = parseCircuit(sop), byId = new Map(wires.map(w => [w.id, w]))
  const refsOf = w => w.slots.filter(s => s[1].startsWith('$')).map(([key, v]) => ({key, id: v.slice(1)}))
  const owner = new Array(n).fill(null), ownFirst = new Map()
  for (const {wire, key, first, last} of check.placements) {
    for (let i = first; i <= last; i++) owner[i] = {wire, key}
    ownFirst.set(wire, Math.min(ownFirst.get(wire) ?? Infinity, first))
  }
  // holding tree (as ../oracle.mjs)
  const relCoord = new Map()
  for (const w of wires) if (w.type === 'syntax.coordination') for (const r of refsOf(w)) if (byId.get(r.id)?.type === 'syntax.relation') relCoord.set(r.id, w.id)
  const cands = new Map(wires.map(w => [w.id, []])), pointers = []
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
  for (const w of wires) { let x = w.id, steps = 0; while (x !== 'M') { x = holder.get(x); if (++steps > 200) throw new Fail('holding cycle') } }
  const memo = new Map()
  const span = id => { if (memo.has(id)) return memo.get(id); let a = ownFirst.get(id) ?? Infinity, z = -Infinity
    for (const p of check.placements) if (p.wire === id) z = Math.max(z, p.last)
    for (const c of children.get(id)) { const [ca, cz] = span(c); a = Math.min(a, ca); z = Math.max(z, cz) }
    memo.set(id, [a, z]); return [a, z] }
  const depth = id => { let d = 0, x = id; while (x !== 'M') { x = holder.get(x); d++ } return d }
  const type = id => byId.get(id).type.slice(7)
  const firstConjunct = k => [...children.get(k)].sort((a, b) => span(a)[0] - span(b)[0])[0]
  const conjunctsOf = k => children.get(k).filter(c => hkey.get(c) === 'conjunct').sort((a, b) => span(a)[0] - span(b)[0])
  // opening times
  const lateOpen = id => { const t = type(id), own = ownFirst.get(id) ?? Infinity
    if (t === 'nominal') return own
    if (t === 'clause') return own < Infinity ? own : span(id)[1] + 1
    if (t === 'relation') { if (own < Infinity) return own; const to = children.get(id).find(c => hkey.get(c) === 'to'); return to ? firstEvidence(to) : Infinity }
    return own < Infinity ? own : span(id)[1] + 1 }
  // a relation without marker opens at the first own word of its `to` (a clause: its verb or first own word;
  // a coordination or a verbless fragment: the first own word of its first part)
  const firstEvidence = id => { const t = type(id)
    if ((t === 'nominal' || t === 'clause') && ownFirst.has(id)) return ownFirst.get(id)
    const cs = [...children.get(id)].sort((a, b) => span(a)[0] - span(b)[0])
    return cs.length ? firstEvidence(cs[0]) : lateOpen(id) }
  const baseOpen = id => { const t = type(id), own = ownFirst.get(id) ?? Infinity
    if (t === 'nominal') return own
    if (t === 'clause') return own < Infinity ? own : span(id)[1] + 1
    if (t === 'relation') { const to = children.get(id).find(c => hkey.get(c) === 'to'); return Math.min(own, to ? span(to)[0] : Infinity) }
    const cs = [...children.get(id)].sort((a, b) => span(a)[0] - span(b)[0]); return Math.min(own, cs[1] ? span(cs[1])[0] : Infinity) }
  const open = new Map(wires.map(w => [w.id, late ? lateOpen(w.id) : baseOpen(w.id)]))
  const isWrap = id => !ownFirst.has(id) && (type(id) === 'clause' || (late && type(id) === 'coordination'))
  // the pilot's state
  const moves = [], handle = new Map([['M', 'M']]), openAt = new Map(), claimedAt = new Map(), heldWithAlt = new Map()
  const stack = [{id: 'M', held: [], last: null}]
  const where = new Map(), state = new Map()
  let curP = -1
  const entry = id => stack.find(e => e.id === id)
  const top = () => stack[stack.length - 1]
  const onStack = id => stack.some(e => e.id === id)
  const atomsOf = id => byId.get(id).slots.filter(([, v]) => !v.startsWith('"') && !v.startsWith('$'))
  const close = () => {
    const e = stack.pop(), below = top()
    state.set(e.id, 'closed')
    if (e.held.length) throw new Fail('closed with held items (' + type(e.id) + ')')
    if (e.link.kind === 'child') { where.set(e.id, {parent: below.id, key: e.link.key}); below.last = e.id }
    else below.held.push(e.id)
    moves.push({op: 'close', atoms: atomsOf(e.id)})
  }
  const closeTo = id => { while (top().id !== id) { if (top().id === 'M') throw new Fail('close past M'); close() } }
  const ancestors = id => { const a = []; let x = holder.get(id); while (true) { a.push(x); if (x === 'M') break; x = holder.get(x) } return a }
  const opening = p => wires.filter(w => open.get(w.id) === p).map(w => w.id).sort((a, b) => {
    const wa = isWrap(a) ? 0 : 1, wb = isWrap(b) ? 0 : 1
    if (wa !== wb) return wa - wb
    if (wa === 0) return depth(b) - depth(a) || span(a)[0] - span(b)[0]      // nested wraps: the inner one first
    return depth(a) - depth(b) || span(a)[0] - span(b)[0] })
  const reenter = target => {
    const chain = []; let x = target
    while (!onStack(x)) { const w = where.get(x); if (!w) throw new Fail('re-entry: a held or unplaced wire'); chain.unshift(x); x = w.parent }
    closeTo(x)
    for (const c of chain) { const w = where.get(c); const parent = entry(w.parent); if (parent.last === c) parent.last = null; where.delete(c); stack.push({id: c, held: [], last: null, link: {kind: 'child', key: w.key}}); state.set(c, 'open') }
    moves.push({op: 'reopen', chain: chain.map(c => handle.get(c))})
  }
  const provisional = X => {     // the link of a new constellation: a conjunct of a coordination not yet open takes its place
    let eff = holder.get(X), key = hkey.get(X), cur = X
    while (eff !== top().id && !onStack(eff) && !state.has(eff) && type(eff) === 'coordination' && (late ? hkey.get(cur) === 'conjunct' : firstConjunct(eff) === cur)) { key = hkey.get(eff); cur = eff; eff = holder.get(eff) }
    return eff === top().id ? {kind: 'child', key} : {kind: 'held'}
  }
  const effHolder = X => { let eff = holder.get(X), cur = X
    while (eff !== 'M' && !onStack(eff) && !state.has(eff) && type(eff) === 'coordination' && hkey.get(cur) === 'conjunct') { cur = eff; eff = holder.get(eff) }
    return eff }
  const homeOf = C =>state.get(C) === 'open' ? stack[stack.findIndex(e => e.id === C) - 1].id : (where.get(C)?.parent ?? stack.find(E => E.held.includes(C))?.id)
  for (let p = 0; p <= n; p++) {
    curP = p
    for (const X of opening(p)) {
      if (state.has(X)) continue
      const h = late ? effHolder(X) : holder.get(X)      // late: the place the new constellation will really take
      if (h !== 'M' && state.get(h) === 'closed') reenter(h)
      let gathered = []
      if (type(X) === 'coordination' && late) {
        const built = conjunctsOf(X).filter(c => state.has(c))
        const A = ancestors(X).find(a => onStack(a)); if (!A) throw new Fail('no open ancestor'); closeTo(A)
        for (const C of built) {
          if (state.get(C) !== 'closed') throw new Fail('coordination: conjunct still open')
          const w = where.get(C)
          if (w) { const P = entry(w.parent); if (!P) throw new Fail('coordination: conjunct buried'); if (P.last === C) P.last = null }
          else { const E = stack.find(E => E.held.includes(C)); if (!E) throw new Fail('coordination: conjunct not found'); E.held.splice(E.held.indexOf(C), 1) }
          where.set(C, {parent: X, key: 'conjunct'}); gathered.push(C)
        }
      } else if (type(X) === 'coordination') {
        const F = firstConjunct(X); if (state.get(F) === 'closed' && where.get(F) && state.get(where.get(F).parent) === 'closed') reenter(where.get(F).parent)
        const A = ancestors(X).find(a => onStack(a)); if (!A) throw new Fail('no open ancestor')
        const wf = where.get(F); if (wf && onStack(wf.parent) && ancestors(X).includes(wf.parent)) closeTo(wf.parent); else closeTo(A)
      } else { const A = ancestors(X).find(a => onStack(a)); if (!A) throw new Fail('no open ancestor'); closeTo(A) }
      let link = provisional(X)
      if (type(X) === 'coordination' && !late) {
        const F = firstConjunct(X), Ae = top()
        if (where.get(F)?.parent === Ae.id && state.get(F) === 'closed') { link = {kind: 'child', key: where.get(F).key}; if (Ae.last === F) Ae.last = null; where.set(F, {parent: X, key: 'conjunct'}); gathered = [F] }
        else if (Ae.held.includes(F)) { Ae.held.splice(Ae.held.indexOf(F), 1); link = {kind: 'held'}; where.set(F, {parent: X, key: 'conjunct'}); gathered = [F] }
        else throw new Fail('coordination: first conjunct not found')
        if (link.kind === 'child' && holder.get(X) !== Ae.id) link = {kind: 'held'}
      }
      const below = top()
      if (link.kind === 'held' && stack.some(E => E.id !== 'M')) heldWithAlt.set(X, p)
      handle.set(X, handle.size - 1); openAt.set(X, p)
      const e = {id: X, held: [], last: null, link}
      stack.push(e); state.set(X, 'open')
      if (type(X) === 'coordination') moves.push({op: 'coord', h: handle.get(X), at: link.kind === 'child' ? link.key : 'held', gather: gathered.map(c => handle.get(c))})
      else moves.push({op: 'open', t: type(X), at: link.kind === 'child' ? link.key : 'held', h: handle.get(X)})
      for (const E of claimStack ? [...stack].reverse() : [below]) for (const item of [...E.held]) if (holder.get(item) === X) {
        E.held.splice(E.held.indexOf(item), 1); where.set(item, {parent: X, key: hkey.get(item)}); claimedAt.set(item, p)
        moves.push({op: 'claim', item: handle.get(item), key: hkey.get(item)}) }
      for (const ptr of pointers.filter(q => q.from === X)) { if (!state.has(ptr.to) && ptr.to !== X) throw new Fail('pointer to a later wire (' + ptr.key + ')'); moves.push({op: 'point', key: ptr.key, target: handle.get(ptr.to)}) }
    }
    if (p === n) break
    const {wire: w, key} = owner[p]
    if (!onStack(w)) { if (state.get(w) === 'closed') reenter(w); else throw new Fail('owner not open') }
    closeTo(w)
    moves.push({op: 'place', key})
  }
  while (top().id !== 'M') close()
  if (top().held.length) throw new Fail('held items never claimed')
  for (const ptr of pointers) if (!state.has(ptr.to)) throw new Fail('pointer target missing')
  for (const w of wires) { const b = where.get(w.id); if (!b) throw new Fail('wire not placed'); if (b.parent !== holder.get(w.id) || b.key !== hkey.get(w.id)) throw new Fail('built elsewhere (' + type(w.id) + ' ' + hkey.get(w.id) + ' -> ' + b.key + ')') }
  // lookahead of every opening decision: its evidence minus the position where it is taken
  const evid = id => { const t = type(id); if (ownFirst.has(id)) return ownFirst.get(id)
    if (t === 'clause') return span(id)[1] + 1
    if (t === 'relation') { const to = children.get(id).find(c => hkey.get(c) === 'to'); return to ? firstEvidence(to) : openAt.get(id) }   // no marker: the first own word of its `to`
    const cs = conjunctsOf(id); return cs[1] ? evid(cs[1]) : openAt.get(id) }
  const look = []
  for (const w of wires) {
    const t = type(w.id), L = Math.max(0, evid(w.id) - openAt.get(w.id))
    let label = t
    if (t === 'relation') label += ownFirst.has(w.id) ? ' with marker' : ' without marker'
    if (t === 'coordination') label += ownFirst.has(w.id) ? ' with conjunction' : ' without conjunction'
    if (t === 'clause' && !ownFirst.has(w.id)) label += ' (wraps)'
    look.push({label, L})
  }
  const aside = [...heldWithAlt].map(([id, p]) => ({type: type(id), L: (claimedAt.get(id) ?? openAt.get(where.get(id)?.parent) ?? p) - p}))
  return {moves, n, look, aside}
}

// The executor: words + moves -> circuit, without the label.
export function replay(text, moves) {
  const n = wordsOf(text).length
  const nodes = new Map(), children = new Map([['M', []]]), stack = [{h: 'M', held: []}]
  let p = 0
  const top = () => stack[stack.length - 1]
  const detach = h => { const nd = nodes.get(h)
    if (nd.parent !== null) { const a = children.get(nd.parent); a.splice(a.indexOf(h), 1); nd.parent = null; nd.key = null; return }
    for (const E of stack) { const i = E.held.indexOf(h); if (i >= 0) { E.held.splice(i, 1); return } }
    throw new Error('replay: star ' + h + ' not found') }
  const attach = (h, parent, key) => { const nd = nodes.get(h); nd.parent = parent; nd.key = key; children.get(parent).push(h) }
  const newNode = (h, t, at) => { nodes.set(h, {type: t, words: [], atoms: [], refs: [], parent: null, key: null}); children.set(h, []); stack.push({h, held: [], at}) }
  for (const m of moves) {
    if (m.op === 'open') newNode(m.h, m.t, m.at)
    else if (m.op === 'coord') { newNode(m.h, 'coordination', m.at); for (const g of m.gather) { detach(g); attach(g, m.h, 'conjunct') } }
    else if (m.op === 'claim') { detach(m.item); attach(m.item, top().h, m.key) }
    else if (m.op === 'place') nodes.get(top().h).words.push([p++, m.key])
    else if (m.op === 'close') { const e = stack.pop(); if (e.held.length) throw new Error('replay: closed with held items'); nodes.get(e.h).atoms = m.atoms
      if (e.at === 'held') top().held.push(e.h); else attach(e.h, top().h, e.at) }
    else if (m.op === 'reopen') for (const h of m.chain) { const key = nodes.get(h).key; detach(h); stack.push({h, held: [], at: key}) }
    else if (m.op === 'point') nodes.get(top().h).refs.push([m.key, m.target])
  }
  if (stack.length !== 1 || top().held.length || p !== n) throw new Error('replay: unfinished')
  const id = h => 'x' + h
  const built = [...nodes].map(([h, nd]) => ({id: id(h), type: 'syntax.' + nd.type, slots: []}))
  const B = new Map(built.map(b => [b.id, b]))
  for (const [h, nd] of nodes) {
    const slots = B.get(id(h)).slots
    for (const [i, key] of nd.words) { const last = slots.at(-1)
      if (last?.span && last.key === key && last.span[1] === i - 1 && !NOJOIN.includes(key)) last.span[1] = i   // the join rule (declared, not VSA)
      else slots.push({key, span: [i, i]}) }
    for (const [k, v] of nd.atoms) slots.push({key: k, value: v})
  }
  for (const [h, nd] of nodes) { if (nd.parent === 'M') continue
    if (nd.type === 'relation' && nd.key === 'rel') B.get(id(h)).slots.unshift({key: 'from', ref: id(nd.parent)})
    else if (nd.type === 'relation' && nd.key === 'conjunct') { B.get(id(nd.parent)).slots.push({key: 'conjunct', ref: id(h)}); B.get(id(h)).slots.unshift({key: 'from', ref: id(nodes.get(nd.parent).parent)}) }
    else if (nd.key === 'rel') { /* a coordination of relations held by their common from: nothing to write */ }
    else B.get(id(nd.parent)).slots.push({key: nd.key, ref: id(h)}) }
  for (const [h, nd] of nodes) for (const [k, t] of nd.refs) B.get(id(h)).slots.push({key: k, ref: id(t)})
  return writeCircuit(text, built)
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
  const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
  const labels = readLabels(process.env.SYNTACTIC_DIR || undefined)
  const hist = (h, k, v = 1) => { h[k] = (h[k] ?? 0) + v }
  const bucket = L => L <= 0 ? '0' : L <= 3 ? String(L) : L <= 6 ? '4-6' : '7+'
  const R = {}, ex = {}
  for (const [text, row] of labels) {
    if (bench.has(norm(text))) continue
    const acc = (row.accepted_by || '?').split(/[ ,;:]/)[0], file = labels.files.get(text)
    for (const late of [false, true]) {
      const k = late ? 'late' : 'base'
      const r = R[k] ??= {labels: 0, derived: 0, replayed: 0, moves: 0, words: 0, fail: {}, failBy: {}, look: {}, lookAll: {}, aside: {}, ops: {}, need: {}, short12: 0, failFiles: {}}
      r.labels++
      let d
      try { d = derive(text, row.label, {late}) } catch (e) {
        const why = e instanceof Fail ? e.message : 'error: ' + e.message
        hist(r.fail, why); hist(r.failBy, acc); hist(r.failFiles, file.split('/')[0] + '/' + file.split('/')[1]?.replace(/-\d.*$/u, ''))
        const a = (ex[k] ??= {})[why] ??= []; if (a.length < 4) a.push({text, sop: row.label, accepted_by: acc, file}); continue }
      r.derived++; r.moves += d.moves.length; r.words += d.n
      let out = null
      try { out = replay(text, d.moves) } catch (e) { hist(r.fail, 'replay: ' + e.message) }
      if (out !== null && coreOf(text, out) === coreOf(text, row.label)) r.replayed++
      else if (out !== null) { hist(r.fail, 'replay: core differs'); const a = (ex[k] ??= {})['replay differs'] ??= []; if (a.length < 4) a.push({text, sop: row.label, out}) }
      for (const {label, L} of d.look) { hist(r.look, label + ' | ' + bucket(L)); hist(r.lookAll, bucket(L)) }
      for (const {type, L} of d.aside) hist(r.aside, type + ' | ' + bucket(L))
      const seen = new Set()
      for (const m of d.moves) { const name = m.op === 'open' ? 'open ' + m.t + '@' + (m.at === 'held' ? 'held' : m.at) : m.op === 'coord' ? 'coord gather ' + Math.min(m.gather.length, 3) + (m.gather.length >= 3 ? '+' : '') : m.op === 'claim' ? 'claim ' + m.key : m.op === 'point' ? 'point ' + m.key : m.op === 'reopen' ? 'reopen chain ' + Math.min(m.chain.length, 2) + (m.chain.length >= 2 ? '+' : '') : m.op === 'place' ? 'place ' + m.key : 'close'
        hist(r.ops, name); seen.add(name.replace(/ (subject|complement|rel|to|conjunct|ellipsis|top|head|dependent|verb|marker|modifier|discourse|auxiliary|conjunction|negation)$/u, '')) }
      for (const s of seen) hist(r.need, s)
      if (d.n <= 12) r.short12++
    }
  }
  const sorted = h => Object.fromEntries(Object.entries(h).sort((a, b) => b[1] - a[1]))
  for (const [k, r] of Object.entries(R)) {
    console.log(`== ${k}: labels ${r.labels}, derived ${r.derived} (${(100 * r.derived / r.labels).toFixed(2)}%), replayed without the label to the identical core ${r.replayed} (${(100 * r.replayed / r.labels).toFixed(2)}%), moves per word ${(r.moves / r.words).toFixed(2)}, derived with <= 12 words ${r.short12}`)
    console.log('failures', JSON.stringify(sorted(r.fail)))
    console.log('failures by accepted_by', JSON.stringify(sorted(r.failBy)))
    console.log('failures by folder/file stem', JSON.stringify(sorted(r.failFiles)))
    console.log('opening lookahead, all wires (words after the decision until its evidence)', JSON.stringify(r.lookAll))
    console.log('opening lookahead by wire', JSON.stringify(Object.fromEntries(Object.entries(r.look).filter(([key]) => !key.endsWith('| 0')).sort((a, b) => b[1] - a[1]))))
    console.log('aside decisions taken while another constellation was open: words until the claim', JSON.stringify(sorted(r.aside)))
    console.log('moves', JSON.stringify(sorted(r.ops)))
    console.log('messages needing each move', JSON.stringify(sorted(r.need)))
  }
  writeFileSync(process.env.EX_OUT || new URL('./oracle2-examples.json', import.meta.url), JSON.stringify(ex, null, 1))
}
