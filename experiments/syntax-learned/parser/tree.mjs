// A syntax circuit as a labelled dependency tree over the words of the message, and back.
// Plain JavaScript, no dependencies beyond lib/syntax.mjs of soplang-nlu (wordsOf, validateSyntax,
// writeCircuit), which the strategy already ships with.
//
// Every word gets one head (another word, or -1 for the root) and one label.
//   Word labels (the word fills a key of the wire anchored at its head):
//     dep   dependent of a nominal          cont  continuation of the head or verb run
//     aux, neg, mod, disc                   keys of a clause
//     mark  marker of the relation whose end is anchored at the head
//     rneg  negation of that relation       cc    conjunction of the coordination of the head
//   Anchor labels "<attach>:<tag>" (the word anchors one or more wires):
//     attach: root | subj | comp | relC | relC~amb | relN | conj | conjR
//       relC / relN: the outer wire of this word is the end of a relation that starts at the
//       clause / the nominal anchored at the head; ~amb adds attachment=ambiguous.
//       conj: a further conjunct of the coordination anchored at the head.
//       conjR: the relation ending here is a further conjunct of a coordination of relations,
//       with the relation ending at the head.
//     tag: ''                   a nominal headed by this word
//          imp|decl|inter|nonfin  a clause whose verb is this word
//          frag.N | frag.S       a fragment whose (first) complement | subject is the nominal headed here
//          frag.R                a fragment with a relation (no complement) ending at the nominal headed here
//          frag.mod|disc|neg|aux a fragment whose first own word is this word
//          ...^ell               the fragment shares the verb of the first conjunct (or of its head clause)
import {wordsOf, validateSyntax, parseCircuit, writeCircuit} from '/home/salboaie/work/sopworlds/soplang-nlu/lib/syntax.mjs'

const FORM = {imperative: 'imp', declarative: 'decl', interrogative: 'inter', nonfinite: 'nonfin'}
const FORM_BACK = Object.fromEntries(Object.entries(FORM).map(([k, v]) => [v, k]))
export const WORD_LABELS = new Set(['dep', 'cont', 'aux', 'neg', 'mod', 'disc', 'mark', 'rneg', 'cc'])
const CLAUSE_WORD_KEYS = ['auxiliary', 'negation', 'modifier', 'discourse']
const KEY_LABEL = {auxiliary: 'aux', negation: 'neg', modifier: 'mod', discourse: 'disc'}
const LABEL_KEY = {aux: 'auxiliary', neg: 'negation', mod: 'modifier', disc: 'discourse'}

