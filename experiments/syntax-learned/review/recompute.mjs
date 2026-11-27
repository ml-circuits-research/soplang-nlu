// Independent recomputation of the benchmark verdicts of the two prototypes and the baselines, with the logic of
// scratchpad/vss-registry.mjs (judged in the run, registry, label now, label before the run), by core.
//   node recompute.mjs
import {readFileSync, readdirSync, existsSync, writeFileSync, statSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const S = '/tmp/claude-1000/-home-salboaie-work-sopworlds/e235462f-8553-42ea-b357-85307b023a32/scratchpad/learned/'
const {normalForm, readRegistry, lookup, readLabels, readLabelsBefore, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {validateSyntax} = await import(root + 'lib/syntax.mjs')
const round = 'eval-results/2026-11-27-syntax-benchmark-random'
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const sample = readSample(root + round + '/sample.json.gz')
const sampleTexts = new Set(sample.map(r => r.text))
const registry = readRegistry()
const labels = readLabels()
const before = readLabelsBefore(root + round, new Map())
const judged = new Map()
const dir = root + round + '/judging/'
let nVerdictFiles = 0, latest = 0
for (const name of readdirSync(dir).filter(name => /^verdicts-\d+\.jsonl$/u.test(name))) {
  nVerdictFiles++; latest = Math.max(latest, statSync(dir + name).mtimeMs)
  const packet = new Map(lines(dir + name.replace('verdicts', 'packet')).map(row => [row.n, row]))
  for (const verdict of lines(dir + name)) { const row = packet.get(verdict.n); if (row) { if (!judged.has(row.text)) judged.set(row.text, new Map()); judged.get(row.text).set(normalForm(row.text, row.sop)?.core, verdict) } }
}
const verdictOf = (text, core) => {
  if (!core) return 'invalid'
  const here = judged.get(text)?.get(core)
  if (here) return here.grade === 'L8' ? 'accepted' : 'rejected'
  const known = lookup(registry, text, core)?.verdict
  if (known) return known
  return labels.get(text)?.core === core || before.get(text)?.core === core ? 'accepted' : 'unjudged'
}
// the same without "label now" (the task's own definition)
const verdictNoNow = (text, core) => {
  if (!core) return 'invalid'
  const here = judged.get(text)?.get(core)
  if (here) return here.grade === 'L8' ? 'accepted' : 'rejected'
  const known = lookup(registry, text, core)?.verdict
  if (known) return known
  return before.get(text)?.core === core ? 'accepted' : 'unjudged'
}
const files = {
  vss: root + round + '/vss.jsonl', spacy: root + round + '/spacy.jsonl', distilbert: root + round + '/distilbert.jsonl',
  parser: S + 'parser/bench-x-e15-g3.jsonl',
  'ft-gold2': S + 'spacy-finetune/runs/gold2-bench-cpu.jsonl', 'ft-silver': S + 'spacy-finetune/runs/silver-bench-cpu.jsonl',
}
const res = {}, verd = {}, cores = {}
for (const [name, file] of Object.entries(files)) {
  const rows = lines(file)
  const texts = new Set(rows.map(r => r.text))
  const missing = [...sampleTexts].filter(t => !texts.has(t)).length, extra = [...texts].filter(t => !sampleTexts.has(t)).length
  const c = {n: rows.length, distinct: texts.size, missing, extra, accepted: 0, rejected: 0, unjudged: 0, invalid: 0, acceptedNoNow: 0, notValid: 0}
  verd[name] = new Map(); cores[name] = new Map()
  for (const r of rows) {
    const core = r.sop ? normalForm(r.text, r.sop)?.core ?? null : null
    let valid = true
    try { const v = validateSyntax(r.text, r.sop); if (!v?.valid) valid = false } catch { valid = false }
    if (!valid) c.notValid++
    const v = verdictOf(r.text, core)
    c[v]++; if (verdictNoNow(r.text, core) === 'accepted') c.acceptedNoNow++
    verd[name].set(r.text, v); cores[name].set(r.text, core)
  }
  c.share = +(100 * c.accepted / c.n).toFixed(1)
  res[name] = c
}
console.log('verdict files', nVerdictFiles, 'latest', new Date(latest).toISOString(), 'vss.jsonl', statSync(files.vss).mtime.toISOString())
console.table(res)
const cross = (a, b) => { const t = {}; for (const text of sampleTexts) { const k = verd[a].get(text) + '/' + verd[b].get(text); t[k] = (t[k] ?? 0) + 1 } return t }
console.log('parser/vss', cross('parser', 'vss'))
console.log('ft-gold2/spacy', cross('ft-gold2', 'spacy'))
console.log('ft-silver/spacy', cross('ft-silver', 'spacy'))
const same = (a, b) => [...sampleTexts].filter(t => cores[a].get(t) && cores[a].get(t) === cores[b].get(t)).length
console.log('same core parser~vss', same('parser', 'vss'), 'parser~spacy', same('parser', 'spacy'), 'parser~distilbert', same('parser', 'distilbert'), 'gold2~spacy', same('ft-gold2', 'spacy'), 'silver~spacy', same('ft-silver', 'spacy'), 'gold2~vss', same('ft-gold2', 'vss'), 'silver~vss', same('ft-silver', 'vss'))
// on the messages where both sides are judged
for (const [a, b] of [['parser', 'vss'], ['ft-gold2', 'spacy'], ['ft-silver', 'spacy']]) {
  let n = 0, aa = 0, bb = 0
  for (const t of sampleTexts) { const x = verd[a].get(t), y = verd[b].get(t); if (x !== 'unjudged' && y !== 'unjudged') { n++; aa += x === 'accepted'; bb += y === 'accepted' } }
  console.log(`both judged ${a}/${b}: n=${n} ${a} ${aa} ${b} ${bb}`)
  // break-even share of the unjudged
  const unj = res[a].unjudged, need = res[b].accepted - res[a].accepted
  console.log(`  ${a} unjudged ${unj}; to reach ${b} needs ${need} of them = ${(100 * need / unj).toFixed(1)}%`)
}
// unjudged lists, with the other side's verdict
for (const [a, b] of [['parser', 'vss'], ['ft-gold2', 'spacy'], ['ft-silver', 'spacy']]) {
  const rows = lines(files[a]).filter(r => verd[a].get(r.text) === 'unjudged').map(r => ({text: r.text, sop: r.sop, other: verd[b].get(r.text), otherSop: lines.cache?.[b]?.get(r.text)}))
  writeFileSync(S + `review/unjudged-${a}.jsonl`, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
}
