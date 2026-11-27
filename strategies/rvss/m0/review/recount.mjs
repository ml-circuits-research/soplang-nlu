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
const files = {vss: root + round + "/vss.jsonl", spacy: root + round + "/spacy.jsonl", distilbert: root + round + "/distilbert.jsonl"}
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
// split of "accepted" by where the verdict came from, and by label-before group
for (const name of Object.keys(files)) {
  const src = {inRun: 0, registry: 0, labelNow: 0, labelBefore: 0}, grp = {withLabelBefore: [0, 0], without: [0, 0]}
  for (const r of lines(files[name])) {
    const core = cores[name].get(r.text); if (!core) continue
    const here = judged.get(r.text)?.get(core)
    const g = before.has(r.text) ? 'withLabelBefore' : 'without'; grp[g][1]++
    if (verd[name].get(r.text) === 'accepted') grp[g][0]++
    if (verd[name].get(r.text) !== 'accepted') continue
    if (here) src.inRun++; else if (lookup(registry, r.text, core)?.verdict) src.registry++; else if (labels.get(r.text)?.core === core) src.labelNow++; else src.labelBefore++
  }
  console.log(name, 'accepted by source', src, 'by group', grp)
}
