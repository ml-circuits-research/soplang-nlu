// The holding tree of one circuit (same construction as export-trees.mjs), as a function.
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {parseCircuit, validateSyntax, wordsOf} = await import(root + 'lib/syntax.mjs')
export function holdingTree(text, sop) {
  const n = wordsOf(text).length
  const check = validateSyntax(text, sop)
  if (!check.valid) return null
  const wires = parseCircuit(sop), byId = new Map(wires.map(w => [w.id, w]))
  const refsOf = w => w.slots.filter(s => s[1].startsWith('$')).map(([key, v]) => ({key, id: v.slice(1)}))
  const ownFirst = new Map(), own = new Map(wires.map(w => [w.id, []]))
  for (const {wire, key, first, last} of check.placements) { for (let i = first; i <= last; i++) own.get(wire).push([i, key]); ownFirst.set(wire, Math.min(ownFirst.get(wire) ?? Infinity, first)) }
  const relCoord = new Map()
  for (const w of wires) if (w.type === 'syntax.coordination') for (const r of refsOf(w)) if (byId.get(r.id)?.type === 'syntax.relation') relCoord.set(r.id, w.id)
  const cands = new Map(wires.map(w => [w.id, []])), pointers = []
  for (const w of wires) for (const r of refsOf(w)) {
    if (w.type === 'syntax.relation' && r.key === 'from') { const k = relCoord.get(w.id); if (k) { if (!cands.get(k).some(c => c.parent === r.id)) cands.get(k).push({parent: r.id, key: 'rel'}); cands.get(w.id).push({parent: k, key: 'conjunct'}) } else cands.get(w.id).push({parent: r.id, key: 'rel'}); continue }
    if (r.key === 'ellipsis') { pointers.push({from: w.id, key: 'ellipsis', to: r.id}); continue }
    if (w.type === 'syntax.coordination' && byId.get(r.id)?.type === 'syntax.relation') continue
    cands.get(r.id).push({parent: w.id, key: r.key})
  }
  const holder = new Map(), hkey = new Map()
  for (const w of wires) { const c = cands.get(w.id); if (!c.length) { holder.set(w.id, 'M'); continue }
    const s = [...c].sort((a, b) => (ownFirst.get(a.parent) ?? 1e9) - (ownFirst.get(b.parent) ?? 1e9)); holder.set(w.id, s[0].parent); hkey.set(w.id, s[0].key)
    for (const e of s.slice(1)) pointers.push({from: e.parent, key: e.key, to: w.id}) }
  let cyc = false
  for (const w of wires) { let x = w.id, k = 0; while (x !== 'M') { x = holder.get(x); if (++k > 200) { cyc = true; break } } }
  if (cyc) return null
  const kids = new Map(wires.map(w => [w.id, []])); const top = []
  for (const w of wires) holder.get(w.id) === 'M' ? top.push(w.id) : kids.get(holder.get(w.id)).push(w.id)
  const memo = new Map(); const start = id => { if (memo.has(id)) return memo.get(id); let a = ownFirst.get(id) ?? Infinity; for (const c of kids.get(id)) a = Math.min(a, start(c)); memo.set(id, a); return a }
  const idx = new Map(wires.map((w, i) => [w.id, i]))
  return ({n, len: n, words: wordsOf(text).map(x => x.text.toLowerCase()), top: top.map(id => idx.get(id)),
    wires: wires.map(w => {
      const form = w.slots.find(s => s[0] === 'form')?.[1]
      return {t: w.type.slice(7) + (form ? '.' + form : ''), amb: w.slots.some(s => s[0] === 'attachment') ? 1 : 0, a: start(w.id), w: own.get(w.id),
        c: kids.get(w.id).map(c => [hkey.get(c), idx.get(c)]), p: pointers.filter(q => q.from === w.id).map(q => [q.key, idx.get(q.to)])}
    })})
}
