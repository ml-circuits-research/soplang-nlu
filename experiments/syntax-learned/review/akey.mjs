// unjudged circuits of each prototype: same agreementKey (rules.md's either-way choices) as a known accepted / rejected circuit?
import {readFileSync, readdirSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm, readRegistry, readLabels, readLabelsBefore, agreementKey, relaxedCore} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const round = 'eval-results/2026-11-27-syntax-benchmark-random'
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const known = new Map()
const add = (text, sop, verdict) => { if (sop) (known.get(text) ?? known.set(text, []).get(text)).push({sop, verdict}) }
const dir = root + round + '/judging/'
for (const n of readdirSync(dir).filter(n => /^verdicts-\d+\.jsonl$/u.test(n))) {
  const packet = new Map(lines(dir + n.replace('verdicts', 'packet')).map(r => [r.n, r]))
  for (const v of lines(dir + n)) { const r = packet.get(v.n); if (r) add(r.text, r.sop, v.grade === 'L8' ? 'accepted' : 'rejected') }
}
const registry = readRegistry(), labels = readLabels(), before = readLabelsBefore(root + round, new Map())
const cache = new Map()
const keysOf = text => {
  if (cache.has(text)) return cache.get(text)
  const ks = [...(known.get(text) ?? [])]
  for (const [, row] of registry.byText.get(text) ?? []) ks.push({sop: row.sop, verdict: row.verdict})
  if (labels.get(text)) ks.push({sop: labels.get(text).label, verdict: 'accepted'})
  if (before.get(text)) ks.push({sop: before.get(text).label, verdict: 'accepted'})
  const out = ks.map(k => { let key = null; try { key = agreementKey(text, k.sop) } catch {} return {...k, key, relaxed: relaxedCore(normalForm(text, k.sop)?.core)} })
  cache.set(text, out); return out
}
// precision check of the key on judged data: pairs of judged circuits of one message with equal keys, do verdicts agree?
let agree = 0, disagree = 0
for (const [text, ks0] of known) { const ks = keysOf(text).filter(k => k.key); for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (ks[i].key === ks[j].key && normalForm(text, ks[i].sop)?.core !== normalForm(text, ks[j].sop)?.core) { if (ks[i].verdict === ks[j].verdict) agree++; else disagree++ } }
console.log('judged pairs with equal agreementKey but different core (benchmark messages): same verdict', agree, 'different verdict', disagree)
for (const name of ['parser', 'ft-gold2', 'ft-silver']) {
  const rows = lines(`unjudged-${name}.jsonl`)
  const c = {key: {accepted: 0, rejected: 0, none: 0}, relaxed: {accepted: 0, rejected: 0, none: 0}}
  for (const r of rows) {
    let key = null; try { key = agreementKey(r.text, r.sop) } catch {}
    const rel = relaxedCore(normalForm(r.text, r.sop)?.core)
    const ks = keysOf(r.text)
    const hk = ks.filter(k => k.key && k.key === key).map(k => k.verdict), hr = ks.filter(k => k.relaxed && k.relaxed === rel).map(k => k.verdict)
    c.key[hk.includes('accepted') ? 'accepted' : hk.length ? 'rejected' : 'none']++
    c.relaxed[hr.includes('accepted') ? 'accepted' : hr.length ? 'rejected' : 'none']++
  }
  console.log(name, rows.length, 'agreementKey ~', JSON.stringify(c.key), ' lib relaxedCore ~', JSON.stringify(c.relaxed))
}