/** @returns {words, heads, labels} or {error} */
export function circuitToTree(text, sop) {
  const check = validateSyntax(text, sop)
  if (!check.valid) return {error: 'invalid'}
  const words = wordsOf(text), n = words.length
  const wires = parseCircuit(sop), byId = new Map()
  for (const wire of wires) byId.set(wire.id, {...wire, spans: {}, refs: {}, atoms: {}, incoming: []})
  for (const {wire, key, first, last} of check.placements) (byId.get(wire).spans[key] ??= []).push([first, last])
  for (const wire of byId.values()) for (const [key, raw] of wire.slots) {
    if (raw.startsWith('$')) { (wire.refs[key] ??= []).push(raw.slice(1)); byId.get(raw.slice(1)).incoming.push({from: wire.id, key}) }
    else if (!raw.startsWith('"')) wire.atoms[key] = raw
  }
  const W = id => byId.get(id)
  const anchorMemo = new Map()
  // the word that stands for a wire
  const anchorOf = (id, depth = 0) => {
    if (anchorMemo.has(id)) return anchorMemo.get(id)
    if (depth > 8) throw new Error('cycle')
    const w = W(id)
    let a = null, role = null
    if (w.type === 'syntax.nominal') a = w.spans.head?.[0]?.[0] ?? null
    else if (w.type === 'syntax.clause') {
      if (w.spans.verb) a = w.spans.verb[0][0]
      else {
        const comps = (w.refs.complement ?? []).map(r => anchorOf(r, depth + 1)).filter(x => x !== null)
        if (comps.length) { a = Math.min(...comps); role = 'N' }
        else if (w.refs.subject) { a = anchorOf(w.refs.subject[0], depth + 1); role = 'S' }
        else {
          const own = CLAUSE_WORD_KEYS.flatMap(key => (w.spans[key] ?? []).map(span => [span[0], key]))
          if (own.length) { own.sort((x, y) => x[0] - y[0]); a = own[0][0]; role = KEY_LABEL[own[0][1]] }
          else {
            const rels = w.incoming.filter(inc => W(inc.from).type === 'syntax.relation' && W(inc.from).refs.from?.[0] === id).map(inc => anchorOf(W(inc.from).refs.to[0], depth + 1))
            if (rels.length) { a = Math.min(...rels); role = 'R' }
          }
        }
      }
    } else if (w.type === 'syntax.coordination') {
      const cs = (w.refs.conjunct ?? []).map(r => W(r).type === 'syntax.relation' ? anchorOf(W(r).refs.to[0], depth + 1) : anchorOf(r, depth + 1))
      a = Math.min(...cs)
    } else return null
    anchorMemo.set(id, a); if (role) w.role = role
    return a
  }
  for (const id of byId.keys()) anchorOf(id)
  const heads = new Array(n).fill(null), labels = new Array(n).fill(null)
  const errors = []
  const setArc = (word, head, label, why) => {
    if (word === null || word === undefined) { errors.push('no-anchor ' + why); return }
    if (heads[word] !== null) { if (heads[word] !== head || labels[word] !== label) errors.push('double ' + why); return }
    heads[word] = head; labels[word] = label
  }
  // which wires are anchored at each word, outermost first
  const at = new Map()
  for (const [id, w] of byId) { if (w.type === 'syntax.relation') continue; const a = anchorMemo.get(id); if (a === null) continue; (at.get(a) ?? at.set(a, []).get(a)).push(id) }
  const rank = id => { const w = W(id); return w.type === 'syntax.clause' ? (w.spans.verb ? 1 : 0) : w.type === 'syntax.coordination' ? (W(w.refs.conjunct[0]).type === 'syntax.clause' ? 0.5 : 2) : 3 }
  // the tag of a word: the clause or nominal anchored there
  const tagOf = a => {
    const ids = at.get(a) ?? []
    const clause = ids.map(W).find(w => w.type === 'syntax.clause')
    if (!clause) return ''
    if (clause.spans.verb) return FORM[clause.atoms.form] ?? 'imp'
    return 'frag.' + (clause.role ?? 'N') + (clause.refs.ellipsis ? '^ell' : '')
  }
  // the outermost wire anchored at a word
  const outerAt = a => [...(at.get(a) ?? [])].sort((x, y) => rank(x) - rank(y))[0]
  // word labels
  for (const [id, w] of byId) {
    const a = anchorMemo.get(id)
    if (w.type === 'syntax.nominal') {
      const [hs, he] = w.spans.head[0]
      for (let k = hs + 1; k <= he; k++) setArc(k, a, 'cont', 'head')
      for (const [s, e] of w.spans.dependent ?? []) for (let k = s; k <= e; k++) setArc(k, a, 'dep', 'dep')
      if ((w.spans.head?.length ?? 0) > 1) errors.push('two-heads')
    } else if (w.type === 'syntax.clause') {
      if (w.spans.verb) { const [vs, ve] = w.spans.verb[0]; for (let k = vs + 1; k <= ve; k++) setArc(k, a, 'cont', 'verb') }
      for (const key of CLAUSE_WORD_KEYS) for (const [s, e] of w.spans[key] ?? []) for (let k = s; k <= e; k++) if (k !== a || w.spans.verb || w.role !== KEY_LABEL[key]) setArc(k, a, KEY_LABEL[key], key)
    } else if (w.type === 'syntax.relation') {
      const to = anchorMemo.get(w.refs.to[0])
      for (const [s, e] of w.spans.marker ?? []) for (let k = s; k <= e; k++) setArc(k, to, 'mark', 'marker')
      for (const [s, e] of w.spans.negation ?? []) for (let k = s; k <= e; k++) setArc(k, to, 'rneg', 'rneg')
    } else if (w.type === 'syntax.coordination') {
      const anchors = (w.refs.conjunct ?? []).map(r => W(r).type === 'syntax.relation' ? anchorMemo.get(W(r).refs.to[0]) : anchorMemo.get(r)).sort((x, y) => x - y)
      for (const [s, e] of w.spans.conjunction ?? []) for (let k = s; k <= e; k++) setArc(k, anchors.find(x => x > k) ?? anchors.filter(x => x < k).at(-1), 'cc', 'cc')
    }
  }
  // anchor arcs: each wire's tie to its parent, carried by the outermost wire of its anchor
  const tieOf = new Map()   // wire id -> {head, attach}
  const tie = (id, head, attach) => {
    if (!tieOf.has(id)) { tieOf.set(id, {head, attach}); return }
    // "let us put": the complement of one clause is the subject of the clause it relates to
    const t = tieOf.get(id)
    const pair = [t, {head, attach}]
    const comp = pair.find(x => x.attach === 'comp'), subj = pair.find(x => x.attach === 'subj')
    if (comp && subj && heads.length && relatesTo(subj.head, comp.head)) { tieOf.set(id, {head: comp.head, attach: 'comp^subj'}); return }
    errors.push('two-parents')
  }
  // the clause anchored at `inner` is the end of a relation without marker from the clause anchored at `outer`
  const relatesTo = (inner, outerA) => [...byId.values()].some(w => w.type === 'syntax.relation' && !w.spans.marker && anchorMemo.get(w.refs.from[0]) === outerA && anchorMemo.get(w.refs.to[0]) === inner && W(w.refs.to[0]).type === 'syntax.clause')
  for (const [id, w] of byId) {
    if (w.type === 'syntax.clause') {
      const a = anchorMemo.get(id)
      for (const r of w.refs.subject ?? []) if (!(w.role === 'S' && anchorMemo.get(r) === a)) tie(r, a, 'subj')
      let firstComp = true
      for (const r of [...(w.refs.complement ?? [])].sort((x, y) => anchorMemo.get(x) - anchorMemo.get(y))) {
        if (w.role === 'N' && firstComp && anchorMemo.get(r) === a) { firstComp = false; continue }
        tie(r, a, 'comp')
      }
    } else if (w.type === 'syntax.relation') {
      const from = W(w.refs.from[0])
      const inCoord = w.incoming.find(inc => inc.key === 'conjunct')
      if (inCoord) {
        const k = W(inCoord.from), rels = k.refs.conjunct.map(W)
        rels.sort((x, y) => anchorMemo.get(x.refs.to[0]) - anchorMemo.get(y.refs.to[0]))
        if (rels[0].id !== id) {
          if (rels[0].refs.from[0] !== w.refs.from[0]) errors.push('relcoord-from')
          tie(w.refs.to[0], anchorMemo.get(rels[0].refs.to[0]), 'conjR'); continue
        }
      }
      // a relation from a fragment to the nominal it is anchored at (role R)
      if (from.type === 'syntax.clause' && from.role === 'R' && anchorMemo.get(w.refs.from[0]) === anchorMemo.get(w.refs.to[0])) continue
      const attach = from.type === 'syntax.clause' ? 'relC' + (w.atoms.attachment === 'ambiguous' ? '~amb' : '') : from.type === 'syntax.nominal' ? 'relN' : 'relK'
      if (attach === 'relK') errors.push('relation-from-coordination')
      tie(w.refs.to[0], anchorMemo.get(w.refs.from[0]), attach)
    } else if (w.type === 'syntax.coordination') {
      const members = w.refs.conjunct.map(W)
      if (members[0].type === 'syntax.relation') continue
      const sorted = [...members].sort((x, y) => anchorMemo.get(x.id) - anchorMemo.get(y.id))
      for (const m of sorted.slice(1)) tie(m.id, anchorMemo.get(sorted[0].id), 'conj')
    }
  }
  // the arc of each anchored word: the tie of its outermost wire
  for (const [a, ids] of at) {
    const outer = outerAt(a)
    const t = tieOf.get(outer)
    for (const id of ids) if (id !== outer && tieOf.has(id) && !(tieOf.get(id).attach === 'comp' || tieOf.get(id).attach === 'subj') ) {
      // an inner wire with a tie of its own (other than being the fragment's complement) cannot be written
      const inner = tieOf.get(id)
      if (!(W(outer).type === 'syntax.coordination' && W(outer).refs.conjunct.includes(id))) errors.push('inner-tie ' + inner.attach)
    }
    const tag = tagOf(a)
    setArc(a, t ? t.head : -1, (t ? t.attach : 'root') + ':' + tag, 'anchor')
  }
  // the ellipsis must point where the decoder will look
  for (const [id, w] of byId) if (w.refs?.ellipsis) {
    const target = anchorMemo.get(w.refs.ellipsis[0]), a = anchorMemo.get(id)
    const expect = ellipsisTarget(a, heads, labels)
    if (expect !== target) errors.push('ellipsis-target')
  }
  for (let k = 0; k < n; k++) if (heads[k] === null) errors.push('uncovered')
  // a head that is no anchor
  if (errors.length) return {error: [...new Set(errors)].join(', '), words, heads, labels}
  return {words, heads, labels}
}

