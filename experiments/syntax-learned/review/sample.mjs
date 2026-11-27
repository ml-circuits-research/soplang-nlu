// 20 random unjudged circuits of a prototype, each with the diff to the nearest known circuit of the message.
//   node sample.mjs <name> <seed>
import {readFileSync, readdirSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm, readRegistry, readLabelsBefore} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const round = 'eval-results/2026-11-27-syntax-benchmark-random'
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const [name, seedArg, countArg] = process.argv.slice(2)
const rows = lines(`unjudged-${name}.jsonl`)
let seed = Number(seedArg ?? 7); const rng = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296 }
const order = rows.map((_, k) => k); for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [order[k], order[j]] = [order[j], order[k]] }
const pick = order.slice(0, Number(countArg ?? 20)).map(k => rows[k])
const known = new Map()
const add = (text, sop, verdict, note) => { if (!sop) return; (known.get(text) ?? known.set(text, []).get(text)).push({sop, verdict, note}) }
const dir = root + round + '/judging/'
const want = new Set(pick.map(r => r.text))
for (const n of readdirSync(dir).filter(n => /^verdicts-\d+\.jsonl$/u.test(n))) {
  const packet = new Map(lines(dir + n.replace('verdicts', 'packet')).map(r => [r.n, r]))
  for (const v of lines(dir + n)) { const r = packet.get(v.n); if (r && want.has(r.text)) add(r.text, r.sop, v.grade, v.note) }
}
const registry = readRegistry()
for (const t of want) for (const [, row] of registry.byText.get(t) ?? []) add(t, row.sop, row.verdict === 'accepted' ? 'L8(reg)' : (row.grade ?? 'rej') + '(reg)', row.note)
const before = readLabelsBefore(root + round, new Map())
for (const t of want) if (before.get(t)) add(t, before.get(t).label, 'L8(label-before)', '')
const norm = (t, s) => (normalForm(t, s)?.sop ?? s).split('\n').map(l => l.replace(/^@\S+ /u, '').replace('syntax.', ''))
let i = 0
for (const r of pick) {
  i++
  const mine = normalForm(r.text, r.sop).sop.split('\n')
  console.log(`\n### ${i}. ${r.text}`)
  console.log(mine.map(l => '   ' + l.replace('syntax.', '')).join('\n'))
  // nearest known: fewest differing lines
  const ks = (known.get(r.text) ?? []).map(k => { const ns = normalForm(r.text, k.sop)?.sop.split('\n') ?? []; const a = new Set(mine), b = new Set(ns); const minus = mine.filter(l => !b.has(l)), plus = ns.filter(l => !a.has(l)); return {...k, minus, plus, d: minus.length + plus.length} }).sort((x, y) => x.d - y.d)
  for (const k of ks.slice(0, 2)) {
    console.log(`  vs known ${k.verdict} (d=${k.d})${k.note ? ' NOTE: ' + k.note.slice(0, 200) : ''}`)
    for (const l of k.minus) console.log('     mine: ' + l.replace('syntax.', ''))
    for (const l of k.plus) console.log('     known: ' + l.replace('syntax.', ''))
  }
}
