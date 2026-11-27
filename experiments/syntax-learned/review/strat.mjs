// acceptance by near-duplicate level, for prototypes and baselines (verdicts recomputed as in recompute.mjs)
import {readFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const S = '/tmp/claude-1000/-home-salboaie-work-sopworlds/e235462f-8553-42ea-b357-85307b023a32/scratchpad/learned/'
const {normalForm, readRegistry, lookup, readLabels, readLabelsBefore} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const round = 'eval-results/2026-11-27-syntax-benchmark-random'
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const {readdirSync} = await import('node:fs')
const registry = readRegistry(), labels = readLabels(), before = readLabelsBefore(root + round, new Map())
const judged = new Map(), dir = root + round + '/judging/'
for (const name of readdirSync(dir).filter(n => /^verdicts-\d+\.jsonl$/u.test(n))) {
  const packet = new Map(lines(dir + name.replace('verdicts', 'packet')).map(r => [r.n, r]))
  for (const v of lines(dir + name)) { const r = packet.get(v.n); if (r) { if (!judged.has(r.text)) judged.set(r.text, new Map()); judged.get(r.text).set(normalForm(r.text, r.sop)?.core, v) } }
}
const verdictOf = (text, core) => { if (!core) return 'invalid'; const h = judged.get(text)?.get(core); if (h) return h.grade === 'L8' ? 'accepted' : 'rejected'; const k = lookup(registry, text, core)?.verdict; if (k) return k; return labels.get(text)?.core === core || before.get(text)?.core === core ? 'accepted' : 'unjudged' }
const levels = JSON.parse(readFileSync('leak-levels.json', 'utf8'))
const files = {vss: root + round + '/vss.jsonl', spacy: root + round + '/spacy.jsonl', distilbert: root + round + '/distilbert.jsonl', parser: S + 'parser/bench-x-e15-g3.jsonl', 'ft-gold2': S + 'spacy-finetune/runs/gold2-bench-cpu.jsonl', 'ft-silver': S + 'spacy-finetune/runs/silver-bench-cpu.jsonl'}
const near = l => ['exact', 'case-space', 'punct-space', 'one-char-edit', 'one-word-edit'].includes(l) ? 'near-dup' : 'no near-dup'
for (const key of ['parser train (used: projective, encodable)', 'ft gold-train corpus (gold2)']) {
  console.log('\nstrata by near-duplicates in:', key)
  for (const [name, file] of Object.entries(files)) {
    const t = {}
    for (const r of lines(file)) { const g = near(levels[key][r.text]) + (before.has(r.text) ? '/labelled-before' : '/unlabelled'); const v = verdictOf(r.text, r.sop ? normalForm(r.text, r.sop)?.core : null); t[g] ??= {n: 0, accepted: 0, rejected: 0, unjudged: 0}; t[g].n++; t[g][v]++ }
    console.log(name.padEnd(11), Object.entries(t).sort().map(([g, c]) => `${g}: n=${c.n} acc ${(100 * c.accepted / c.n).toFixed(1)}% rej ${(100 * c.rejected / c.n).toFixed(1)}% unj ${(100 * c.unjudged / c.n).toFixed(1)}%`).join(' | '))
  }
}