// The clause a fragment with ^ell shares the verb of: the first conjunct of its coordination,
// else its head.
function ellipsisTarget(a, heads, labels) {
  let h = heads[a]
  if (h === undefined || h === null || h < 0) return null
  if (labels[a].startsWith('conj:')) {
    while (h >= 0 && labels[h]?.startsWith('conj:')) h = heads[h]
  }
  return h
}

export const isWordLabel = label => WORD_LABELS.has(label)
export const attachOf = label => label.split(':')[0]
export const tagOfLabel = label => label.includes(':') ? label.slice(label.indexOf(':') + 1) : null
const isClauseTag = tag => tag !== null && tag !== ''
const isVerbTag = tag => tag in FORM_BACK

/**
 * The circuit of a labelled tree. Labels that cannot stand where they are are repaired to the
 * nearest that can (see the comments). @returns sop (valid) or throws
 */
export function treeToCircuit(text, headsIn, labelsIn) {
  const words = wordsOf(text), n = words.length
  const heads = [...headsIn], labels = [...labelsIn]
  const children = () => { const c = Array.from({length: n}, () => []); for (let k = 0; k < n; k++) if (heads[k] >= 0) c[heads[k]].push(k); return c }
  // 1. a word label never has dependents: they go to its head
  for (let round = 0; round < n + 2; round++) {
    let moved = false
    for (let k = 0; k < n; k++) { const h = heads[k]; if (h >= 0 && isWordLabel(labels[h])) { heads[k] = heads[h]; moved = true } }
    if (!moved) break
  }
  // 2. root children carry a clause; non-root children never attach as root
  for (let k = 0; k < n; k++) {
    if (heads[k] < 0) {
      if (isWordLabel(labels[k])) labels[k] = 'root:frag.' + (['mod', 'disc', 'neg', 'aux'].includes(labels[k]) ? labels[k] : 'N')
      const tag = tagOfLabel(labels[k])
      labels[k] = 'root:' + (tag === '' ? 'frag.N' : tag)
    } else if (attachOf(labels[k]) === 'root') {
      const tag = tagOfLabel(labels[k]), htag = tagOfLabel(labels[heads[k]])
      labels[k] = (isClauseTag(tag) ? (htag === '' ? 'relN' : 'relC') : (htag === '' ? 'relN' : 'comp')) + ':' + tag
    }
  }
  let ch = children()
  const tagAt = k => tagOfLabel(labels[k])
  // which wires each anchor has
  const wiresAt = new Array(n).fill(null)
  const ids = {c: 0, n: 0, r: 0, k: 0}
  const make = (type, letter) => ({id: letter + (++ids[letter]), type, slots: []})
  const out = []
  const add = (type, letter) => { const w = make(type, letter); out.push(w); return w }
  for (let k = 0; k < n; k++) {
    if (isWordLabel(labels[k])) continue
    const tag = tagAt(k)
    const at = {}
    if (isVerbTag(tag)) { at.C = add('syntax.clause', 'c'); at.C.form = FORM_BACK[tag]; at.C.verb = k }
    else if (tag.startsWith('frag.')) {
      at.C = add('syntax.clause', 'c'); at.C.form = 'fragment'
      const role = tag.slice(5).replace('^ell', '')
      at.role = role; at.ell = tag.endsWith('^ell')
      if (['N', 'S', 'R'].includes(role)) { at.N = add('syntax.nominal', 'n'); at.N.head = k }
      else (at.C.words ??= []).push([LABEL_KEY[role] ?? 'modifier', k])
    } else { at.N = add('syntax.nominal', 'n'); at.N.head = k }
    wiresAt[k] = at
  }
  // coordinations: conj children
  const isClauseAnchor = k => Boolean(wiresAt[k]?.C)
  for (let k = 0; k < n; k++) {
    if (!wiresAt[k]) continue
    for (const c of ch[k]) {
      if (attachOf(labels[c]) !== 'conj') continue
      const childClause = isClauseAnchor(c) && !(wiresAt[c].N && !isVerbTag(tagAt(c)) && wiresAt[k].N && !wiresAt[k].C)
      if (childClause) {
        if (!wiresAt[k].C) { labels[c] = 'relN:' + tagAt(c); continue }     // a clause cannot join a nominal
        wiresAt[k].CK ??= add('syntax.coordination', 'k'); wiresAt[k].CK.members ??= [wiresAt[k].C]; wiresAt[k].CK.members.push(wiresAt[c].C)
      } else {
        const nominal = wiresAt[c].N
        if (wiresAt[k].N && (!wiresAt[k].C || wiresAt[k].role === 'N' || wiresAt[k].role === 'S' || wiresAt[k].role === 'R')) {
          wiresAt[k].NK ??= add('syntax.coordination', 'k'); wiresAt[k].NK.members ??= [wiresAt[k].N]; wiresAt[k].NK.members.push(nominal ?? wiresAt[c].C)
        } else if (wiresAt[k].C) {
          // a nominal joined to a clause: it becomes a fragment conjunct
          if (!wiresAt[c].C) { wiresAt[c].C = add('syntax.clause', 'c'); wiresAt[c].C.form = 'fragment'; wiresAt[c].role = 'N'; labels[c] = 'conj:frag.N' }
          wiresAt[k].CK ??= add('syntax.coordination', 'k'); wiresAt[k].CK.members ??= [wiresAt[k].C]; wiresAt[k].CK.members.push(wiresAt[c].C)
        }
      }
    }
  }
  // a nominal coordination may hold a fragment: then it is a clause coordination
  for (let k = 0; k < n; k++) {
    const at = wiresAt[k]
    if (!at?.NK) continue
    if (at.NK.members.some(m => m.type === 'syntax.clause')) {
      at.NK.members = at.NK.members.map(m => {
        if (m.type === 'syntax.clause') return m
        const f = add('syntax.clause', 'c'); f.form = 'fragment'; f.complement = [m]; return f
      })
    }
  }
  const outer = k => { const at = wiresAt[k]; return at.CK ?? at.C ?? at.NK ?? at.N }
  const nominalOuter = k => { const at = wiresAt[k]; return at.NK ?? at.N }
  // fragments: their own nominal
  for (let k = 0; k < n; k++) {
    const at = wiresAt[k]
    if (!at?.C || at.C.verb !== undefined) continue
    if (at.role === 'N') (at.C.complement ??= []).push(nominalOuter(k))
    else if (at.role === 'S') at.C.subject = nominalOuter(k)
  }
  const relations = []
  const relationInto = new Map()     // anchor -> relation ending at its outer wire
  // the enclosing clause of a word: walk up to the first clause anchor
  const enclosingClause = k => { let h = k, guard = 0; while (h >= 0 && guard++ < n + 2) { if (wiresAt[h]?.C) return wiresAt[h].C; h = heads[h] } return null }
  // anchor arcs
  for (let k = 0; k < n; k++) {
    if (!wiresAt[k] || heads[k] < 0) continue
    const attach = attachOf(labels[k]), h = heads[k], H = wiresAt[h]
    if (attach === 'conj') continue
    if (attach === 'comp^subj') {
      const target = nominalOuter(k)
      if (H.C) (H.C.complement ??= []).push(target)
      // the subject of the clause that relates to the head clause with no marker, to the right
      const next = ch[h].filter(c => c > k && wiresAt[c]?.C?.verb !== undefined && attachOf(labels[c]).startsWith('relC') && !ch[c].some(g => labels[g] === 'mark'))[0]
      if (next !== undefined && !wiresAt[next].C.subject) wiresAt[next].C.subject = target
      if (!H.C) { const r = {from: H.N, to: target, markers: [], negs: []}; relations.push(r); relationInto.set(k, r) }
      continue
    }
    if (attach === 'subj' || attach === 'comp') {
      const target = wiresAt[k].C ? outer(k) : nominalOuter(k)
      if (H.C && target.type !== 'syntax.clause' && !(target.type === 'syntax.coordination' && target.members[0].type === 'syntax.clause')) {
        if (attach === 'subj' && !H.C.subject) H.C.subject = target
        else (H.C.complement ??= []).push(target)
        continue
      }
      const r = {from: H.C ?? H.N, to: target, markers: [], negs: []}; relations.push(r); relationInto.set(k, r); continue
    }
    if (attach.startsWith('rel') || attach === 'conjR') {
      if (attach === 'conjR' && relationInto.has(h)) {
        const first = relationInto.get(h)
        const r = {from: first.from, to: outer(k), markers: [], negs: [], amb: first.amb}; relations.push(r); relationInto.set(k, r)
        first.coord ??= {members: [first], words: []}; first.coord.members.push(r); r.coord = first.coord
        continue
      }
      const fromClause = attach.startsWith('relC') || attach === 'conjR'
      const from = fromClause ? (H.C ?? H.N) : (H.N ?? H.C)
      const r = {from, to: outer(k), markers: [], negs: [], amb: attach === 'relC~amb' && from.type === 'syntax.clause'}
      relations.push(r); relationInto.set(k, r)
    }
  }
  // fragments of role R: a relation from the fragment to its nominal
  for (let k = 0; k < n; k++) {
    const at = wiresAt[k]
    if (at?.role !== 'R') continue
    const r = {from: at.C, to: nominalOuter(k), markers: [], negs: []}; relations.push(r)
    if (!relationInto.has(k)) relationInto.set(k, r); else at.internal = r
  }
  // word labels
  const extraDiscourse = []
  for (let k = 0; k < n; k++) {
    const label = labels[k]
    if (!isWordLabel(label)) continue
    const h = heads[k], H = h >= 0 ? wiresAt[h] : null
    if (!H) { const c = out.find(w => w.type === 'syntax.clause'); extraDiscourse.push([c, k]); continue }
    if (label === 'dep' || label === 'cont') {
      if (H.N) (H.N.words ??= []).push([label === 'cont' ? 'head+' : 'dependent', k])
      else (H.C.words ??= []).push([label === 'cont' ? 'verb+' : 'modifier', k])
    } else if (LABEL_KEY[label]) {
      const C = H.C ?? enclosingClause(h)
      if (C) (C.words ??= []).push([LABEL_KEY[label], k])
      else (H.N.words ??= []).push(['dependent', k])
    } else if (label === 'mark' || label === 'rneg') {
      const r = relationInto.get(h) ?? H.internal
      if (r) (label === 'mark' ? r.markers : r.negs).push(k)
      else { const C = H.C ?? enclosingClause(h); if (C) (C.words ??= []).push([label === 'mark' ? 'modifier' : 'negation', k]); else (H.N.words ??= []).push(['dependent', k]) }
    } else if (label === 'cc') {
      // the coordination the head's wire takes part in
      let K = H.CK ?? H.NK ?? null
      if (!K && heads[h] >= 0 && attachOf(labels[h]) === 'conj') { const P = wiresAt[heads[h]]; K = (isClauseAnchor(h) && P.CK?.members.includes(H.C)) ? P.CK : (P.NK?.members.includes(H.N) ? P.NK : P.CK ?? P.NK) }
      const rc = relationInto.get(h)?.coord
      if (!K && rc) { rc.words.push(k); continue }
      if (K) (K.words ??= []).push(k)
      else { const C = H.C ?? enclosingClause(h); if (C) (C.words ??= []).push(['discourse', k]); else (H.N.words ??= []).push(['dependent', k]) }
    }
  }
  for (const [c, k] of extraDiscourse) if (c) (c.words ??= []).push(['discourse', k])
  // ellipsis
  for (let k = 0; k < n; k++) {
    const at = wiresAt[k]
    if (!at?.ell || !at.C) continue
    const t = ellipsisTarget(k, heads, labels)
    if (t !== null && t >= 0 && wiresAt[t]?.C?.verb !== undefined && wiresAt[t].C !== at.C) at.C.ellipsis = wiresAt[t].C
  }
  // spans: a head or verb run continues only over adjacent words
  const runs = list => { const sorted = [...list].sort((a, b) => a - b), spans = []; for (const k of sorted) { const last = spans.at(-1); if (last && last[1] === k - 1) last[1] = k; else spans.push([k, k]) } return spans }
  const wires = []
  for (const w of out) {
    const slots = []
    if (w.type === 'syntax.clause') {
      slots.push({key: 'form', value: w.form})
      let extra = []
      if (w.verb !== undefined) {
        const cont = (w.words ?? []).filter(x => x[0] === 'verb+').map(x => x[1]).sort((a, b) => a - b)
        let end = w.verb
        for (const c of cont) if (c === end + 1) end = c; else extra.push(c)
        slots.push({key: 'verb', span: [w.verb, end]})
      }
      for (const [key, k] of w.words ?? []) if (key !== 'verb+') slots.push({key, span: [k, k]})
      for (const k of extra) slots.push({key: 'modifier', span: [k, k]})
      if (w.subject) slots.push({key: 'subject', ref: w.subject.id})
      for (const c of w.complement ?? []) slots.push({key: 'complement', ref: c.id})
      if (w.ellipsis) slots.push({key: 'ellipsis', ref: w.ellipsis.id})
    } else if (w.type === 'syntax.nominal') {
      const cont = (w.words ?? []).filter(x => x[0] === 'head+').map(x => x[1]).sort((a, b) => a - b)
      let end = w.head; const extra = []
      for (const c of cont) if (c === end + 1) end = c; else extra.push(c)
      slots.push({key: 'head', span: [w.head, end]})
      for (const [key, k] of w.words ?? []) if (key !== 'head+') slots.push({key, span: [k, k]})
      for (const k of extra) slots.push({key: 'dependent', span: [k, k]})
    } else if (w.type === 'syntax.coordination') {
      const members = [...new Set(w.members ?? [])]
      if (members.length < 2) { w.dead = true; for (const k of w.words ?? []) (enclosingClause(k)?.words ?? []).push(['discourse', k]); continue }
      for (const m of members) slots.push({key: 'conjunct', ref: m.id})
      for (const span of runs(w.words ?? [])) slots.push({key: 'conjunction', span})
    }
    wires.push({id: w.id, type: w.type, slots, src: w})
  }
  // a coordination that died hands its words on: re-collect them
  for (const w of wires) if (w.type === 'syntax.clause') {
    const src = w.src
    for (const [key, k] of src.words ?? []) if (!w.slots.some(s => s.span && s.span[0] === k && s.key === key) && key === 'discourse') w.slots.push({key, span: [k, k]})
  }
  // a coordination referenced where its first conjunct was dead: point to the wire itself
  const live = new Set(wires.map(w => w.id))
  const deadMap = new Map(out.filter(w => w.dead).map(w => [w.id, (w.members ?? [])[0]]))
  const resolve = w => { let x = w, guard = 0; while (x && deadMap.has(x.id) && guard++ < 5) x = deadMap.get(x.id); return x }
  for (const w of wires) for (const s of w.slots) if (s.ref && !live.has(s.ref)) { const r = resolve(out.find(o => o.id === s.ref)); s.ref = r?.id }
  let rk = 0
  const relWires = new Map()
  for (const r of relations) {
    const from = resolve(r.from), to = resolve(r.to)
    if (!from || !to || from === to) { for (const k of [...r.markers, ...r.negs]) { const c = enclosingClause(k); if (c) { const cw = wires.find(w => w.id === c.id); cw.slots.push({key: 'modifier', span: [k, k]}) } } continue }
    const slots = [{key: 'from', ref: from.id}, {key: 'to', ref: to.id}]
    for (const span of runs(r.markers)) slots.push({key: 'marker', span})
    for (const k of r.negs) slots.push({key: 'negation', span: [k, k]})
    if (r.amb) slots.push({key: 'attachment', value: 'ambiguous'})
    const wire = {id: 'r' + (++rk), type: 'syntax.relation', slots}
    wires.push(wire); relWires.set(r, wire)
  }
  const doneCoords = new Set()
  for (const r of relations) {
    if (!r.coord || doneCoords.has(r.coord)) continue
    doneCoords.add(r.coord)
    const members = r.coord.members.map(m => relWires.get(m)).filter(Boolean)
    if (members.length < 2) { for (const k of r.coord.words) { const c = enclosingClause(k); if (c) wires.find(w => w.id === c.id).slots.push({key: 'discourse', span: [k, k]}) } continue }
    const slots = members.map(m => ({key: 'conjunct', ref: m.id}))
    for (const span of runs(r.coord.words)) slots.push({key: 'conjunction', span})
    wires.push({id: 'k' + (++ids.k), type: 'syntax.coordination', slots})
  }
  // subject is single: a second one is a complement
  for (const w of wires) if (w.type === 'syntax.clause') {
    const subs = w.slots.filter(s => s.key === 'subject')
    for (const s of subs.slice(1)) s.key = 'complement'
    if (w.slots.find(s => s.key === 'form').value === 'fragment' && w.slots.some(s => s.key === 'ellipsis') && !w.slots.some(s => s.key === 'ellipsis' && s.ref)) w.slots = w.slots.filter(s => s.key !== 'ellipsis')
  }
  // wires referenced by nothing that cannot stand alone get tied: a lone nominal becomes a fragment
  const referenced = new Set(wires.flatMap(w => w.slots.filter(s => s.ref).map(s => s.ref)))
  for (const w of [...wires]) if (w.type === 'syntax.nominal' && !referenced.has(w.id)) wires.push({id: 'c' + (++ids.c), type: 'syntax.clause', slots: [{key: 'form', value: 'fragment'}, {key: 'complement', ref: w.id}]})
  for (const w of wires) delete w.src
  return writeCircuit(text, wires.map(w => ({id: w.id, type: w.type, slots: w.slots.filter(s => s.ref !== undefined ? s.ref : true)})))
}
