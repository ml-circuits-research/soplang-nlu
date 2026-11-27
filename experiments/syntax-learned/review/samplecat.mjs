import {readFileSync, readdirSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm, readRegistry, readLabels, readLabelsBefore, agreementKey} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const round = 'eval-results/2026-11-27-syntax-benchmark-random'
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const known = new Map(); const add = (t, s, v) => { if (s) (known.get(t) ?? known.set(t, []).get(t)).push({sop: s, verdict: v}) }
const dir = root + round + '/judging/'
for (const n of readdirSync(dir).filter(n => /^verdicts-\d+\.jsonl$/u.test(n))) { const p = new Map(lines(dir + n.replace('verdicts', 'packet')).map(r => [r.n, r])); for (const v of lines(dir + n)) { const r = p.get(v.n); if (r) add(r.text, r.sop, v.grade === 'L8' ? 'accepted' : 'rejected') } }
const registry = readRegistry(), labels = readLabels(), before = readLabelsBefore(root + round, new Map())
for (const name of ['parser', 'ft-gold2']) {
  const rows = lines(`unjudged-${name}.jsonl`)
  let seed = 20261127; const rng = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296 }
  const order = rows.map((_, k) => k); for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [order[k], order[j]] = [order[j], order[k]] }
  const out = []
  for (const r of order.slice(0, 20).map(k => rows[k])) {
    const ks = [...(known.get(r.text) ?? [])]; for (const [, row] of registry.byText.get(r.text) ?? []) ks.push({sop: row.sop, verdict: row.verdict})
    if (labels.get(r.text)) ks.push({sop: labels.get(r.text).label, verdict: 'accepted'}); if (before.get(r.text)) ks.push({sop: before.get(r.text).label, verdict: 'accepted'})
    let key = null; try { key = agreementKey(r.text, r.sop) } catch {}
    const hits = ks.filter(k => { try { return key && agreementKey(r.text, k.sop) === key } catch { return false } }).map(k => k.verdict)
    out.push(hits.includes('accepted') ? 'A' : hits.length ? 'R' : '-')
  }
  console.log(name, out.map((c, i) => `${i + 1}:${c}`).join(' '))
}
