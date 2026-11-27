// Export the holding trees of the labels (outside the benchmark) for the M1 probe (m1probe.py).
// Per message: words (lowercased), wires [{t: type/form, amb, w: [[pos, key]], c: [[key, child]], p: [[key, target]], a: anchor}], top [ids].
// Sample: every label of 25+ words, plus a deterministic random sample of the rest (argv[2], default 6000).
import {writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readLabels, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {parseCircuit, validateSyntax, wordsOf} = await import(root + 'lib/syntax.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const want = Number(process.argv[2] ?? 6000)
const all = [...readLabels(process.env.SYNTACTIC_DIR || undefined)].filter(([text]) => !bench.has(norm(text)))   // SYNTACTIC_DIR: frozen snapshot; TREES_OUT: output path; argv[2] = 'all' keeps every label
let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const out = []
for (const [text, row] of all) {
  const n = wordsOf(text).length
  if (n < 25 && rnd() > want / all.length) continue
  const sop = row.label, check = validateSyntax(text, sop)
  if (!check.valid) continue
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
  if (cyc) continue
  const kids = new Map(wires.map(w => [w.id, []])); const top = []
  for (const w of wires) holder.get(w.id) === 'M' ? top.push(w.id) : kids.get(holder.get(w.id)).push(w.id)
  const memo = new Map(); const start = id => { if (memo.has(id)) return memo.get(id); let a = ownFirst.get(id) ?? Infinity; for (const c of kids.get(id)) a = Math.min(a, start(c)); memo.set(id, a); return a }
  const idx = new Map(wires.map((w, i) => [w.id, i]))
  out.push({n, len: n, words: wordsOf(text).map(x => x.text.toLowerCase()), top: top.map(id => idx.get(id)),
    wires: wires.map(w => {
      const form = w.slots.find(s => s[0] === 'form')?.[1]
      return {t: w.type.slice(7) + (form ? '.' + form : ''), amb: w.slots.some(s => s[0] === 'attachment') ? 1 : 0, a: start(w.id), w: own.get(w.id),
        c: kids.get(w.id).map(c => [hkey.get(c), idx.get(c)]), p: pointers.filter(q => q.from === w.id).map(q => [q.key, idx.get(q.to)])}
    })})
}
writeFileSync(process.env.TREES_OUT || new URL('./trees-h.json', import.meta.url), JSON.stringify(out))
console.log('exported', out.length)
console.log('messages', out.length, '25+ words', out.filter(x => x.n >= 25).length)
